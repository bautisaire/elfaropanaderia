import { useEffect, useRef, useState } from "react";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { FaBoxOpen, FaTimes } from "react-icons/fa";
import { printTicket } from "../utils/printTicket";
import newOrderSound from "../sounds/neworder.mp3";
import pickupStoreSound from "../sounds/pickupstore.mp3";
import noStockSound from "../sounds/nostock.mp3";

export default function GlobalAdminNotifications() {
    const navigate = useNavigate();
    const [showNotification, setShowNotification] = useState(false);
    const [notificationMessage, setNotificationMessage] = useState("");
    const [notificationOrderRef, setNotificationOrderRef] = useState("");

    // Guardamos el momento exacto en el que el admin abre la app (o entra en "modo escucha")
    // Esto evita cargar pedidos que ya estaban en la BD de antes
    const sessionStartTime = useRef<Date>(new Date());

    // Rastreamos los IDs de pedidos y alertas ya notificados en esta sesión
    // para evitar sonidos duplicados si Firebase envía múltiples `added` events
    const notifiedOrdersRef = useRef<Set<string>>(new Set());
    const notifiedAlertsRef = useRef<Set<string>>(new Set());

    // Ref para mutar/limpiar timeout de auto-hide
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Escucha *solo* pedidos que puedan estar pendientse o creándose ahora, no los cancelados.
        const q = query(
            collection(db, "orders"),
            where("status", "in", ["pending", "pending_payment", "pendiente"])
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const newOrder = change.doc.data();

                    // Pedidos de prueba (modo prueba admin): sin alertas ni impresión para nadie
                    if (newOrder.isTestOrder === true) return;

                    const isPos = newOrder.source === 'pos' || newOrder.source === 'pos_public' || newOrder.source === 'pos_wholesale';
                    if (isPos) return;

                    // Ignoramos si el pedido ya existe desde ANTES de que el dispositivo entrara a la app
                    // Los orders no guardados usan date = timestamp en Firebase, hay que castear a ms
                    let orderTime = 0;
                    if (newOrder.date && typeof newOrder.date.toMillis === 'function') {
                        orderTime = newOrder.date.toMillis();
                    } else if (newOrder.date && newOrder.date.seconds) {
                        orderTime = newOrder.date.seconds * 1000;
                    } else if (typeof newOrder.date === "string" || typeof newOrder.date === "number") {
                        orderTime = new Date(newOrder.date).getTime();
                    }

                    // Si el pedido es viejo (creado antes de esta sesión de navegador menos 5 segundos) no mostramos alerta
                    if (orderTime < sessionStartTime.current.getTime() - 5000) return;

                    // Si ya notificamos este pedido en esta sesión, lo ignoramos para no repetir el sonido
                    if (notifiedOrdersRef.current.has(change.doc.id)) return;
                    notifiedOrdersRef.current.add(change.doc.id);

                    const alertsEnabled = localStorage.getItem('admin_order_alerts_enabled') === 'true';
                    const autoPrintEnabled = localStorage.getItem('admin_auto_print_enabled') === 'true';

                    // Los pedidos POS con envío ya imprimen el ticket localmente desde POSManager
                    // al confirmar la venta. Evitamos el doble print aquí.
                    if (autoPrintEnabled && newOrder.source !== 'pos_delivery') {
                        printTicket({ ...newOrder, id: change.doc.id });
                    }

                    // DESKTOP NOTIFICATION
                    if (alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === "granted") {
                        const orderId = change.doc.id.slice(-6).toUpperCase();
                        const titleLabel = newOrder.source === 'pos_delivery' ? 'Delivery POS' : 'Pedido Web';
                        const notification = new Notification(`¡Nuevo ${titleLabel}! #${orderId}`, {
                            body: `Total: $${newOrder.total} - ${newOrder.cliente?.nombre || 'Cliente'}`,
                            tag: change.doc.id,
                            icon: '/logo192.png'
                        });

                        notification.onclick = () => {
                            window.focus();
                            navigate('/editor/orders/deliveries');
                            notification.close();
                        };
                    }

                    // IN-APP NOTIFICATION & SOUND (Always triggered unless disabled? No, these we always trigger to notify if window is active)
                    const orderIdStr = change.doc.id.slice(-6).toUpperCase();
                    const isPosDelivery = newOrder.source === 'pos_delivery';
                    const isPickup = newOrder.cliente?.metodoEntrega === 'pickup';
                    setNotificationMessage(isPosDelivery
                        ? `¡Nueva Delivery POS de ${newOrder.cliente?.nombre || 'Cliente'}! Total: $${newOrder.total}`
                        : `¡Nuevo Pedido Web de ${newOrder.cliente?.nombre || 'Cliente'}! Total: $${newOrder.total}`);
                    setNotificationOrderRef(orderIdStr);
                    setShowNotification(true);

                    // Limpiar timeout anterior si llega otro pedido rápido
                    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                    hideTimeoutRef.current = setTimeout(() => setShowNotification(false), 8000);

                    try {
                        const audio = new Audio(isPickup ? pickupStoreSound : newOrderSound);
                        audio.play().catch(e => console.log("Audio play blocked by browser:", e));
                    } catch (e) {
                        console.log("Audio no soportado o interactuación requerida primero", e);
                    }
                }
            });
        });

        return () => unsubscribe();
    }, [navigate]);

    // Listener para Alertas de Stock
    useEffect(() => {
        const qAlerts = query(collection(db, "stock_alerts"));

        const unsubscribeAlerts = onSnapshot(qAlerts, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const alertData = change.doc.data();

                    let alertTime = 0;
                    if (alertData.date && typeof alertData.date.toMillis === 'function') {
                        alertTime = alertData.date.toMillis();
                    } else if (alertData.date && alertData.date.seconds) {
                        alertTime = alertData.date.seconds * 1000;
                    } else if (typeof alertData.date === "string" || typeof alertData.date === "number") {
                        alertTime = new Date(alertData.date).getTime();
                    }

                    // Ignorar alertas viejas
                    if (alertTime < sessionStartTime.current.getTime() - 5000) return;

                    // Evitar duplicados
                    if (notifiedAlertsRef.current.has(change.doc.id)) return;
                    notifiedAlertsRef.current.add(change.doc.id);

                    const alertsEnabled = localStorage.getItem('admin_order_alerts_enabled') === 'true';

                    // DESKTOP NOTIFICATION
                    if (alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === "granted") {
                        const notification = new Notification(`⚠️ Producto Sin Stock`, {
                            body: `${alertData.productName}. Por favor, reponer a la brevedad.`,
                            tag: change.doc.id,
                            icon: '/logo192.png'
                        });

                        notification.onclick = () => {
                            window.focus();
                            navigate('/editor/inventory');
                            notification.close();
                        };
                    }

                    // IN-APP NOTIFICATION & SOUND
                    setNotificationMessage(`⚠️ ¡Producto sin stock! ${alertData.productName}. Por favor reponer.`);
                    setNotificationOrderRef("STOCK");
                    setShowNotification(true);

                    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                    hideTimeoutRef.current = setTimeout(() => setShowNotification(false), 10000);

                    try {
                        const audio = new Audio(noStockSound);
                        audio.play().catch(e => console.log("Audio play blocked by browser:", e));
                    } catch (e) {
                        console.log("Audio alert failed", e);
                    }
                }
            });
        });

        return () => unsubscribeAlerts();
    }, [navigate]);

    if (!showNotification) return null;

    const isStockAlert = notificationOrderRef === "STOCK";

    return (
        <div
            className="admin-inapp-notification"
            onClick={() => {
                navigate(isStockAlert ? '/editor/inventory' : '/editor/orders/deliveries');
                setShowNotification(false);
            }}
            style={isStockAlert ? { borderLeftColor: '#ef4444' } : {}}
        >
            <div className="notification-icon" style={isStockAlert ? { background: '#fecaca', color: '#ef4444' } : {}}>
                <FaBoxOpen />
            </div>
            <div className="notification-content">
                <h4>{isStockAlert ? "¡Alerta de Inventario!" : `¡Nuevo Pedido #${notificationOrderRef}!`}</h4>
                <p>{notificationMessage}</p>
            </div>
            <button className="notification-close" onClick={(e) => { e.stopPropagation(); setShowNotification(false); }}>
                <FaTimes />
            </button>
        </div>
    );
}
