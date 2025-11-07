import { useContext, useState } from "react";
import { CartContext } from "../context/CartContext";
import "./Checkout.css";

export default function Checkout() {
  const { cart, total, clearCart } = useContext(CartContext);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "efectivo" | "">("");

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
    const response = await fetch("https://elfaropanaderia-backend-production.up.railway.app/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    if (response.ok) {
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