import { db } from '../firebase/firebaseConfig';
import { collection, query, where, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
import { getDerivedStockFromParent } from './cartStock';
import type { Product } from '../context/CartContext';

/**
 * Sincroniza el stock de todos los productos "Hijos" (Derivados)
 * basándose en el nuevo stock del Producto Padre.
 *
 * Siempre relee el padre para obtener sus variantes actuales: si el padre tiene
 * variantes (ej. sabores), cada variante del hijo se deriva de la variante del
 * padre con el mismo nombre, en vez de un único número plano.
 *
 * @param parentId ID del producto Padre que cambió de stock.
 * @param newParentStock Nueva cantidad de stock del Padre (usada solo si el padre no tiene variantes).
 */
export const syncChildProducts = async (parentId: string, newParentStock: number) => {
    try {
        // Estrategia Robustas: Consultar 'products' donde 'stockDependency.productId' == parentId
        const q = query(
            collection(db, "products"),
            where("stockDependency.productId", "==", parentId)
        );

        const [querySnapshot, parentSnap] = await Promise.all([
            getDocs(q),
            getDoc(doc(db, "products", parentId))
        ]);

        if (querySnapshot.empty) return;

        const parentData = parentSnap.exists() ? parentSnap.data() : undefined;
        const parentUnitType = (parentData?.unitType as Product['unitType']) || 'unit';
        const parentVariants = parentData?.variants as { name: string; stockQuantity?: number }[] | undefined;

        const parentProduct: Product = {
            id: parentId,
            name: '',
            price: 0,
            image: '',
            stockQuantity: newParentStock,
            unitType: parentUnitType,
        };

        const batch = writeBatch(db);
        let updatesCount = 0;

        querySnapshot.forEach((childDoc) => {
            const childData = childDoc.data();
            const dependency = childData.stockDependency;

            if (!(dependency && dependency.unitsToDeduct > 0)) return;

            const childProduct: Product = {
                id: childDoc.id,
                name: childData.nombre || '',
                price: 0,
                image: '',
                unitType: childData.unitType || 'unit',
                stockDependency: dependency,
            };

            const childVariants = childData.variants as { name: string; stockQuantity?: number; stock?: boolean }[] | undefined;

            if (childVariants && childVariants.length > 0) {
                let changed = false;
                const newVariants = childVariants.map((v) => {
                    const parentStockForVariant = parentVariants
                        ? (parentVariants.find((pv) => pv.name === v.name)?.stockQuantity ?? 0)
                        : newParentStock;
                    const newVal = getDerivedStockFromParent(
                        parentStockForVariant,
                        dependency.unitsToDeduct,
                        parentProduct,
                        childProduct
                    );
                    if (newVal !== (v.stockQuantity || 0)) changed = true;
                    return { ...v, stockQuantity: newVal, stock: newVal > 0 };
                });

                if (changed) {
                    batch.update(doc(db, "products", childDoc.id), { variants: newVariants });
                    updatesCount++;
                }
                return;
            }

            const parentStockForChild = parentVariants
                ? parentVariants.reduce((acc, pv) => acc + (Number(pv.stockQuantity) || 0), 0)
                : newParentStock;
            const newChildStock = getDerivedStockFromParent(
                parentStockForChild,
                dependency.unitsToDeduct,
                parentProduct,
                childProduct
            );

            // Solo actualizar si cambió
            if (childData.stockQuantity !== newChildStock) {
                const childRef = doc(db, "products", childDoc.id);
                batch.update(childRef, {
                    stockQuantity: newChildStock,
                    stock: newChildStock > 0
                });
                updatesCount++;
            }
        });

        if (updatesCount > 0) {
            await batch.commit();
            console.log(`Sincronizados ${updatesCount} productos derivados del padre ${parentId}`);
        }

    } catch (error) {
        console.error("Error sincronizando productos hijos:", error);
    }
};
