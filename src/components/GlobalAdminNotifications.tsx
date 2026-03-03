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

    if (!showNotification) return null;

    return (
        <div className="admin-inapp-notification" onClick={() => { navigate('/editor/orders/web'); setShowNotification(false); }}>
            <div className="notification-icon"><FaBoxOpen /></div>
            <div className="notification-content">
                <h4>¡Nuevo Pedido #{notificationOrderRef}!</h4>
                <p>{notificationMessage}</p>
            </div>
            <button className="notification-close" onClick={(e) => { e.stopPropagation(); setShowNotification(false); }}>
                <FaTimes />
            </button>
        </div>
    );
}
