import { useContext } from "react";
import { CartContext } from "../context/CartContext";
import "./Cart.css";
export default function Cart() {
  const { cart, removeFromCart, clearCart, total } = useContext(CartContext);

  return (
    <div>
      <h2>🛒 Tu carrito</h2>
      {cart.length === 0 ? (
        <p>El carrito está vacío.</p>
      ) : (
        <>
          {cart.map((item) => (
            <div key={item.id}>
              {item.name} x {item.quantity} = ${Math.round(item.price * (item.quantity || 1) * 100) / 100}
              {item.selectedComboItems && item.selectedComboItems.length > 0 && (
                <div style={{ fontSize: '0.8em', color: '#666', marginLeft: '10px' }}>
                  {item.selectedComboItems.map((comboItem, idx) => (
                    <div key={idx}>- {comboItem.quantity}x {comboItem.name}</div>
                  ))}
                </div>
              )}
              <button onClick={() => removeFromCart(item.id)}>❌</button>
            </div>
          ))}
          <h3>Total: ${total}</h3>
          <button onClick={clearCart}>Vaciar carrito</button>
        </>
      )}
    </div>
  );
}
