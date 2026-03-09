import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

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

export const validateCartStock = async (cart: any[]): Promise<StockValidationResult> => {
    const outOfStockItems = [];

    for (const item of cart) {
        try {
            const baseId = getBaseId(item);
            const isVariant = item.variant || (item.name && item.name.includes('('));
            const itemRef = doc(db, "products", baseId);
            const itemSnap = await getDoc(itemRef);

            if (itemSnap.exists()) {
                const data = itemSnap.data();
                let available = 0;

                if (isVariant && data.variants) {
                    let variantName = item.variant || "";
                    if (!variantName) {
                        const match = item.name.match(/\(([^)]+)\)$/);
                        if (match) variantName = match[1];
                    }

                    if (variantName) {
                        const variant = data.variants.find((v: any) => v.name === variantName);
                        if (variant) {
                            available = Number(variant.stockQuantity || 0);
                        }
                    }
                } else {
                    available = Number(data.stockQuantity || 0);
                }

                if (item.quantity > available) {
                    outOfStockItems.push({
                        id: item.id,
                        name: item.name,
                        requested: item.quantity,
                        available: available
                    });
                }
            } else {
                // Product deleted? Treat as 0 stock
                outOfStockItems.push({
                    id: item.id,
                    name: item.name,
                    requested: item.quantity,
                    available: 0
                });
            }
        } catch (error) {
            console.error("Error validating stock for item:", item, error);
            // On error, maybe fail safe or block? safe to block for integrity
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
