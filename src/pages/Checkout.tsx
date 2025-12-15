import { useContext, useState } from "react";
import { CartContext } from "../context/CartContext";
import "./Checkout.css";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, updateDoc, addDoc, getDoc } from "firebase/firestore";
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
        // We do this individually for each product (simple approach) or batch
        // For robustness, we catch errors here but don't stop the success flow of the order (since the order is already placed).
        try {
          for (const item of cart) {
            // Check if item is a variant (format: ID-VariantName)
            const isVariant = String(item.id).includes('-');
            const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);
            const itemRef = doc(db, "products", baseId);
            const itemSnap = await getDoc(itemRef);

            if (itemSnap.exists()) {

              const data = itemSnap.data();

              // --- Lógica de Derivados (Packs) ---
              // Si el producto tiene dependencia, descontamos del PADRE
              if (data.stockDependency && data.stockDependency.productId) {
                const parentId = data.stockDependency.productId;
                const unitsToDeduct = data.stockDependency.unitsToDeduct || 1;
                const totalDeduction = (item.quantity || 1) * unitsToDeduct;

                const parentRef = doc(db, "products", parentId);
                const parentSnap = await getDoc(parentRef);

                if (parentSnap.exists()) {
                  const parentData = parentSnap.data();
                  const currentParentStock = parentData.stockQuantity || 0;

                  // Aceptamos decimales, pero stockQuantity suele ser number.
                  // Usamos Math.max(0, ...) para evitar negativos
                  const newParentStock = Math.max(0, currentParentStock - totalDeduction);

                  // 1. Actualizar Padre
                  await updateDoc(parentRef, { stockQuantity: newParentStock });

                  // 2. Registrar Movimiento en Padre
                  await addDoc(collection(db, "stock_movements"), {
                    productId: parentId,
                    productName: parentData.nombre,
                    type: 'OUT',
                    quantity: totalDeduction,
                    reason: 'Venta Online',
                    observation: `Venta Derivado: ${item.name}`,
                    date: new Date()
                  });

                  // 3. Sincronizar todos los hijos (incluido este mismo)
                  await syncChildProducts(parentId, newParentStock);
                }
              }
              // --- Fin Lógica Derivados ---
              else {
                // Lógica Normal (Sin Dependencia)
                let variantName = "";

                if (isVariant && data.variants) {
                  // Extract variant name from item name "Product (Variant)"
                  const match = item.name.match(/\(([^)]+)\)$/);
                  if (match) {
                    variantName = match[1];
                    const variants = [...data.variants];
                    const variantIdx = variants.findIndex((v: any) => v.name === variantName);

                    if (variantIdx >= 0) {
                      const currentStock = variants[variantIdx].stockQuantity || 0;
                      const newStock = Math.max(0, currentStock - (item.quantity || 1));
                      variants[variantIdx].stockQuantity = newStock;
                      variants[variantIdx].stock = newStock > 0;

                      await updateDoc(itemRef, { variants });

                      // Si fuera necesario sincronizar algo (ej: si la variante fuera padre), aquí iría.
                    }
                  }
                } else {
                  // Simple Product
                  const currentStock = data.stockQuantity || 0;
                  const newStock = Math.max(0, currentStock - (item.quantity || 1));

                  await updateDoc(itemRef, { stockQuantity: newStock });

                  // IMPORTANTE: Si este producto es Padre de otros, sincronizar sus hijos
                  await syncChildProducts(baseId, newStock);
                }

                // Log Movement (Original Item)
                await addDoc(collection(db, "stock_movements"), {
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
          }
        } catch (stockError) {
          console.error("Error updating stock:", stockError);
          // Optionally notify admin silently or just log it.
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