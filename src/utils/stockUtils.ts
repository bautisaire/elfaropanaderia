import { db } from '../firebase/firebaseConfig';
import { collection, query, where, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
import { getDerivedStockFromParent } from './cartStock';
import type { Product } from '../context/CartContext';

/**
 * Sincroniza el stock de todos los productos "Hijos" (Derivados)
 * basándose en el nuevo stock del Producto Padre.
 * 
 * @param parentId ID del producto Padre que cambió de stock.
 * @param newParentStock La nueva cantidad de stock disponible del Padre.
 */
export const syncChildProducts = async (parentId: string, newParentStock: number) => {
    try {
        // Estrategia Robustas: Consultar 'products' donde 'stockDependency.productId' == parentId
        const q = query(
            collection(db, "products"),
            where("stockDependency.productId", "==", parentId)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return;

        const parentSnap = await getDoc(doc(db, "products", parentId));
        const parentUnitType = parentSnap.exists()
            ? (parentSnap.data().unitType as Product['unitType']) || 'unit'
            : 'unit';

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

            if (dependency && dependency.unitsToDeduct > 0) {
                const childProduct: Product = {
                    id: childDoc.id,
                    name: childData.nombre || '',
                    price: 0,
                    image: '',
                    unitType: childData.unitType || 'unit',
                    stockDependency: dependency,
                };
                const newChildStock = getDerivedStockFromParent(
                    newParentStock,
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
