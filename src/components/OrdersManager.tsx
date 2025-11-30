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
    status: "pending" | "done" | "cancelled";
}

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
            })) as Order[];
            setOrders(ordersData);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching orders:", err);
            setError("Error al cargar pedidos. Verifica la consola o los permisos.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const updateStatus = async (id: string, status: "pending" | "done" | "cancelled") => {
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
                {orders.map((order) => (
                    <div key={order.id} className={`order-card ${order.status}`}>
                        <div className="order-header">
                            <span className="order-date">
                                {order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleString() : "Fecha desconocida"}
                            </span>
                            <span className={`status-badge ${order.status}`}>
                                {order.status === "pending" ? "Pendiente" : order.status === "done" ? "Hecho" : "Cancelado"}
                            </span>
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
                                            {item.quantity}x {item.name} (${item.price})
                                        </li>
                                    ))}
                                </ul>
                                <p className="order-total">Total: ${order.total}</p>
                            </div>
                        </div>

                        <div className="order-actions">
                            {order.status !== "pending" && (
                                <button onClick={() => updateStatus(order.id, "pending")} className="btn-pending">
                                    Marcar Pendiente
                                </button>
                            )}
                            {order.status !== "done" && (
                                <button onClick={() => updateStatus(order.id, "done")} className="btn-done">
                                    Marcar Hecho
                                </button>
                            )}
                            {order.status !== "cancelled" && (
                                <button onClick={() => updateStatus(order.id, "cancelled")} className="btn-cancel">
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
