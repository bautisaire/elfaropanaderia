import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, onSnapshot, updateDoc, doc, orderBy, query } from "firebase/firestore";
import { FaCalendarAlt, FaUser, FaMapMarkerAlt, FaPhone, FaCreditCard, FaSync, FaCheckCircle, FaClock, FaTruck, FaTimesCircle, FaBoxOpen } from 'react-icons/fa';
import "./OrdersManager.css";

interface Order {
    id: string;
    items: any[];
    total: number;
    cliente: {
        nombre: string;
        direccion: string;
        telefono: string;
        indicaciones?: string;
        metodoPago: string;
    };
    date: any;
    status: "pendiente" | "preparando" | "enviado" | "entregado" | "cancelado";
}

const statusOptions = [
    { value: "pendiente", label: "Pendiente", color: "#f59e0b", icon: <FaClock /> },
    { value: "preparando", label: "Preparando", color: "#3b82f6", icon: <FaBoxOpen /> },
    { value: "enviado", label: "Enviado", color: "#8b5cf6", icon: <FaTruck /> },
    { value: "entregado", label: "Entregado", color: "#10b981", icon: <FaCheckCircle /> },
    { value: "cancelado", label: "Cancelado", color: "#ef4444", icon: <FaTimesCircle /> },
];

export default function OrdersManager() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, "orders"), orderBy("date", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                status: doc.data().status || "pendiente"
            })) as Order[];
            setOrders(ordersData);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching orders:", err);
            setError("Error al cargar pedidos.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const updateStatus = async (id: string, status: string) => {
        try {
            await updateDoc(doc(db, "orders", id), { status });
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Error al actualizar el estado");
        }
    };

    return (
        <div className="product-manager-container"> {/* Reuse container */}
            <div className="pm-header">
                <div>
                    <h2>Gestión de Pedidos</h2>
                    <p>Administra y actualiza el estado de los pedidos recibidos.</p>
                </div>
            </div>

            {error && <div className="pm-alert error">{error}</div>}

            {loading ? (
                <div className="loading-state">
                    <FaSync className="spin" size={30} />
                    <p>Cargando pedidos...</p>
                </div>
            ) : (
                <div className="orders-list-container">
                    <div className="orders-summary-bar">
                        <span className="summary-pill">Total: <strong>{orders.length}</strong></span>
                        <span className="summary-pill pending">Pendientes: <strong>{orders.filter(o => o.status === 'pendiente').length}</strong></span>
                    </div>

                    <div className="orders-grid">
                        {orders.map((order) => {
                            const currentStatus = statusOptions.find(s => s.value === order.status) || statusOptions[0];
                            const dateStr = order.date?.seconds
                                ? new Date(order.date.seconds * 1000).toLocaleString('es-AR', {
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                })
                                : "Fecha desc.";

                            return (
                                <div key={order.id} className={`pm-card order-card order-status-${order.status}`}>
                                    {/* Card Header */}
                                    <div className="order-card-header">
                                        <div className="order-meta">
                                            <span className="order-id">#{order.id.slice(-6).toUpperCase()}</span>
                                            <span className="order-date"><FaCalendarAlt /> {dateStr}</span>
                                        </div>
                                        <div className="status-selector-wrapper" style={{ borderColor: currentStatus.color }}>
                                            <span className="status-icon" style={{ color: currentStatus.color }}>{currentStatus.icon}</span>
                                            <select
                                                value={order.status}
                                                onChange={(e) => updateStatus(order.id, e.target.value)}
                                                className="status-dropdown"
                                                style={{ color: currentStatus.color }}
                                            >
                                                {statusOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="order-card-body">
                                        {/* Client Info */}
                                        <div className="order-section client-section">
                                            <h5><FaUser /> Datos del Cliente</h5>
                                            <div className="info-row">
                                                <strong>{order.cliente.nombre}</strong>
                                            </div>
                                            <div className="info-row">
                                                <FaMapMarkerAlt className="icon-muted" /> {order.cliente.direccion}
                                            </div>
                                            <div className="info-row">
                                                <FaPhone className="icon-muted" /> {order.cliente.telefono}
                                            </div>
                                            <div className="info-row">
                                                <FaCreditCard className="icon-muted" /> {order.cliente.metodoPago}
                                            </div>
                                            {order.cliente.indicaciones && (
                                                <div className="order-note">
                                                    "{order.cliente.indicaciones}"
                                                </div>
                                            )}
                                        </div>

                                        {/* Items Info */}
                                        <div className="order-section items-section">
                                            <h5>Detalle del Pedido</h5>
                                            <ul className="order-items-list">
                                                {order.items.map((item, index) => (
                                                    <li key={index} className="order-item">
                                                        <span className="item-qty">{item.quantity}x</span>
                                                        <span className="item-name">{item.name} {item.variant ? `(${item.variant})` : ''}</span>
                                                        <span className="item-price">${Math.floor(item.price)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <div className="order-total-row">
                                                <span>Total a cobrar:</span>
                                                <span className="total-amount">${order.total}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {orders.length === 0 && (
                            <div className="empty-state">
                                <p>No hay pedidos registrados.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
