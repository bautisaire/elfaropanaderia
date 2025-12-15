import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, onSnapshot, updateDoc, doc, orderBy, query } from "firebase/firestore";
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
    { value: "pendiente", label: "Pendiente", color: "#f59e0b" },
    { value: "preparando", label: "Preparando", color: "#3b82f6" },
    { value: "enviado", label: "Enviado", color: "#8b5cf6" },
    { value: "entregado", label: "Entregado", color: "#10b981" },
    { value: "cancelado", label: "Cancelado", color: "#ef4444" },
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
                status: doc.data().status || "pendiente" // Fallback
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
        }
    };

    if (loading) return <div>Cargando pedidos...</div>;
    if (error) return <div className="error-message">{error}</div>;

    return (
        <div className="orders-manager">
            <h2>Gestión de Pedidos</h2>
            <div className="orders-list">
                {orders.map((order) => {
                    const currentStatus = statusOptions.find(s => s.value === order.status) || statusOptions[0];
                    return (
                        <div key={order.id} className="order-card" style={{ borderLeft: `5px solid ${currentStatus.color}` }}>
                            <div className="order-header">
                                <span className="order-date">
                                    {order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleString() : "Fecha desconocida"}
                                </span>
                                <select
                                    value={order.status}
                                    onChange={(e) => updateStatus(order.id, e.target.value)}
                                    className="status-select"
                                    style={{
                                        backgroundColor: currentStatus.color,
                                        color: 'white',
                                        border: 'none',
                                        padding: '5px 10px',
                                        borderRadius: '20px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {statusOptions.map(opt => (
                                        <option key={opt.value} value={opt.value} style={{ backgroundColor: 'white', color: 'black' }}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="order-details">
                                <div className="client-info">
                                    <h4>Cliente</h4>
                                    <p><strong>Nombre:</strong> {order.cliente.nombre}</p>
                                    <p><strong>Dirección:</strong> {order.cliente.direccion}</p>
                                    <p><strong>Teléfono:</strong> {order.cliente.telefono}</p>
                                    {order.cliente.indicaciones && <p><strong>Nota:</strong> {order.cliente.indicaciones}</p>}
                                    <p><strong>Pago:</strong> {order.cliente.metodoPago}</p>
                                </div>

                                <div className="items-info">
                                    <h4>Productos</h4>
                                    <ul>
                                        {order.items.map((item, index) => (
                                            <li key={index}>
                                                {item.quantity}x {item.name} (${Math.floor(item.price)})
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="order-total">Total: ${order.total}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
