import { useEffect, useRef, useState } from "react";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { FaBoxOpen, FaTimes } from "react-icons/fa";

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

                    // DESKTOP NOTIFICATION
                    if (alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === "granted") {
                        const orderId = change.doc.id.slice(-6).toUpperCase();
                        const notification = new Notification(`¡Nuevo Pedido Web! #${orderId}`, {
                            body: `Total: $${newOrder.total} - ${newOrder.cliente?.nombre || 'Cliente'}`,
                            tag: change.doc.id,
                            icon: '/logo192.png'
                        });

                        notification.onclick = () => {
                            window.focus();
                            navigate('/editor/orders/web');
                            notification.close();
                        };
                    }

                    // IN-APP NOTIFICATION & SOUND (Always triggered unless disabled? No, these we always trigger to notify if window is active)
                    const orderIdStr = change.doc.id.slice(-6).toUpperCase();
                    setNotificationMessage(`¡Nuevo Pedido Web de ${newOrder.cliente?.nombre || 'Cliente'}! Total: $${newOrder.total}`);
                    setNotificationOrderRef(orderIdStr);
                    setShowNotification(true);

                    // Limpiar timeout anterior si llega otro pedido rápido
                    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                    hideTimeoutRef.current = setTimeout(() => setShowNotification(false), 8000);

                    try {
                        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                        const oscillator = audioCtx.createOscillator();
                        const gainNode = audioCtx.createGain();

                        oscillator.type = 'sine';
                        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
                        oscillator.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.1); // A5

                        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

                        oscillator.connect(gainNode);
                        gainNode.connect(audioCtx.destination);

                        oscillator.start(audioCtx.currentTime);
                        oscillator.stop(audioCtx.currentTime + 0.5);
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
                        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                        const oscillator = audioCtx.createOscillator();
                        const gainNode = audioCtx.createGain();

                        // Opción 2: Un "Pop" Discreto (estilo notificación corta/burbuja)
                        oscillator.type = 'sine';

                        // Frecuencia inicial baja, cae muy rápido
                        oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
                        oscillator.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.1);

                        // Volumen también sube rápido y cae rápido (golpe corto)
                        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.02);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

                        oscillator.connect(gainNode);
                        gainNode.connect(audioCtx.destination);

                        oscillator.start(audioCtx.currentTime);
                        oscillator.stop(audioCtx.currentTime + 0.15);

                        // Segundo "pop" pequeñito para darle efecto de "doble tono de burbuja"
                        setTimeout(() => {
                            try {
                                const osc2 = audioCtx.createOscillator();
                                const gain2 = audioCtx.createGain();
                                osc2.type = 'sine';
                                osc2.frequency.setValueAtTime(500, audioCtx.currentTime);
                                osc2.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);

                                gain2.gain.setValueAtTime(0, audioCtx.currentTime);
                                gain2.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
                                gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

                                osc2.connect(gain2);
                                gain2.connect(audioCtx.destination);
                                osc2.start(audioCtx.currentTime);
                                osc2.stop(audioCtx.currentTime + 0.1);
                            } catch (e) { }
                        }, 120);
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
                navigate(isStockAlert ? '/editor/inventory' : '/editor/orders/web');
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
