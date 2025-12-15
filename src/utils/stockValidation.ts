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

export const validateCartStock = async (cart: any[]): Promise<StockValidationResult> => {
    const outOfStockItems = [];

    for (const item of cart) {
        try {
            // Logic for variants: ID-VariantName
            const isVariant = String(item.id).includes('-');
            const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);
            const itemRef = doc(db, "products", baseId);
            const itemSnap = await getDoc(itemRef);

            if (itemSnap.exists()) {
                const data = itemSnap.data();
                let available = 0;

                if (isVariant && data.variants) {
                    const match = item.name.match(/\(([^)]+)\)$/);
                    const variantName = match ? match[1] : "";

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
