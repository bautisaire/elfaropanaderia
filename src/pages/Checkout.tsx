import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaCheckCircle, FaWhatsapp, FaShoppingBag, FaArrowLeft } from "react-icons/fa";
import { CartContext } from "../context/CartContext";
import "./Checkout.css";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, runTransaction } from "firebase/firestore";
import { syncChildProducts } from "../utils/stockUtils"; // Import Syncer

export default function Checkout() {
  /* New Stock System imports are assumed at top */
  const { cart, total, clearCart } = useContext(CartContext);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "efectivo" | "">("");
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);
  const navigate = useNavigate();

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
            const match = item.name.match(/\(([^)]+)\)$/);
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

      // 3. Crear Orden en Backend
      const orderData = {
        items: cart,
        total,
        paymentMethod,
        source: 'online',
        status: 'pendiente',
        date: new Date()
      };

      try {
        const response = await fetch("https://elfaropanaderia-backend-production.up.railway.app/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });

        if (response.ok) {
          let newOrderId = "PENDIENTE";

          // Guardar en Mis Pedidos
          try {
            const responseData = await response.json();
            newOrderId = responseData.id || responseData.orderId || "PENDIENTE";

            if (newOrderId !== "PENDIENTE") {
              const existingOrders = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
              const cleanOrders = existingOrders.map((o: any) => typeof o === 'object' ? o.id : o);
              if (!cleanOrders.includes(newOrderId)) {
                cleanOrders.push(newOrderId);
                localStorage.setItem('mis_pedidos', JSON.stringify(cleanOrders));
                window.dispatchEvent(new Event("storage"));
              }
            }
          } catch (e) { console.error("Error local storage", e); }

          // ÉXITO REAL: Guardar datos para mostrar ticket
          const finalOrder = {
            id: newOrderId,
            items: [...cart], // Copia para el ticket
            total: total,
            paymentMethod: paymentMethod,
            date: new Date()
          };

          setConfirmedOrder(finalOrder);
          clearCart();
          window.scrollTo({ top: 0, behavior: 'smooth' });

        } else {
          console.error("Error backend order creation");
          alert("Tu pedido se procesó pero hubo un error de conexión final. Por favor contáctanos con tu comprobante.");
          clearCart();
        }

      } catch (backendError) {
        console.error("Backend error", backendError);
        alert("Error de conexión al guardar el pedido. Tu stock fue reservado. Contáctanos.");
        clearCart();
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
    const message = `Hola Panadería El Faro! 🥖\nHe realizado un nuevo ${confirmedOrder.paymentMethod === 'efectivo' ? 'pedido para pagar en efectivo' : 'pedido'} (ID: ${confirmedOrder.id}).\n\nResumen:\n${confirmedOrder.items.map((i: any) => `- ${i.name} x${i.quantity}`).join('\n')}\n\nTotal: $${confirmedOrder.total}`;
    const whatsappUrl = `https://wa.me/5491112345678?text=${encodeURIComponent(message)}`; // Reemplazar con número real

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
            Método: {confirmedOrder.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Efectivo'}
          </div>
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