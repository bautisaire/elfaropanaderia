import { useContext, useState, useRef, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { CartContext } from "../context/CartContext";
import "./Carrito.css";
import { db } from "../firebase/firebaseConfig";
import { collection, Timestamp, doc, getDoc, runTransaction, onSnapshot, DocumentSnapshot } from "firebase/firestore";
import { sendTelegramNotification } from "../utils/telegram";
import { validateCartStock } from "../utils/stockValidation";
import StockErrorModal from "../components/StockErrorModal";
import { FaCheckCircle, FaWhatsapp, FaShoppingBag, FaArrowLeft, FaBell } from "react-icons/fa";
import { syncChildProducts } from "../utils/stockUtils";

export default function Carrito() {
  const { cart, removeFromCart, clearCart, cartTotal, isAdmin } = useContext(CartContext);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    metodoPago: "efectivo", // 'efectivo', 'transferencia', 'mercadopago'
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert("Tu navegador no soporta notificaciones.");
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    if (result === "granted") {
      new Notification("Notificaciones activadas", {
        body: "Te avisaremos cuando tu pedido esté listo.",
        icon: "/logo192.png",
      });
    }
  };

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

  // Check for Mercado Pago Redirect
  useEffect(() => {
    const status = searchParams.get("status");
    const externalRef = searchParams.get("external_reference"); // Order ID

    if (status === "approved" && externalRef) {
      // Fetch Order to show confirmation
      const fetchOrder = async () => {
        try {
          const docRef = doc(db, "orders", externalRef);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setConfirmedOrder(docSnap.data());
            clearCart(); // Ensure cart is clear
            window.scrollTo(0, 0);

            // Clean URL
            setSearchParams({});
          }
        } catch (e) {
          console.error("Error recovering MP order", e);
        }
      };
      fetchOrder();
    }
  }, [searchParams]);

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

  // State for config
  const [minPurchaseError, setMinPurchaseError] = useState<{ isOpen: boolean, minAmount: number }>({ isOpen: false, minAmount: 0 });
  const [minPurchaseConfig, setMinPurchaseConfig] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copiado!`);
  };

  useEffect(() => {
    // Escuchar configuración en tiempo real
    const unsub = onSnapshot(doc(db, "config", "store_settings"), (docSnap: DocumentSnapshot) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMinPurchaseConfig(data.minPurchase || 0);
        setShippingCost(Number(data.shippingCost) || 0);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setFinalTotal(cartTotal + shippingCost);
  }, [cartTotal, shippingCost]);

  const handleProcederAlPago = async () => {
    // 0. Validar Compra Mínima
    // 0. Validar Compra Mínima (Admins Bypass)
    if (!isAdmin && minPurchaseConfig > 0 && cartTotal < minPurchaseConfig) {
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
    if (isSubmitting) return;

    setIsSubmitting(true);

    // 0. Validar Compra Mínima
    // 0. Validar Compra Mínima (Admins Bypass)
    if (!isAdmin && minPurchaseConfig > 0 && cartTotal < minPurchaseConfig) {
      setMinPurchaseError({ isOpen: true, minAmount: minPurchaseConfig });
      setShowCheckout(false);
      return;
    }

    // 1. Validar Stock Inicial (Lectura rapida para UX)
    const validationResult = await validateCartStock(cart);
    if (!validationResult.isValid) {
      setStockError({ isOpen: true, items: validationResult.outOfStockItems });
      return;
    }

    try {
      // Helper to correctly extract Base ID
      const getBaseId = (item: any) => {
        // If we saved productId explicitly (future proof), use it.
        if (item.productId) return String(item.productId);

        // Otherwise, try to detect variant suffix
        const match = item.name ? item.name.match(/\(([^)]+)\)$/) : null;
        const variantName = match ? match[1] : null;

        if (variantName) {
          const suffix = `-${variantName}`;
          if (String(item.id).endsWith(suffix)) {
            return String(item.id).substring(0, String(item.id).length - suffix.length);
          }
        }
        // Fallback: If no variant pattern detected, assume ID is the base ID
        // DO NOT SPLIT BY HYPHEN blindly, as IDs like 'torta-frita' are valid.
        return String(item.id);
      };

      // 2. TRANSACTION: Descuento de Stock y Creación de Orden Atómica
      const transactionResult = await runTransaction(db, async (transaction) => {
        // A. Preparar Lecturas
        const productIdsToRead = new Set<string>();
        cart.forEach(item => {
          const baseId = getBaseId(item);
          productIdsToRead.add(baseId);
        });

        // Leer Productos
        const uniqueIds = Array.from(productIdsToRead);
        const refs = uniqueIds.map(id => doc(db, "products", id));
        const docsSnap = await Promise.all(refs.map(ref => transaction.get(ref)));
        const productDocsMap: Record<string, any> = {};
        docsSnap.forEach((snap, i) => { if (snap.exists()) productDocsMap[uniqueIds[i]] = snap.data(); });

        // Check Parents for Packs
        const parentIdsToFetch = new Set<string>();
        cart.forEach(item => {
          const baseId = getBaseId(item);
          const pData = productDocsMap[baseId];
          if (pData?.stockDependency?.productId) parentIdsToFetch.add(pData.stockDependency.productId);
        });
        if (parentIdsToFetch.size > 0) {
          const parentRefs = Array.from(parentIdsToFetch).map(id => doc(db, "products", id));
          const parentSnaps = await Promise.all(parentRefs.map(ref => transaction.get(ref)));
          parentSnaps.forEach((snap, i) => { if (snap.exists()) productDocsMap[Array.from(parentIdsToFetch)[i]] = snap.data(); });
        }

        const productsToUpdate = new Set<string>();
        const stockMovementsToLog: any[] = [];

        // B. Procesar Cart Items
        for (const item of cart) {
          const baseId = getBaseId(item);
          const productData = productDocsMap[baseId];
          if (!productData) throw new Error(`Producto no encontrado: ${item.name}`);

          const qty = Number(item.quantity) || 1;

          // CASE A: Derived (Pack)
          if (productData.stockDependency?.productId) {
            const parentId = productData.stockDependency.productId;
            const parentData = productDocsMap[parentId];
            if (!parentData) throw new Error(`Producto padre no encontrado para: ${item.name}`);

            const unitsToDeduct = Number(productData.stockDependency.unitsToDeduct) || 1;
            const totalDeduct = qty * unitsToDeduct;
            const currentStock = Number(parentData.stockQuantity) || 0;

            // Strict Validation
            if (currentStock < totalDeduct) throw new Error(`Stock insuficiente: ${item.name} (Pack)`);

            parentData.stockQuantity = currentStock - totalDeduct;
            parentData.stock = parentData.stockQuantity > 0;
            productsToUpdate.add(parentId);

            stockMovementsToLog.push({
              productId: parentId, productName: parentData.nombre, quantity: totalDeduct,
              observation: `Venta Derivado: ${item.name}`
            });
          }
          // CASE B: Standard / Variant
          else {
            let variantName = "";
            const match = item.name.match(/\(([^)]+)\)$/);
            if (match) variantName = match[1];

            if (variantName && productData.variants) {
              const vIdx = productData.variants.findIndex((v: any) => v.name === variantName);
              if (vIdx < 0) throw new Error(`Variante no encontrada: ${variantName}`);

              const variant = productData.variants[vIdx];
              const currentStock = Number(variant.stockQuantity) || 0;
              // Strict Validation
              if (currentStock < qty) throw new Error(`Stock insuficiente: ${item.name} (${variantName})`);

              variant.stockQuantity = currentStock - qty;
              variant.stock = variant.stockQuantity > 0;
              productsToUpdate.add(baseId);
            } else {
              const currentStock = Number(productData.stockQuantity) || 0;
              // Strict Validation
              if (currentStock < qty) throw new Error(`Stock insuficiente: ${item.name}`);

              productData.stockQuantity = currentStock - qty;
              productData.stock = productData.stockQuantity > 0;
              productsToUpdate.add(baseId);
            }

            stockMovementsToLog.push({
              productId: baseId, productName: item.name, quantity: qty,
              observation: `Pedido Web${variantName ? ` (Var: ${variantName})` : ''}`
            });
          }
        }

        // C. Writes
        productsToUpdate.forEach(pid => {
          const d = productDocsMap[pid];
          transaction.update(doc(db, "products", pid), {
            stockQuantity: d.stockQuantity, stock: d.stock, variants: d.variants || []
          });
        });

        // D. Create Order
        const orderRef = doc(collection(db, "orders"));

        const finalItems = [...cart];
        if (shippingCost > 0) {
          finalItems.push({
            id: 'shipping-cost',
            name: 'Envío',
            price: shippingCost,
            quantity: 1,
            image: '',
            stock: true
          });
        }

        const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj));

        const newOrderData = {
          items: sanitize(finalItems),
          total: Number(finalTotal) || 0,
          cliente: sanitize(formData),
          date: new Date(),
          status: formData.metodoPago === 'mercadopago' ? "pending_payment" : "pending",
          paymentMethod: formData.metodoPago
        };
        transaction.set(orderRef, newOrderData);

        // E. Log Movements
        // E. Log Movements
        stockMovementsToLog.forEach(mov => {
          const mRef = doc(collection(db, "stock_movements"));
          transaction.set(mRef, { ...mov, type: 'OUT', reason: formData.metodoPago === 'mercadopago' ? 'Venta Online (MP)' : 'Venta Online', date: new Date() });
        });

        return { orderId: orderRef.id, productsToUpdate: Array.from(productsToUpdate).map(id => ({ id, newStock: productDocsMap[id].stockQuantity })) };
      });

      // 3. Post-Transaction Actions
      // Sync Children
      if (transactionResult.productsToUpdate) {
        Promise.all(transactionResult.productsToUpdate.map(u => syncChildProducts(u.id, u.newStock))).catch(console.error);
      }

      const newOrderId = transactionResult.orderId;
      console.log("Pedido confirmado ID:", newOrderId);

      // Save to LocalStorage
      try {
        const existingOrders = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
        const cleanOrders = existingOrders.map((o: any) => typeof o === 'object' ? (o.id || o.orderId) : o);
        if (!cleanOrders.includes(newOrderId)) {
          cleanOrders.push(newOrderId);
          localStorage.setItem('mis_pedidos', JSON.stringify(cleanOrders));
          window.dispatchEvent(new Event("storage"));
        }
        localStorage.setItem('customer_info', JSON.stringify(formData));
      } catch (e) { console.error("Storage error", e); }

      // Telegram
      if (!isAdmin) {
        sendTelegramNotification({
          items: cart, total: finalTotal, shippingCost, cliente: formData, date: Timestamp.now(), status: "pending", id: newOrderId
        }).catch(console.error);
      }

      // Prepara Ticket Data
      const ticketData = {
        id: newOrderId,
        items: [...cart], // Visualmente en el ticket quizás queramos mostrarlo separado o incluido. 
        // Si mostramos `cart` aquí, no saldrá el envío. Deberíamos usar finalItems si lo tenemos disponible fuera de la transacción.
        // Reconstruimos finalItems para el ticket:
        itemsWithShipping: [...cart, ...(shippingCost > 0 ? [{ id: 'shipping-cost', name: 'Envío', price: shippingCost, quantity: 1 }] : [])],
        total: finalTotal,
        paymentMethod: formData.metodoPago
      };

      // IF MERCADO PAGO
      if (formData.metodoPago === 'mercadopago') {
        try {
          const response = await fetch('https://us-central1-el-faro-panaderia.cloudfunctions.net/createPreference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [...cart, ...(shippingCost > 0 ? [{ id: 'shipping-cost', name: 'Envío', price: shippingCost, quantity: 1, stock: true }] : [])],
              orderId: newOrderId
            })
          });
          const data = await response.json();

          if (data.init_point) {
            // Clear local cart but don't show success modal yet, redirect immediately
            // Note: User might come back to empty cart if they cancel. 
            // Ideally we keep cart until success return, but for now this is standard.
            clearCart();
            window.location.href = data.init_point;
            return;
          } else {
            alert("Error al conectar con Mercado Pago.");
            setIsSubmitting(false);
            return;
          }
        } catch (error) {
          console.error("MP Error:", error);
          alert("Error al iniciar el pago.");
          setIsSubmitting(false);
          return;
        }
      }

      // Limpiar UI for Cash/Transfer
      clearCart();
      setShowCheckout(false);
      setFormData({ nombre: "", direccion: "", telefono: "", indicaciones: "", metodoPago: "efectivo" });
      setIsSubmitting(false);

      // SHOW MODAL THEN TICKET
      setShowConfirmation(true);
      setTimeout(() => {
        setShowConfirmation(false);
        setConfirmedOrder(ticketData);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 3000);

    } catch (error: any) {
      console.error("Error al enviar el pedido:", error);
      setIsSubmitting(false);
      if (error.message && error.message.includes("Stock insuficiente")) {
        alert(`⚠️ ${error.message}\n\nPor favor revisa tu carrito.`);
      } else {
        if (error.message) {
          alert(`❌ Error: ${error.message}\n\nSi el problema persiste, contactanos.`);
        } else {
          alert("Error al procesar el pedido. Puede que el stock haya cambiado. Inténtalo de nuevo.");
        }
      }
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

      {confirmedOrder ? (
        <div className="checkout-success-container" style={{ maxWidth: '100%', margin: '0' }}>
          <div className="success-icon-wrapper">
            <FaCheckCircle className="success-icon" />
          </div>

          <h2>¡Compra Exitosa!</h2>
          <p className="success-subtitle">Tu pedido ha sido registrado correctamente.</p>

          <div className="success-ticket">
            <div className="ticket-header">
              <span>ORDEN #{confirmedOrder.id.toString().slice(-6).toUpperCase()}</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>
            <div className="ticket-items">
              {confirmedOrder.itemsWithShipping ? confirmedOrder.itemsWithShipping.map((item: any) => (
                <div key={item.id} className="ticket-item">
                  <span>{item.quantity}x {item.name}</span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              )) : confirmedOrder.items.map((item: any) => (
                <div key={item.id} className="ticket-item">
                  <span>{item.quantity}x {item.name}</span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="ticket-total">
              <span>Total Pagado</span>
              <span>${Math.floor(confirmedOrder.total)}</span>
            </div>
            <div className="payment-info">
              Método: {confirmedOrder.paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'}
            </div>

            {confirmedOrder.paymentMethod === 'transferencia' && (
              <div className="transfer-details-card" style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#495057' }}>
                  Puedes abonar ahora o esperar al repartidor.
                </p>

                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#6c757d', display: 'block' }}>ALIAS</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ fontSize: '1rem', fontWeight: 'bold', color: '#212529', background: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #dee2e6' }}>elfaro80.mp</code>
                    <button
                      onClick={() => handleCopy("elfaro80.mp", "Alias")}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b35600' }}
                      title="Copiar Alias"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.8rem', color: '#6c757d', display: 'block' }}>CVU</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ fontSize: '1rem', fontWeight: 'bold', color: '#212529', background: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #dee2e6' }}>0000003100006832823516</code>
                    <button
                      onClick={() => handleCopy("0000003100006832823516", "CVU")}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b35600' }}
                      title="Copiar CVU"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="success-actions">
            <a
              href={`https://wa.me/5492995206821?text=${encodeURIComponent(`Hola Panadería El Faro! 🥖\nHe realizado un nuevo pedido (ID: ${confirmedOrder.id}).\n\nResumen:\n${confirmedOrder.items.map((i: any) => `- ${i.name} x${i.quantity}`).join('\n')}\n\nTotal: $${Math.floor(confirmedOrder.total)}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp-action"
            >
              <FaWhatsapp /> Avisar por WhatsApp
            </a>

            {notificationPermission === 'default' && (
              <button
                onClick={requestNotificationPermission}
                className="btn-secondary-action"
                style={{ background: '#fffbeb', color: '#b45309', borderColor: '#fcd34d' }}
              >
                <FaBell /> Recibir notificaciones del pedido
              </button>
            )}

            {notificationPermission === 'granted' && (
              <div className="btn-secondary-action" style={{ background: '#dcfce7', color: '#166534', cursor: 'default' }}>
                <FaCheckCircle /> Notificaciones activadas
              </div>
            )}

            {notificationPermission === 'denied' && (
              <div className="btn-secondary-action" style={{ background: '#fee2e2', color: '#991b1b', cursor: 'default' }}>
                <FaBell /> Notificaciones bloqueadas en navegador
              </div>
            )}

            <Link to="/mis-pedidos" className="btn-secondary-action">
              <FaShoppingBag /> Ver Seguimiento
            </Link>

            <button onClick={() => { setConfirmedOrder(null); navigate("/"); }} className="btn-text-action" style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', fontSize: '0.9rem', color: '#888' }}>
              <FaArrowLeft /> Volver al Inicio
            </button>
          </div>
        </div>
      ) : cart.length === 0 ? (
        <p className="empty-cart">El carrito está vacío.</p>
      ) : (
        <>
          {!showCheckout && (
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
            </>
          )}

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

            <div className="checkout-layout">
              {/* Left Column: Form */}
              <div className="checkout-left">
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
                    <div className="phone-input-group">
                      <span className="phone-prefix">+54</span>
                      <input
                        type="tel"
                        id="telefono"
                        name="telefono"
                        value={formData.telefono}
                        onChange={handleInputChange}
                        placeholder="Cod. Área + Número"
                        className={`phone-input-field ${errors.telefono ? "input-error" : ""}`}
                        maxLength={11}
                      />
                    </div>
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

                      {/* Mercado Pago Option (Admin Only for now) */}
                      {isAdmin && (
                        <label className={`radio-card ${formData.metodoPago === 'mercadopago' ? 'selected' : ''}`} style={{ borderColor: formData.metodoPago === 'mercadopago' ? '#009ee3' : '' }}>
                          <input
                            type="radio"
                            name="metodoPago"
                            value="mercadopago"
                            checked={formData.metodoPago === 'mercadopago'}
                            onChange={handleInputChange}
                            className="radio-input"
                          />
                          <div className="radio-icon" style={{ color: '#009ee3', display: 'flex', alignItems: 'center' }}>
                            <img src="https://logotipoz.com/wp-content/uploads/2021/10/versiones-del-logo-de-mercado-pago-1.png" alt="MP" style={{ width: '28px', height: 'auto' }} />
                          </div>
                          <div>
                            <div className="radio-label" style={{ color: formData.metodoPago === 'mercadopago' ? '#009ee3' : 'inherit' }}>Mercado Pago</div>
                            <div className="radio-desc">Tarjetas, Débito, Efectivo</div>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn-confirm" disabled={isSubmitting}>
                      {isSubmitting ? 'Procesando...' : 'Confirmar pedido'}
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
              </div>

              {/* Right Column: Order Summary */}
              <div className="checkout-right">
                <div className="checkout-summary-card">
                  <div className="summary-items">
                    {cart.map((item) => (
                      <div key={item.id} className="summary-item-row">
                        <div className="summary-item-image-wrapper">
                          <div className="summary-item-qty-badge">{item.quantity}</div>
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="summary-item-image" />
                          ) : (
                            <div className="summary-item-placeholder">
                              <FaShoppingBag />
                            </div>
                          )}
                        </div>
                        <div className="summary-item-details">
                          <span className="summary-item-name">{item.name}</span>
                          {/* <span className="summary-item-variant">{item.variant}</span> */}
                        </div>
                        <div className="summary-item-price">
                          ${Math.floor(Number(item.price) * (Number(item.quantity) || 1))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="summary-totals">
                    <div className="summary-row">
                      <span>Subtotal</span>
                      <span>${Math.floor(cartTotal)}</span>
                    </div>
                    <div className="summary-row">
                      <span>Costo de envío</span>
                      <span>${shippingCost}</span>
                    </div>
                    <div className="summary-row total">
                      <span>Total</span>
                      <span className="total-amount-display">${Math.floor(finalTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sticky Checkout Button */}
          {showStickyCheckout && !showCheckout && (
            <div className="sticky-checkout-container">
              <div className="sticky-content">
                <div className="sticky-total">
                  <span>Total:</span>
                  <strong>${Math.floor(finalTotal)}</strong>
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


      {
        showConfirmation && (
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
        )
      }

      {/* Minimum Purchase Error Modal */}
      {
        minPurchaseError.isOpen && (
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
        )
      }

      <StockErrorModal
        isOpen={stockError.isOpen}
        onClose={() => setStockError({ ...stockError, isOpen: false })}
        onConfirm={handleStockFix}
        outOfStockItems={stockError.items}
      />

      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#333',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '20px',
          zIndex: 9999,
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          fontSize: '0.9rem',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          {toastMessage}
        </div>
      )}
    </div >
  );
}