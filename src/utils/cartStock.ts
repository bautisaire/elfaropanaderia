import type { Product } from "../context/CartContext";

/** Stock bruto del producto (kg con decimales o unidades enteras). */
export function getRawStockQuantity(product: Product | undefined): number {
    if (!product) return 0;
    if (product.stockQuantity !== undefined) {
        return Math.max(0, Number(product.stockQuantity) || 0);
    }
    return product.stock !== false ? 999 : 0;
}

/**
 * Consumo por venta del hijo, en las mismas unidades que el stock del padre (kg).
 * Si el padre es por peso y el valor es >= 1, se interpreta como gramos (500 → 0,5 kg).
 */
export function normalizeUnitsToDeduct(
    unitsToDeduct: number,
    parent?: Product,
    child?: Product
): number {
    const u = Number(unitsToDeduct) || 0;
    if (u <= 0) return 0;

    const parentIsWeight = parent?.unitType === 'weight';
    const childIsWeight = child?.unitType === 'weight';

    if ((parentIsWeight || childIsWeight) && u >= 1) {
        return u / 1000;
    }
    return u;
}

/** Unidades vendibles del hijo: cuántas porciones entran en el stock del padre. */
export function getDerivedStockFromParent(
    parentStock: number,
    unitsToDeduct: number,
    parent?: Product,
    child?: Product
): number {
    const deduct = normalizeUnitsToDeduct(unitsToDeduct, parent, child);
    if (!(deduct > 0)) return 0;
    const ratio = parentStock / deduct;
    return Math.max(0, Math.floor(ratio + 1e-9));
}

/** Recalcula stockQuantity/stock de productos hijo según el padre en el catálogo. */
export function applyDerivedStockToCatalog(catalog: Record<string, Product>): void {
    Object.keys(catalog).forEach((childId) => {
        const child = catalog[childId];
        const dep = child.stockDependency;
        if (!dep?.productId || !(Number(dep.unitsToDeduct) > 0)) return;

        const parent = catalog[dep.productId];
        if (!parent) return;

        const parentStock = getRawStockQuantity(parent);
        const derivedStock = getDerivedStockFromParent(
            parentStock,
            dep.unitsToDeduct,
            parent,
            child
        );

        catalog[childId] = {
            ...child,
            stockQuantity: derivedStock,
            stock: derivedStock > 0,
        };
    });
}

export function mapFirestoreProduct(docId: string, data: Record<string, unknown>): Product {
    const stockDependency = data.stockDependency as Product["stockDependency"];

    return {
        id: docId,
        name: (data.nombre as string) || "",
        price: (data.precio as number) || 0,
        image: (data.img as string) || "",
        images: (data.images as string[]) || (data.img ? [data.img as string] : []),
        variants: (data.variants as Product["variants"]) || [],
        quantity: 0,
        stock: data.stock as boolean | undefined,
        stockQuantity: data.stockQuantity as number | undefined,
        stockDependency,
        description: data.description as string | undefined,
        unitType: (data.unitType as Product['unitType']) || 'unit',
        isVisible: data.isVisible !== false,
        discount: (data.discount as number) || 0,
        categoria: ((data.categoria as string) || "Otros").trim(),
        stockReadyTime: data.stockReadyTime as string | undefined,
        customBadgeText: data.customBadgeText as string | undefined,
        badgeExpiresAt: data.badgeExpiresAt as string | undefined,
    };
}

export function parseCartItemId(
    cartItemId: string,
    catalogIds: string[]
): { baseId: string; variant: string | null } {
    if (catalogIds.includes(cartItemId)) {
        return { baseId: cartItemId, variant: null };
    }
    const sorted = [...catalogIds].sort((a, b) => b.length - a.length);
    for (const baseId of sorted) {
        const prefix = `${baseId}-`;
        if (cartItemId.startsWith(prefix)) {
            return { baseId, variant: cartItemId.slice(prefix.length) };
        }
    }
    return { baseId: cartItemId, variant: null };
}

export function resolveCartItemBaseAndVariant(
    item: Product,
    catalogIds: string[]
): { baseId: string; variant: string | null } {
    if (item.baseProductId != null) {
        return {
            baseId: String(item.baseProductId),
            variant: item.selectedVariant ?? null,
        };
    }
    const fromId = parseCartItemId(String(item.id), catalogIds);
    if (fromId.variant) return fromId;
    const match = item.name?.match(/\(([^)]+)\)$/);
    if (match) {
        return { baseId: fromId.baseId, variant: match[1] };
    }
    return fromId;
}

/** Stock disponible para agregar al carrito (entero, mínimo 0). */
export function getAvailableStock(
    product: Product | undefined,
    variantName?: string | null,
    catalog?: Record<string, Product>
): number {
    if (!product) return 0;

    if (product.stockDependency?.productId && catalog) {
        const parent = catalog[String(product.stockDependency.productId)];
        if (parent) {
            const parentStock = getRawStockQuantity(parent);
            return getDerivedStockFromParent(
                parentStock,
                Number(product.stockDependency.unitsToDeduct) || 1,
                parent,
                product
            );
        }
    }

    if (product.variants && product.variants.length > 0) {
        const vName =
            variantName ||
            product.variants.find((v) =>
                v.stockQuantity !== undefined ? v.stockQuantity > 0 : v.stock
            )?.name ||
            product.variants[0]?.name;
        const variant = product.variants.find((v) => v.name === vName);
        if (!variant) return 0;
        if (variant.stockQuantity !== undefined) {
            return Math.max(0, Math.floor(variant.stockQuantity));
        }
        return variant.stock ? 999 : 0;
    }

    if (product.stockQuantity !== undefined) {
        const raw = getRawStockQuantity(product);
        if (product.unitType === 'weight') {
            return raw > 0 ? 1 : 0;
        }
        return Math.max(0, Math.floor(raw));
    }
    return product.stock !== false ? 999 : 0;
}

export function getCartItemMaxQuantity(
    item: Product,
    catalog: Record<string, Product>
): number {
    const catalogIds = Object.keys(catalog);
    const { baseId, variant } = resolveCartItemBaseAndVariant(item, catalogIds);
    return getAvailableStock(catalog[baseId], variant, catalog);
}
