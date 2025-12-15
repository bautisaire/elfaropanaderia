import { db } from '../firebase/firebaseConfig';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';

/**
 * Sincroniza el stock de todos los productos "Hijos" (Derivados)
 * basándose en el nuevo stock del Producto Padre.
 * 
 * @param parentId ID del producto Padre que cambió de stock.
 * @param newParentStock La nueva cantidad de stock disponible del Padre.
 */
export const syncChildProducts = async (parentId: string, newParentStock: number) => {
    try {
        // Buscar todos los productos que dependen de este padre
        // Nota: Esto requiere un índice compuesto en Firestore si "stockDependency.productId" es un objeto anidado.
        // O podemos filtrar en cliente si son pocos productos, pero lo ideal es query.
        // Asumimos que guardamos 'stockDependency.productId' como un campo consultable o consultamos todo.

        // Estrategia Robustas: Consultar 'products' donde 'stockDependency.productId' == parentId
        const q = query(
            collection(db, "products"),
            where("stockDependency.productId", "==", parentId)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return;

        const batch = writeBatch(db);
        let updatesCount = 0;

        querySnapshot.forEach((childDoc) => {
            const childData = childDoc.data();
            const dependency = childData.stockDependency;

            if (dependency && dependency.unitsToDeduct > 0) {
                // Calcular stock hijo: Floor(StockPadre / ConsumoHijo)
                // Ej: Padre 10kg / Hijo 0.5kg = 20 unidades
                const newChildStock = Math.floor(newParentStock / dependency.unitsToDeduct);

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
