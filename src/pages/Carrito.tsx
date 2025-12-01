import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CartContext } from "../context/CartContext";
import "./Carrito.css";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { sendTelegramNotification } from "../utils/telegram";

export default function Carrito() {
  const { cart, removeFromCart, clearCart, cartTotal } = useContext(CartContext);
  const navigate = useNavigate();

  const [showCheckout, setShowCheckout] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formData, setFormData] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    indicaciones: "",
    metodoPago: "efectivo",
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validatePhone = (phone: string): boolean => {
    const phoneDigits = phone.replace(/\D/g, "");
    const phoneRegex = /^[0-9]{10,}$/;
    return phoneRegex.test(phoneDigits) && phoneDigits.length >= 10;
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es requerido";
    if (!formData.direccion.trim()) newErrors.direccion = "La dirección es requerida";
    if (!formData.telefono.trim()) newErrors.telefono = "El teléfono es requerido";
    else if (!validatePhone(formData.telefono)) newErrors.telefono = "El teléfono debe tener al menos 10 dígitos";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // enviar o procesar pedido...
    const orderData = {
      items: cart,
      total: cartTotal,
      cliente: formData,
      date: Timestamp.now(),
      status: "pending"
    };

    try {
      await addDoc(collection(db, "orders"), orderData);
      console.log("Pedido enviado:", orderData);

      // Enviar notificación a Telegram (no bloqueante)
      sendTelegramNotification(orderData).catch(console.error);

      // limpiar carrito y formulario
      clearCart();
      setShowCheckout(false);
      setFormData({
        nombre: "",
        direccion: "",
        telefono: "",
        indicaciones: "",
        metodoPago: "efectivo",
      });

      // mostrar modal de confirmación y volver al home después
      setShowConfirmation(true);
      setTimeout(() => {
        setShowConfirmation(false);
        navigate("/");
      }, 5000);

    } catch (error) {
      console.error("Error al enviar el pedido:", error);
      // Podríamos mostrar un error aquí si fuera necesario
    }
  };

  return (
    <div className="carrito-container">
      <h2>🛒 Tu carrito</h2>

      {cart.length === 0 ? (
        <p className="empty-cart">El carrito está vacío.</p>
      ) : (
        <>
          <div className="cart-items">
            {cart.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="item-info">
                  <h4>{item.name}</h4>
                  <p>Cantidad: {item.quantity}</p>
                  <p className="item-price">${Math.floor(item.price * (item.quantity || 1))}</p>
                </div>
                <button
                  className="btn-remove"
                  onClick={() => removeFromCart(item.id)}
                  aria-label="Quitar producto"
                >
                  ❌
                </button>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <h3>Total: ${Math.floor(cartTotal)}</h3>
          </div>

          {!showCheckout ? (
            <div className="cart-actions">
              <button className="btn-checkout" onClick={() => setShowCheckout(true)}>
                Proceder al pago
              </button>
              <button className="btn-clear" onClick={clearCart}>
                Vaciar carrito 🗑️
              </button>
            </div>
          ) : (
            <form className="checkout-form" onSubmit={handleSubmit}>
              <h3>Detalles del pedido</h3>

              <div className="form-group">
                <label htmlFor="nombre">
                  Nombre <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="nombre"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleInputChange}
                  placeholder="Tu nombre completo"
                  className={errors.nombre ? "input-error" : ""}
                />
                {errors.nombre && <span className="error-message">{errors.nombre}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="direccion">
                  Dirección <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="direccion"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleInputChange}
                  placeholder="Calle, número, departamento"
                  className={errors.direccion ? "input-error" : ""}
                />
                {errors.direccion && <span className="error-message">{errors.direccion}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="telefono">
                  Teléfono <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  id="telefono"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleInputChange}
                  placeholder="Tu número de teléfono (mínimo 10 dígitos)"
                  className={errors.telefono ? "input-error" : ""}
                />
                {errors.telefono && <span className="error-message">{errors.telefono}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="indicaciones">
                  Indicaciones para la entrega <span className="optional">(Opcional)</span>
                </label>
                <textarea
                  id="indicaciones"
                  name="indicaciones"
                  value={formData.indicaciones}
                  onChange={handleInputChange}
                  placeholder="Referencias / Indicaciones para la entrega"
                  rows={3}
                  maxLength={200}
                />
                <span className="form-hint">Ej: dejar pedido en portería</span>
              </div>

              <div className="form-group">
                <label htmlFor="metodoPago">
                  Método de pago cuando llegue el pedido <span className="required">*</span>
                </label>
                <select
                  id="metodoPago"
                  name="metodoPago"
                  value={formData.metodoPago}
                  onChange={handleInputChange}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia (al repartidor)</option>
                </select>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-confirm">
                  Confirmar pedido
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowCheckout(false)}
                >
                  Volver
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {showConfirmation && (
        <div className="order-modal" role="dialog" aria-modal="true">
          <div className="order-modal-content">
            <div className="order-emoji" aria-hidden>🛵</div>
            <h3>Pedido realizado! 🎉</h3>
            <p>En breves nos comunicaremos con usted</p>
            <p>¡Gracias por su compra!</p>
          </div>
        </div>
      )}
    </div>
  );
}