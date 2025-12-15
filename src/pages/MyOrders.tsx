import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { onSnapshot, documentId, query, collection, where } from "firebase/firestore";
import "./MyOrders.css";

interface Order {
    id: string;
    items: any[];
    total: number;
    status: string;
    date: any;
}

const statusMap: Record<string, { label: string, color: string }> = {
    pending: { label: "Pendiente", color: "#f59e0b" },
    pendiente: { label: "Pendiente", color: "#f59e0b" },
    preparando: { label: "Preparando", color: "#3b82f6" },
    enviado: { label: "En Camino", color: "#8b5cf6" },
    entregado: { label: "Entregado", color: "#10b981" },
    cancelado: { label: "Cancelado", color: "#ef4444" },
};

const steps = [
    { key: 'pendiente', label: 'Pendiente' },
    { key: 'preparando', label: 'Preparando' },
    { key: 'enviado', label: 'Enviado' },
    { key: 'entregado', label: 'Entregado' }
];

const getStepIndex = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'pending') return 0;
    return steps.findIndex(s => s.key === normalized);
};

// Skeleton Component
const OrderSkeleton = () => (
    <div className="skeleton-card">
        <div className="skeleton-line medium"></div>
        <div className="skeleton-line short"></div>
        <div style={{ marginTop: '20px' }}>
            <div className="skeleton-line long"></div>
            <div className="skeleton-line long"></div>
        </div>
    </div>
);

export default function MyOrders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedIds = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');

        if (storedIds.length === 0) {
            setOrders([]);
            setLoading(false);
            return;
        }

        // Clean IDs
        const validIds = storedIds
            .map((item: any) => typeof item === 'object' ? (item.id || item.orderId) : item)
            .filter((id: any) => id);

        if (validIds.length === 0) {
            setLoading(false);
            return;
        }

        const chunkArray = (arr: string[], size: number) => {
            const chunks = [];
            for (let i = 0; i < arr.length; i += size) {
                chunks.push(arr.slice(i, i + size));
            }
            return chunks;
        };

        const chunks = chunkArray(validIds, 10);
        const unsubscribers: (() => void)[] = [];

        // Track loading for each chunk
        let chunksLoaded = 0;
        const totalChunks = chunks.length;

        chunks.forEach(chunk => {
            const q = query(collection(db, "orders"), where(documentId(), "in", chunk));

            const unsub = onSnapshot(q, (snapshot) => {
                const chunkOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

                setOrders(prev => {
                    const existing = [...prev];
                    chunkOrders.forEach(newOrder => {
                        const idx = existing.findIndex(o => o.id === newOrder.id);
                        if (idx >= 0) existing[idx] = newOrder;
                        else existing.push(newOrder);
                    });

                    return existing.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
                });

                chunksLoaded++;
                if (chunksLoaded >= totalChunks) {
                    setLoading(false);
                }
            }, (error) => {
                console.error("Error listening to orders:", error);
                setLoading(false);
            });

            unsubscribers.push(unsub);
        });

        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }, []);

    // Logic to separate logic and history
    // Filter and sort
    const dateCutoff = new Date('2025-12-14T00:00:00-03:00').getTime() / 1000;

    // Filter old orders first
    const recentOrders = orders.filter(o => (o.date?.seconds || 0) >= dateCutoff);

    // Split into Active and History
    const activeOrders = recentOrders.filter(o =>
        o.status !== 'entregado' && o.status !== 'cancelado' && o.status !== 'done'
    );

    const historyOrders = recentOrders.filter(o =>
        o.status === 'entregado' || o.status === 'cancelado' || o.status === 'done'
    );

    if (loading && orders.length === 0) {
        return (
            <div className="my-orders-container">
                <h2>Mis Pedidos</h2>
                <div className="orders-grid">
                    <OrderSkeleton />
                    <OrderSkeleton />
                    <OrderSkeleton />
                </div>
            </div>
        );
    }

    return (
        <div className="my-orders-container">
            <h2>Mis Pedidos</h2>

            {recentOrders.length === 0 ? (
                <div className="no-orders">
                    <p>No tienes pedidos recientes guardados en este dispositivo.</p>
                </div>
            ) : (
                <>
                    {/* Active Orders Section */}
                    {activeOrders.length > 0 && (
                        <div className="orders-section">
                            {activeOrders.map(order => (
                                <OrderCard key={order.id} order={order} />
                            ))}
                        </div>
                    )}

                    {/* History Section */}
                    {historyOrders.length > 0 && (
                        <div className="orders-history-section">
                            <h3 className="history-title" style={{ marginTop: '40px', marginBottom: '20px', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                Historial de pedidos
                            </h3>
                            <div className="orders-grid">
                                {historyOrders.map(order => (
                                    <OrderCard key={order.id} order={order} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// Helper component to avoid repetition and encapsulate stepper
const OrderCard = ({ order }: { order: Order }) => {
    const statusInfo = statusMap[order.status] || { label: order.status, color: '#gray' };

    const renderStepper = (currentStatus: string) => {
        if (currentStatus === 'cancelado') return null;
        const currentIndex = getStepIndex(currentStatus);

        return (
            <div className="stepper-container">
                <div className="stepper-line-bg"></div>
                {steps.map((step, index) => {
                    let statusClass = '';
                    if (index < currentIndex) statusClass = 'completed';
                    if (index === currentIndex) statusClass = 'active';

                    // Get color for this specific step
                    const stepInfo = statusMap[step.key] || { color: '#ccc' };
                    const isActiveOrCompleted = index <= currentIndex;
                    const circleStyle = isActiveOrCompleted
                        ? { backgroundColor: stepInfo.color, borderColor: stepInfo.color }
                        : {};

                    // For active step, add a colored shadow/ring
                    const activeStyle = index === currentIndex
                        ? { boxShadow: `0 0 0 4px ${stepInfo.color}33` } // 33 is approx 20% opacity hex
                        : {};

                    return (
                        <div key={step.key} className={`step ${statusClass}`}>
                            <div
                                className="step-circle"
                                style={{ ...circleStyle, ...activeStyle }}
                            >
                                {index + 1}
                            </div>
                            <div className="step-label">{step.label}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="my-order-card" style={{ borderLeft: `5px solid ${statusInfo.color}` }}>
            <div className="order-header">
                <span className="order-date">
                    {order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleString() : "Fecha desconocida"}
                </span>
                <span className="status-badge" style={{ backgroundColor: statusInfo.color }}>
                    {statusInfo.label}
                </span>
            </div>

            <div className="order-items">
                {order.items.map((item: any, idx: number) => (
                    <div key={idx} className="order-item-row">
                        <span>{item.quantity}x {item.name}</span>
                    </div>
                ))}
            </div>

            <div className="order-footer">
                <strong>Total: ${order.total}</strong>
            </div>

            {renderStepper(order.status)}
        </div>
    );
};
