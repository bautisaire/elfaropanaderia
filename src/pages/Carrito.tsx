import { useContext, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CartContext } from "../context/CartContext";
import "./Carrito.css";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, Timestamp, doc, getDoc, updateDoc } from "firebase/firestore";
import { sendTelegramNotification } from "../utils/telegram";
import { validateCartStock } from "../utils/stockValidation";
import StockErrorModal from "../components/StockErrorModal";

export default function Carrito() {
  const { cart, removeFromCart, clearCart, cartTotal } = useContext(CartContext);
  const navigate = useNavigate();

  const [stockError, setStockError] = useState<{ isOpen: boolean, items: any[] }>({ isOpen: false, items: [] });
  const [showCheckout, setShowCheckout] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showStickyCheckout, setShowStickyCheckout] = useState(false);
  const checkoutBtnRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [formData, setFormData] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    indicaciones: "",
    metodoPago: "efectivo",
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Scroll to form when showCheckout becomes true
  useEffect(() => {
    if (showCheckout && formRef.current) {
      // Small timeout to ensure render is complete and layout is stable
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [showCheckout]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load saved customer info
  useEffect(() => {
    const saved = localStorage.getItem('customer_info');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Error loading customer info", e);
      }
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky button when main button is NOT intersecting (not visible)
        setShowStickyCheckout(!entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0,
        rootMargin: "0px"
      }
    );

    if (checkoutBtnRef.current) {
      observer.observe(checkoutBtnRef.current);
    }

    return () => {
      if (checkoutBtnRef.current) {
        observer.unobserve(checkoutBtnRef.current);
      }
    };
  }, [showCheckout, cart]);

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

  // State for minimum purchase
  const [minPurchaseError, setMinPurchaseError] = useState<{ isOpen: boolean, minAmount: number }>({ isOpen: false, minAmount: 0 });
  const [minPurchaseConfig, setMinPurchaseConfig] = useState(0);

  useEffect(() => {
    // Fetch min purchase config
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, "config", "store_settings");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMinPurchaseConfig(docSnap.data().minPurchase || 0);
        }
      } catch (e) {
        console.error("Error fetching store config:", e);
      }
    };
    fetchConfig();
  }, []);

  const handleProcederAlPago = async () => {
    // 0. Validar Compra Mínima
    if (minPurchaseConfig > 0 && cartTotal < minPurchaseConfig) {
      setMinPurchaseError({ isOpen: true, minAmount: minPurchaseConfig });
      return;
    }

    // 1. Validar Stock
    const result = await validateCartStock(cart);
    if (!result.isValid) {
      setStockError({ isOpen: true, items: result.outOfStockItems });
    } else {
      setShowCheckout(true);
    }
  };

  const handleStockFix = () => {
    stockError.items.forEach(item => removeFromCart(item.id));
    setStockError({ ...stockError, isOpen: false });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // 0. Validar Compra Mínima (Doble chequeo)
    if (minPurchaseConfig > 0 && cartTotal < minPurchaseConfig) {
      setMinPurchaseError({ isOpen: true, minAmount: minPurchaseConfig });
      setShowCheckout(false);
      return;
    }

    // 1. Validar Stock Antes de Proceder (Doble chequeo)
    const validationResult = await validateCartStock(cart);
    if (!validationResult.isValid) {
      setStockError({ isOpen: true, items: validationResult.outOfStockItems });
      return;
    }

    // enviar o procesar pedido...
    const orderData = {
      items: cart,
      total: cartTotal,
      cliente: formData,
      date: Timestamp.now(),
      status: "pending"
    };

    try {
      const docRef = await addDoc(collection(db, "orders"), orderData);
      console.log("Pedido enviado, ID:", docRef.id);

      // --- LOGICA DE STOCK Y SEGUIMIENTO (Restaurada) ---

      // A. Guardar Order ID en LocalStorage para "Mis Pedidos"
      try {
        const newOrderId = docRef.id;
        const existingOrders = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');

        // Ensure we only store strings (simple IDs)
        const cleanOrders = existingOrders.map((o: any) => typeof o === 'object' ? (o.id || o.orderId) : o);

        if (!cleanOrders.includes(newOrderId)) {
          cleanOrders.push(newOrderId);
          localStorage.setItem('mis_pedidos', JSON.stringify(cleanOrders));
          // Dispatch event so other components (Navbar) update immediately
          window.dispatchEvent(new Event("storage"));
        }

        // Save Customer Info for next time
        localStorage.setItem('customer_info', JSON.stringify(formData));

      } catch (e) {
        console.error("Error saving order/customer to local storage", e);
      }

      // B. Descontar Stock de Firestore y Registrar Movimientos
      try {
        for (const item of cart) {
          // Check if item is a variant (format: ID-VariantName)
          const isVariant = String(item.id).includes('-');
          const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);
          const itemRef = doc(db, "products", baseId);
          const itemSnap = await getDoc(itemRef);

          if (itemSnap.exists()) {
            const data = itemSnap.data();
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
                }
              }
            } else {
              // Simple Product
              const currentStock = data.stockQuantity || 0;
              const newStock = Math.max(0, currentStock - (item.quantity || 1));
              await updateDoc(itemRef, { stockQuantity: newStock });
            }

            // Log Movement
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
      } catch (stockError) {
        console.error("Error updating stock:", stockError);
      }

      // --- FIN LOGICA STOCK ---

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
      <h2>
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', verticalAlign: 'middle' }}>
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        Tu carrito
      </h2>

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
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <h3>Total: ${Math.floor(cartTotal)}</h3>
          </div>

          {!showCheckout ? (
            <div className="cart-actions">
              <button
                ref={checkoutBtnRef}
                className="btn-checkout"
                onClick={handleProcederAlPago}
              >
                Proceder al pago
              </button>
              <button className="btn-clear" onClick={clearCart}>
                Vaciar carrito
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          ) : (
            <form ref={formRef} className="checkout-form" onSubmit={handleSubmit}>
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
                <label>
                  Método de pago cuando llegue el pedido <span className="required">*</span>
                </label>
                <div className="radio-group">
                  <label className={`radio-card ${formData.metodoPago === 'efectivo' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="metodoPago"
                      value="efectivo"
                      checked={formData.metodoPago === 'efectivo'}
                      onChange={handleInputChange}
                      className="radio-input"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="radio-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="1" x2="12" y2="23"></line>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    <div>
                      <div className="radio-label">Efectivo</div>
                      <div className="radio-desc">Pagas al repartidor</div>
                    </div>
                  </label>

                  <label className={`radio-card ${formData.metodoPago === 'transferencia' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="metodoPago"
                      value="transferencia"
                      checked={formData.metodoPago === 'transferencia'}
                      onChange={handleInputChange}
                      className="radio-input"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="radio-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                      <line x1="1" y1="10" x2="23" y2="10"></line>
                    </svg>
                    <div>
                      <div className="radio-label">Transferencia</div>
                      <div className="radio-desc">Al alias del repartidor</div>
                    </div>
                  </label>
                </div>
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

          {/* Sticky Checkout Button */}
          {showStickyCheckout && !showCheckout && (
            <div className="sticky-checkout-container">
              <div className="sticky-content">
                <div className="sticky-total">
                  <span>Total:</span>
                  <strong>${Math.floor(cartTotal)}</strong>
                </div>
                <button
                  className="btn-sticky-checkout"
                  onClick={handleProcederAlPago}
                >
                  Proceder al pago
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showConfirmation && (
        <div className="order-modal" role="dialog" aria-modal="true">
          <div className="order-modal-content">
            <svg xmlns="http://www.w3.org/2000/svg" className="order-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
            <h3>Pedido realizado!</h3>
            <p>En breves nos comunicaremos con usted</p>
            <p>¡Gracias por su compra!</p>
          </div>
        </div>
      )}

      {/* Minimum Purchase Error Modal */}
      {minPurchaseError.isOpen && (
        <div className="order-modal error" role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="order-modal-content">
            <div style={{ color: '#ef4444', marginBottom: '15px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3>Compra Mínima no alcanzada</h3>
            <p style={{ margin: '15px 0' }}>La compra mínima es de <strong>${minPurchaseError.minAmount}</strong>.</p>
            <p>Te faltan <strong>${Math.floor(minPurchaseError.minAmount - cartTotal)}</strong> para completar tu pedido.</p>
            <button
              className="btn-confirm"
              style={{ marginTop: '20px' }}
              onClick={() => navigate('/')}
            >
              Modificar mi pedido
            </button>
            <button
              className="btn-text"
              style={{ marginTop: '10px', display: 'block', marginInline: 'auto' }}
              onClick={() => setMinPurchaseError({ ...minPurchaseError, isOpen: false })}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <StockErrorModal
        isOpen={stockError.isOpen}
        onClose={() => setStockError({ ...stockError, isOpen: false })}
        onConfirm={handleStockFix}
        outOfStockItems={stockError.items}
      />
    </div>
  );
}