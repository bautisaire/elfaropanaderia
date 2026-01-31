import { useContext, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FaCheckCircle, FaWhatsapp, FaShoppingBag, FaArrowLeft } from "react-icons/fa";
import { CartContext } from "../context/CartContext";
import "./Checkout.css";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, runTransaction, onSnapshot, DocumentSnapshot } from "firebase/firestore";
import { syncChildProducts } from "../utils/stockUtils"; // Import Syncer

export default function Checkout() {
  /* New Stock System imports are assumed at top */
  const { cart, total, clearCart, isAdmin } = useContext(CartContext);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "efectivo" | "transferencia" | "">("");
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [finalTotal, setFinalTotal] = useState<number>(0);
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
    const unsub = onSnapshot(doc(db, "config", "store_settings"), (docSnap: DocumentSnapshot) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("Configuración actualizada (tiempo real):", data);
        const cost = Number(data?.shippingCost) || 0;
        setShippingCost(cost);
      } else {
        console.log("No existe el documento config/store_settings");
        setShippingCost(0);
      }
    }, (error: any) => {
      console.error("Error escuchando configuración:", error);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const numericTotal = Number(total) || 0;
    const numericShipping = Number(shippingCost) || 0;
    console.log(`Recalculando total: Subtotal=${numericTotal}, Envío=${numericShipping}`);
    setFinalTotal(numericTotal + numericShipping);
  }, [total, shippingCost]);

  /* New Stock System: Import Firestore functions */
  /* Note: Assuming imports are added at the top. I will add them in a separate chunk or rely on auto-imports if possible, but safer to do it manually. */

  const handleConfirm = async () => {
    if (!paymentMethod) {
      alert("Selecciona un método de pago antes de continuar.");
      return;
    }

    try {
      // 1. PRIMERO: Intentar descontar stock en Firestore (Transacción Atómica)
      // Esto asegura que si dos personas compran lo mismo, el segundo fallará aquí.
      const transactionResult = await runTransaction(db, async (transaction) => {
        const productIdsToRead = new Set<string>();
        const cartItemIds = new Set<string>();

        // Recolectar IDs
        cart.forEach(item => {
          const baseId = String(item.id).split('-')[0];
          cartItemIds.add(baseId);
          productIdsToRead.add(baseId);
        });

        // Leer productos base
        const uniqueIds = Array.from(productIdsToRead);
        const refs = uniqueIds.map(id => doc(db, "products", id));
        const docsSnap = await Promise.all(refs.map(ref => transaction.get(ref)));

        const productDocsMap: Record<string, any> = {};
        docsSnap.forEach((snap, i) => {
          if (snap.exists()) {
            productDocsMap[uniqueIds[i]] = snap.data();
          }
        });

        // Leer dependencias (padres)
        const parentIdsToFetch = new Set<string>();
        cart.forEach(item => {
          const baseId = String(item.id).split('-')[0];
          const productData = productDocsMap[baseId];
          if (productData?.stockDependency?.productId) {
            const parentId = productData.stockDependency.productId;
            if (!productDocsMap[parentId]) parentIdsToFetch.add(parentId);
          }
        });

        if (parentIdsToFetch.size > 0) {
          const parentIds = Array.from(parentIdsToFetch);
          const parentRefs = parentIds.map(id => doc(db, "products", id));
          const parentSnaps = await Promise.all(parentRefs.map(ref => transaction.get(ref)));
          parentSnaps.forEach((snap, i) => {
            if (snap.exists()) productDocsMap[parentIds[i]] = snap.data();
          });
        }

        // VALIDAR Y CALCULAR ACTUALIZACIONES
        const productsToUpdate = new Set<string>();
        const stockMovementsToLog: any[] = [];

        for (const item of cart) {
          const baseId = String(item.id).split('-')[0];
          const productData = productDocsMap[baseId];

          if (!productData) throw new Error(`Producto no encontrado: ${item.name}`);

          const qty = Number(item.quantity) || 1;

          // CASO 1: Derivado
          if (productData.stockDependency?.productId) {
            const parentId = productData.stockDependency.productId;
            const parentData = productDocsMap[parentId];

            if (!parentData) throw new Error(`Producto padre no encontrado para: ${item.name}`);

            const unitsToDeduct = Number(productData.stockDependency.unitsToDeduct) || 1;
            const totalDeduct = qty * unitsToDeduct;
            const currentStock = Number(parentData.stockQuantity) || 0;

            if (currentStock < totalDeduct) {
              throw new Error(`Stock insuficiente para ${item.name} (Quedan ${Math.floor(currentStock / unitsToDeduct)})`);
            }

            parentData.stockQuantity = currentStock - totalDeduct;
            parentData.stock = parentData.stockQuantity > 0;
            productsToUpdate.add(parentId);

            stockMovementsToLog.push({
              productId: parentId,
              productName: parentData.nombre,
              quantity: totalDeduct,
              observation: `Venta Derivado: ${item.name}`
            });
          }
          // CASO 2: Normal / Variante
          else {
            let variantName = "";
            const match = item.name ? item.name.match(/\(([^)]+)\)$/) : null;
            if (match) variantName = match[1];

            if (variantName && productData.variants) {
              const vIdx = productData.variants.findIndex((v: any) => v.name === variantName);
              if (vIdx >= 0) {
                const variant = productData.variants[vIdx];
                const currentStock = Number(variant.stockQuantity) || 0;

                if (currentStock < qty) {
                  throw new Error(`Stock insuficiente para ${item.name} (Quedan ${currentStock})`);
                }

                variant.stockQuantity = currentStock - qty;
                variant.stock = variant.stockQuantity > 0;
                productsToUpdate.add(baseId);
              } else {
                throw new Error(`Variante no encontrada: ${variantName}`);
              }
            } else {
              const currentStock = Number(productData.stockQuantity) || 0;
              if (currentStock < qty) {
                throw new Error(`Stock insuficiente para ${item.name} (Quedan ${currentStock})`);
              }

              productData.stockQuantity = currentStock - qty;
              productData.stock = productData.stockQuantity > 0;
              productsToUpdate.add(baseId);
            }

            stockMovementsToLog.push({
              productId: baseId,
              productName: item.name,
              quantity: qty,
              observation: `Pedido Web${variantName ? ` (Var: ${variantName})` : ''}`
            });
          }
        }

        // APLICAR CAMBIOS
        productsToUpdate.forEach(pid => {
          const data = productDocsMap[pid];
          transaction.update(doc(db, "products", pid), {
            stockQuantity: data.stockQuantity,
            stock: data.stock,
            variants: data.variants || []
          });
        });

        // Registrar movimientos
        stockMovementsToLog.forEach(mov => {
          const moveRef = doc(collection(db, "stock_movements"));
          transaction.set(moveRef, {
            ...mov,
            type: 'OUT',
            reason: 'Venta Online',
            date: new Date()
          });
        });

        return Array.from(productsToUpdate).map(id => ({ id, newStock: productDocsMap[id].stockQuantity }));
      });

      // --- SI LLEGAMOS AQUÍ, EL STOCK YA ES NUESTRO (SE DESCONTÓ EXITOSAMENTE) ---

      // 2. Ejecutar sincronización de hijos (no bloqueante para la UI, pero importante)
      if (transactionResult && transactionResult.length > 0) {
        Promise.all(transactionResult.map(u => syncChildProducts(u.id, u.newStock))).catch(console.error);
      }

      // 3. Crear Orden en Firestore (Directamente)
      const orderRef = doc(collection(db, "orders"));

      const finalItems = [...cart];
      if (shippingCost > 0) {
        finalItems.push({
          id: 'shipping-cost',
          name: 'Envío',
          price: shippingCost,
          quantity: 1,
          image: '', // No image for shipping
          stock: true
        });
      }

      const orderData = {
        id: orderRef.id, // Guardamos el ID dentro del documento también
        items: finalItems,
        total: finalTotal,
        paymentMethod,
        source: 'online',
        status: 'pendiente',
        date: new Date()
      };

      try {
        // Guardar orden en Firestore
        await runTransaction(db, async (t) => {
          t.set(orderRef, orderData);
        });

        // Si es efectivo o transferencia, finalizamos
        if (paymentMethod === 'efectivo' || paymentMethod === 'transferencia') {
          setConfirmedOrder(orderData);
          clearCart();
          window.scrollTo({ top: 0, behavior: 'smooth' });

          // Guardar en Mis Pedidos (Local Storage)
          const existingOrders = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
          if (!existingOrders.includes(orderRef.id)) {
            existingOrders.push(orderRef.id);
            localStorage.setItem('mis_pedidos', JSON.stringify(existingOrders));
            window.dispatchEvent(new Event("storage"));
          }
          return;
        }

        // Si es Mercado Pago, llamamos a la Cloud Function
        if (paymentMethod === 'mercadopago') {
          const response = await fetch("https://us-central1-el-faro-panaderia.cloudfunctions.net/createPreference", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: finalItems, orderId: orderRef.id }),
          });

          if (!response.ok) throw new Error("Error al iniciar pago con Mercado Pago");

          const { init_point } = await response.json();

          // Guardar en Mis Pedidos antes de redirigir
          const existingOrders = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
          if (!existingOrders.includes(orderRef.id)) {
            existingOrders.push(orderRef.id);
            localStorage.setItem('mis_pedidos', JSON.stringify(existingOrders));
            window.dispatchEvent(new Event("storage"));
          }

          // Redirigir a Mercado Pago
          window.location.href = init_point;
        }

      } catch (backendError) {
        console.error("Error creando orden:", backendError);
        alert("Hubo un error al procesar la orden. Por favor contáctanos.");
      }

    } catch (error: any) {
      console.error("Error en checkout:", error);
      if (error.message && error.message.includes("Stock insuficiente")) {
        alert(`⚠️ ${error.message}\n\nPor favor, actualiza tu carrito.`);
      } else {
        alert("Ocurrió un error al procesar el pedido. Intentalo de nuevo.");
      }
    }
  };

  if (confirmedOrder) {
    const paymentLabel = confirmedOrder.paymentMethod === 'efectivo' ? 'pedido para pagar en efectivo' : (confirmedOrder.paymentMethod === 'transferencia' ? 'pedido con transferencia' : 'pedido');
    const message = `Hola Panadería El Faro! 🥖\nHe realizado un nuevo ${paymentLabel} (ID: ${confirmedOrder.id}).\n\nResumen:\n${confirmedOrder.items.map((i: any) => `- ${i.name} x${i.quantity}`).join('\n')}\n\nTotal: $${confirmedOrder.total}`;
    const whatsappUrl = `https://wa.me/5492995206821?text=${encodeURIComponent(message)}`;

    return (
      <div className="checkout-success-container">
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
            {confirmedOrder.items.map((item: any) => (
              <div key={item.id} className="ticket-item">
                <span>{item.quantity}x {item.name}</span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="ticket-total">
            <span>Total Pagado</span>
            <span>${confirmedOrder.total}</span>
          </div>
          <div className="payment-info">
            Método: {confirmedOrder.paymentMethod === 'mercadopago' ? 'Mercado Pago' : (confirmedOrder.paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo')}
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
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-whatsapp-action">
            <FaWhatsapp /> Avisar por WhatsApp
          </a>

          <Link to="/mis-pedidos" className="btn-secondary-action">
            <FaShoppingBag /> Ver Seguimiento
          </Link>

          <Link to="/" className="btn-text-action">
            <FaArrowLeft /> Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout">
      <h2>🛒 Checkout</h2>

      {cart.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '20px' }}>El carrito está vacío.</p>
          <Link to="/" style={{ color: '#b35600', fontWeight: 'bold', textDecoration: 'none' }}>Volver al Menú</Link>
        </div>
      ) : (
        <>
          <div className="checkout-products">
            {cart.map((item) => (
              <div key={item.id} className="checkout-item">
                <span>{item.name} x {item.quantity}</span>
                <span>${item.price * (item.quantity || 1)}</span>
              </div>
            ))}
            {shippingCost > 0 && (
              <div className="checkout-item shipping-item">
                <span>🚚 Envío</span>
                <span>${shippingCost}</span>
              </div>
            )}
          </div>

          <h3>Total: ${finalTotal}</h3>

          <div className="payment-method">
            <p>Selecciona un método de pago:</p>
            {isAdmin && (
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
            )}
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
            <label style={{ marginLeft: '15px' }}>
              <input
                type="radio"
                name="payment"
                value="transferencia"
                checked={paymentMethod === "transferencia"}
                onChange={() => setPaymentMethod("transferencia")}
              />
              Transferencia (Alias/CVU)
            </label>
          </div>

          <button className="confirm-btn" onClick={handleConfirm}>
            Confirmar pedido
          </button>
        </>
      )}
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
    </div>
  );
}