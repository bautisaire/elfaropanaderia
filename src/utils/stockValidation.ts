import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getDerivedStockFromParent, getRawStockQuantity } from "./cartStock";
import { withTimeout } from "./withTimeout";

export interface StockValidationResult {
    isValid: boolean;
    outOfStockItems: {
        id: string;
        name: string;
        requested: number;
        available: number;
    }[];
}

const getBaseId = (item: any) => {
    if (item.baseProductId) return String(item.baseProductId);
    if (item.productId) return String(item.productId);

    let variantName = item.variant;
    if (!variantName) {
        const match = item.name ? item.name.match(/\(([^)]+)\)$/) : null;
        if (match) variantName = match[1];
    }

    if (variantName) {
        const suffix = `-${variantName}`;
        if (String(item.id).endsWith(suffix)) {
            return String(item.id).substring(0, String(item.id).length - suffix.length);
        }
    }

    const parts = String(item.id).split('-');
    if (parts.length > 1 && variantName && parts[parts.length - 1] === variantName) {
        return parts.slice(0, -1).join('-');
    }

    return String(item.id);
};

// Es solo un chequeo previo para avisarle al cliente antes de mandar el pedido: el stock
// real se valida y descuenta en el backend (processOrder) dentro de una transacción.
// Por eso, si Firestore no responde a tiempo, no trabamos el checkout: lo damos por
// válido y que decida el backend.
const VALIDATION_TIMEOUT_MS = 4000;

export const validateCartStock = async (cart: any[]): Promise<StockValidationResult> => {
    try {
        return await withTimeout(checkCartStock(cart), VALIDATION_TIMEOUT_MS, "validateCartStock");
    } catch (e) {
        console.warn("No se pudo verificar el stock antes del pedido, lo valida el backend:", e);
        return { isValid: true, outOfStockItems: [] };
    }
};

const checkCartStock = async (cart: Parameters<typeof validateCartStock>[0]): Promise<StockValidationResult> => {
    const outOfStockItems = [];

    // Aggregate quantities by base product and variant
    const aggregatedQuantities = new Map<string, number>();
    for (const item of cart) {
        const baseId = getBaseId(item);
        let variantName = item.variant || "";
        if (!variantName && item.name && item.name.includes('(')) {
            const match = item.name.match(/\(([^)]+)\)$/);
            if (match) variantName = match[1];
        }
        const key = `${baseId}-${variantName}`;
        aggregatedQuantities.set(key, (aggregatedQuantities.get(key) || 0) + (item.quantity || 1));
    }

    // 1. Fetch all base product docs in parallel (instead of one-by-one per cart item)
    const uniqueBaseIds = Array.from(new Set(cart.filter(item => !item.isRaffleTicket).map(getBaseId)));
    const baseSnaps = await Promise.allSettled(
        uniqueBaseIds.map(id => getDoc(doc(db, "products", id)))
    );
    const baseDataMap = new Map<string, any>();
    // Lecturas que fallaron (ej. "client is offline"): no sabemos el stock, así que no
    // las marcamos como agotadas — eso le vaciaba el carrito al cliente por un problema de red.
    const unreadableIds = new Set<string>();
    baseSnaps.forEach((result, i) => {
        if (result.status === 'rejected') {
            unreadableIds.add(uniqueBaseIds[i]);
        } else if (result.value.exists()) {
            baseDataMap.set(uniqueBaseIds[i], result.value.data());
        }
    });

    // 2. Fetch parent docs (for derived/pack products) in parallel
    const parentIds = new Set<string>();
    baseDataMap.forEach(data => {
        if (data.stockDependency?.productId) parentIds.add(data.stockDependency.productId);
    });
    const uniqueParentIds = Array.from(parentIds);
    const parentSnaps = await Promise.allSettled(
        uniqueParentIds.map(id => getDoc(doc(db, "products", id)))
    );
    const parentDataMap = new Map<string, any>();
    parentSnaps.forEach((result, i) => {
        if (result.status === 'rejected') {
            unreadableIds.add(uniqueParentIds[i]);
        } else if (result.value.exists()) {
            parentDataMap.set(uniqueParentIds[i], result.value.data());
        }
    });

    for (const item of cart) {
        if (item.isRaffleTicket) continue;

        const baseId = getBaseId(item);
        if (unreadableIds.has(baseId)) continue;
        const isVariant = item.variant || (item.name && item.name.includes('('));
        const data = baseDataMap.get(baseId);

        let variantName = item.variant || "";
        if (!variantName && item.name && item.name.includes('(')) {
            const match = item.name.match(/\(([^)]+)\)$/);
            if (match) variantName = match[1];
        }

        if (data) {
            let available = 0;

            if (data.stockDependency?.productId) {
                if (unreadableIds.has(data.stockDependency.productId)) continue;
                const parentData = parentDataMap.get(data.stockDependency.productId) || null;
                const parentHasVariants = parentData?.variants && parentData.variants.length > 0;
                const childHasVariants = data.variants && data.variants.length > 0;

                const parentStock = parentData
                    ? getRawStockQuantity(
                          {
                              id: data.stockDependency.productId,
                              name: '',
                              price: 0,
                              image: '',
                              stockQuantity: parentData.stockQuantity,
                              stock: parentData.stock,
                              variants: parentData.variants,
                              unitType: parentData.unitType || 'unit',
                          },
                          childHasVariants && parentHasVariants ? variantName : undefined
                      )
                    : 0;
                const parentProduct = parentData
                    ? { unitType: parentData.unitType || 'unit' as const }
                    : undefined;
                const childProduct = { unitType: data.unitType || 'unit' as const };
                available = getDerivedStockFromParent(
                    parentStock,
                    Number(data.stockDependency.unitsToDeduct) || 1,
                    parentProduct as any,
                    childProduct as any
                );
            } else if (isVariant && data.variants) {
                if (variantName) {
                    const variant = data.variants.find((v: any) => v.name === variantName);
                    if (variant) {
                        available = Number(variant.stockQuantity || 0);
                    }
                }
            } else {
                available = Number(data.stockQuantity || 0);
            }

            const key = `${baseId}-${variantName}`;
            const totalRequested = aggregatedQuantities.get(key) || item.quantity;

            if (totalRequested > available) {
                outOfStockItems.push({
                    id: item.id,
                    name: item.name,
                    requested: totalRequested,
                    available: available
                });
            }
        } else {
            // Product deleted: treat as 0 stock
            outOfStockItems.push({
                id: item.id,
                name: item.name,
                requested: item.quantity,
                available: 0
            });
        }
    }

    return {
        isValid: outOfStockItems.length === 0,
        outOfStockItems
    };
};
