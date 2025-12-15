import { useContext, useState } from "react";
import { CartContext } from "../context/CartContext";
import "./Checkout.css";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, updateDoc, addDoc, getDoc } from "firebase/firestore";

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
    };

    try {
      // 1. Send Order to Backend (as before)
      const response = await fetch("https://elfaropanaderia-backend-production.up.railway.app/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (response.ok) {
        // 2. SUCCESS: Now Deduct Stock from Firestore (Client-side)
        // We do this individually for each product (simple approach) or batch
        // For robustness, we catch errors here but don't stop the success flow of the order (since the order is already placed).
        try {
          for (const item of cart) {
            const itemRef = doc(db, "products", String(item.id));
            const itemSnap = await getDoc(itemRef);

            if (itemSnap.exists()) {
              const currentStock = itemSnap.data().stockQuantity || 0;
              const newStock = Math.max(0, currentStock - (item.quantity || 1));

              // Update Product
              await updateDoc(itemRef, { stockQuantity: newStock });

              // Log Movement
              await addDoc(collection(db, "stock_movements"), {
                productId: String(item.id),
                productName: item.name,
                type: 'OUT',
                quantity: item.quantity || 1,
                reason: 'Venta Online',
                observation: `Pedido Web`,
                date: new Date()
              });
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