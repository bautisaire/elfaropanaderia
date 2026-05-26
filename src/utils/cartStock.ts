import type { Product } from "../context/CartContext";

/** Recalcula stockQuantity/stock de productos hijo según el padre en el catálogo. */
export function applyDerivedStockToCatalog(catalog: Record<string, Product>): void {
    Object.keys(catalog).forEach((childId) => {
        const child = catalog[childId];
        const dep = child.stockDependency;
        if (!dep?.productId || !(Number(dep.unitsToDeduct) > 0)) return;

        const parent = catalog[dep.productId];
        if (!parent) return;

        const parentStock =
            parent.stockQuantity !== undefined
                ? parent.stockQuantity
                : parent.stock
                  ? 999
                  : 0;
        const derivedStock = Math.floor(parentStock / Number(dep.unitsToDeduct));

        catalog[childId] = {
            ...child,
            stockQuantity: derivedStock,
            stock: derivedStock > 0,
        };
    });
}

export function getDerivedStockFromParent(
    parentStock: number,
    unitsToDeduct: number
): number {
    if (!(unitsToDeduct > 0)) return 0;
    return Math.max(0, Math.floor(parentStock / unitsToDeduct));
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
            const parentStock = getAvailableStock(parent, null, catalog);
            return getDerivedStockFromParent(
                parentStock,
                Number(product.stockDependency.unitsToDeduct) || 1
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
        return Math.max(0, Math.floor(product.stockQuantity));
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
