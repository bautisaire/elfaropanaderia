import { useContext, useState } from "react";
import { CartContext } from "../context/CartContext";
import "./Checkout.css";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, runTransaction } from "firebase/firestore";
import { syncChildProducts } from "../utils/stockUtils"; // Import Syncer

export default function Checkout() {
  const { cart, total, clearCart } = useContext(CartContext);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "efectivo" | "">("");

  /* New Stock System: Import Firestore functions */
  /* Note: Assuming imports are added at the top. I will add them in a separate chunk or rely on auto-imports if possible, but safer to do it manually. */

  const handleConfirm = async () => {
    if (!paymentMethod) {
      alert("Selecciona un método de pago antes de continuar.");
      return;
    }

    const orderData = {
      items: cart,
      total,
      paymentMethod,
      source: 'online', // Tag as online order
      status: 'pendiente',
      date: new Date()
    };

    try {
      // 1. Send Order to Backend (as before)
      const response = await fetch("https://elfaropanaderia-backend-production.up.railway.app/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (response.ok) {
        // Save Order ID to LocalStorage for "Mis Pedidos"
        try {
          const responseData = await response.json();
          const newOrderId = responseData.id || responseData.orderId;

          if (newOrderId) {
            const existingOrders = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
            // Ensure we only store strings to avoid the bug we just fixed
            const cleanOrders = existingOrders.map((o: any) => typeof o === 'object' ? o.id : o);

            if (!cleanOrders.includes(newOrderId)) {
              cleanOrders.push(newOrderId);
              localStorage.setItem('mis_pedidos', JSON.stringify(cleanOrders));
              window.dispatchEvent(new Event("storage"));
            }
          }
        } catch (e) {
          console.error("Error saving order to local storage", e);
        }

        // 2. SUCCESS: Now Deduct Stock from Firestore (Client-side)
        // Usamos una transacción para asegurar la consistencia, especialmente con productos derivados.
        try {
          const updates = await runTransaction(db, async (transaction) => {
            // A. Identificar todos los productos que necesitamos leer
            // Esto incluye los productos del carrito Y sus posibles padres (si son derivados)
            const productIdsToRead = new Set<string>();
            const cartItemIds = new Set<string>();

            // Primero recolectamos los IDs base de los productos del carrito
            cart.forEach(item => {
              const baseId = String(item.id).split('-')[0];
              cartItemIds.add(baseId);
              productIdsToRead.add(baseId);
            });

            // Leer estos productos para verificar dependencias
            const uniqueIds = Array.from(productIdsToRead);
            const refs = uniqueIds.map(id => doc(db, "products", id));
            const docsSnap = await Promise.all(refs.map(ref => transaction.get(ref)));

            const productDocsMap: Record<string, any> = {};
            docsSnap.forEach((snap, i) => {
              if (snap.exists()) {
                productDocsMap[uniqueIds[i]] = snap.data();
              }
            });

            // B. Revisar si hay dependencias (padres) que no hayamos leído aún
            const parentIdsToFetch = new Set<string>();
            cart.forEach(item => {
              const baseId = String(item.id).split('-')[0];
              const productData = productDocsMap[baseId];

              if (productData && productData.stockDependency && productData.stockDependency.productId) {
                const parentId = productData.stockDependency.productId;
                if (!productDocsMap[parentId]) {
                  parentIdsToFetch.add(parentId);
                }
              }
            });

            // Leer los padres faltantes (si los hay)
            if (parentIdsToFetch.size > 0) {
              const parentIds = Array.from(parentIdsToFetch);
              const parentRefs = parentIds.map(id => doc(db, "products", id));
              const parentSnaps = await Promise.all(parentRefs.map(ref => transaction.get(ref)));
              parentSnaps.forEach((snap, i) => {
                if (snap.exists()) {
                  productDocsMap[parentIds[i]] = snap.data();
                }
              });
            }

            // C. Calcular descuentos y preparar escrituras
            const productsToUpdate = new Set<string>();

            for (const item of cart) {
              const baseId = String(item.id).split('-')[0];
              const productData = productDocsMap[baseId];

              if (!productData) continue; // Safety check

              // CASO 1: Producto Derivado (Pack) -> Descuenta del Padre
              if (productData.stockDependency && productData.stockDependency.productId) {
                const parentId = productData.stockDependency.productId;
                const parentData = productDocsMap[parentId];

                if (parentData) {
                  const unitsToDeduct = Number(productData.stockDependency.unitsToDeduct) || 1;
                  const qty = Number(item.quantity) || 1;
                  const totalDucktion = qty * unitsToDeduct;

                  const currentStock = Number(parentData.stockQuantity) || 0;
                  const newParentStock = Math.max(0, currentStock - totalDucktion);

                  parentData.stockQuantity = newParentStock;
                  parentData.stock = newParentStock > 0; // Actualizar flag

                  productsToUpdate.add(parentId);

                  // Registrar Movimiento del PADRE
                  const moveRef = doc(collection(db, "stock_movements"));
                  transaction.set(moveRef, {
                    productId: parentId,
                    productName: parentData.nombre,
                    type: 'OUT',
                    quantity: totalDucktion,
                    reason: 'Venta Online',
                    observation: `Venta Derivado: ${item.name}`,
                    date: new Date()
                  });
                }
              }
              // CASO 2: Producto Normal o Variante -> Descuenta de sí mismo
              else {
                let variantName = "";
                let variantFound = false;

                // Intentar identificar variante por nombre (ej: "Pan (Integral)")
                const match = item.name.match(/\(([^)]+)\)$/);
                if (match) {
                  variantName = match[1];
                }

                if (variantName && productData.variants) {
                  const vIdx = productData.variants.findIndex((v: any) => v.name === variantName);
                  if (vIdx >= 0) {
                    const variant = productData.variants[vIdx];
                    const currentStock = Number(variant.stockQuantity) || 0;
                    const qty = Number(item.quantity) || 1;
                    const newStock = Math.max(0, currentStock - qty);

                    variant.stockQuantity = newStock;
                    variant.stock = newStock > 0;
                    variantFound = true;
                  }
                }

                if (!variantFound) {
                  // Descuento stock principal
                  const currentStock = Number(productData.stockQuantity) || 0;
                  const qty = Number(item.quantity) || 1;
                  const newStock = Math.max(0, currentStock - qty);

                  productData.stockQuantity = newStock;
                  productData.stock = newStock > 0;
                }

                productsToUpdate.add(baseId);

                // Registrar Movimiento del Producto/Variante
                const moveRef = doc(collection(db, "stock_movements"));
                transaction.set(moveRef, {
                  productId: baseId,
                  productName: item.name,
                  type: 'OUT',
                  quantity: item.quantity || 1,
                  reason: 'Venta Online',
                  observation: `Pedido Web${variantName ? ` (Var: ${variantName})` : ''}`,
                  date: new Date()
                });
              }
            }

            // D. Ejecutar Actualizaciones de Productos
            productsToUpdate.forEach(pid => {
              const data = productDocsMap[pid];
              transaction.update(doc(db, "products", pid), {
                stockQuantity: data.stockQuantity,
                stock: data.stock,
                variants: data.variants || []
              });
            });

            return Array.from(productsToUpdate).map(id => ({ id, newStock: productDocsMap[id].stockQuantity }));
          });

          // 3. Post-Transaction: Sincronizar hijos (si modificamos padres)
          if (updates && updates.length > 0) {
            await Promise.all(updates.map(u => syncChildProducts(u.id, u.newStock)));
          }

        } catch (stockError) {
          console.error("Error updating stock in transaction:", stockError);
          // Opcional: Notificar a un canal admin.
        }

        alert("Pedido guardado con éxito en el servidor 🎉");
        clearCart();
      } else {
        alert("Error al guardar el pedido 😢");
      }
    } catch (error) {
      console.error(error);
      alert("No se pudo conectar al servidor");
    }
  };

  return (
    <div className="checkout">
      <h2>🛒 Checkout</h2>

      {cart.length === 0 ? (
        <p>El carrito está vacío.</p>
      ) : (
        <>
          <div className="checkout-products">
            {cart.map((item) => (
              <div key={item.id} className="checkout-item">
                <span>{item.name} x {item.quantity}</span>
                <span>${item.price * (item.quantity || 1)}</span>
              </div>
            ))}
          </div>

          <h3>Total: ${total}</h3>

          <div className="payment-method">
            <p>Selecciona un método de pago:</p>
            <label>
              <input
                type="radio"
                name="payment"
                value="mercadopago"
                checked={paymentMethod === "mercadopago"}
                onChange={() => setPaymentMethod("mercadopago")}
              />
              Mercado Pago
            </label>
            <label>
              <input
                type="radio"
                name="payment"
                value="efectivo"
                checked={paymentMethod === "efectivo"}
                onChange={() => setPaymentMethod("efectivo")}
              />
              Efectivo al delivery
            </label>
          </div>

          <button className="confirm-btn" onClick={handleConfirm}>
            Confirmar pedido
          </button>
        </>
      )}
    </div>
  );
}