import { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebase/firebaseConfig';
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore';
import { FaCheckCircle, FaUserCircle, FaMotorcycle, FaChevronDown } from 'react-icons/fa';
import { CartContext } from '../context/CartContext';
import './MisPedidos.css'; // Let's use the same CSS classes from MyAccount, plus specific ones

interface Order {
    id: string;
    items: any[];
    total: number;
    status: string;
    date: any;
    cliente?: any;
}

const statusMap: Record<string, { label: string, color: string }> = {
    pending: { label: "Pendiente", color: "#f59e0b" },
    pendiente: { label: "Pendiente", color: "#f59e0b" },
    preparando: { label: "Preparando", color: "#3b82f6" },
    enviado: { label: "En Camino", color: "#8b5cf6" },
    entregado: { label: "Entregado", color: "#10b981" },
    cancelado: { label: "Cancelado", color: "#ef4444" },
    pending_payment: { label: "Verificando Pago", color: "#3b82f6" },
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

export default function MisPedidos() {
    const { user } = useContext(CartContext);
    const navigate = useNavigate();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Scroll to top
        window.scrollTo(0, 0);

        // If user is logged in, perhaps we redirect them to their true MyAccount/compras? No, we can render the same logic or let them stay here.
        // Actually, if logged in, maybe we just fetch their orders normally, but the requirement is to use LocalStorage.

        const storedIds = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');

        if (storedIds.length === 0) {
            setOrders([]);
            setLoading(false);
            return;
        }

        let validIds = storedIds
            .map((item: any) => String(typeof item === 'object' ? (item.id || item.orderId) : item))
            .filter((id: string) => id && id !== 'undefined' && id !== 'null');

        if (validIds.length === 0) {
            setLoading(false);
            return;
        }

        // --- NEW LOGIC: Only show latest order if NOT logged in ---
        if (!user) {
            // Keep only the most recent (last) order
            validIds = [validIds[validIds.length - 1]];
        }
        // If user IS logged in, DO NOT slice. We show all orders.

        const chunkArray = (arr: string[], size: number) => {
            const chunks = [];
            for (let i = 0; i < arr.length; i += size) {
                chunks.push(arr.slice(i, i + size));
            }
            return chunks;
        };

        const chunks = chunkArray(validIds, 10);
        const unsubscribers: (() => void)[] = [];
        let chunksLoaded = 0;

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
                if (chunksLoaded >= chunks.length) setLoading(false);
            }, () => {
                setLoading(false); // Even on error, stop loading
            });
            unsubscribers.push(unsub);
        });

        return () => unsubscribers.forEach(unsub => unsub());
    }, [user?.uid]);

    return (
        <div className="mis-pedidos-page-container">
            <div className="mis-pedidos-header">
                <h2>Seguimiento de mis Pedidos</h2>
                <p>Aquí puedes ver el estado en tiempo real de los pedidos guardados en este dispositivo.</p>
            </div>

            <div className="mis-pedidos-content">
                {loading && orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>Cargando tus pedidos...</div>
                ) : orders.length === 0 ? (
                    <div className="placeholder-card empty-state-card" style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
                        <FaMotorcycle size={60} color="#ffdecc" style={{ marginBottom: '15px' }} />
                        <h3>Aún no tienes compras recientes</h3>
                        <p style={{ color: '#666', marginTop: 10 }}>Cuando realices un pedido desde este navegador, podrás hacerle seguimiento desde aquí.</p>
                        <Link to="/" className="btn-primary-action" style={{ marginTop: '20px', display: 'inline-block' }}>Ir a la tienda</Link>
                    </div>
                ) : (
                    <div className="orders-timeline-view" style={{ maxWidth: 700, margin: '0 auto' }}>
                        {orders.map(order => (
                            <PublicCompraCard key={order.id} order={order} />
                        ))}
                    </div>
                )}
            </div>

            {/* Banner inferior para "Iniciar sesión" */}
            {!user && (
                <div className="mis-pedidos-login-banner">
                    <div className="banner-content">
                        <FaUserCircle size={40} className="banner-icon" />
                        <div className="banner-text">
                            <h4>¿Quieres no perder tu historial?</h4>
                            <p>Inicia sesión y tus pedidos se guardarán en la nube de forma segura, accesibles desde cualquier dispositivo.</p>
                        </div>
                        <button className="btn-banner-login" onClick={() => navigate('/mi-cuenta')}>
                            Iniciar Sesión
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Subcomponente de Tarjeta
const PublicCompraCard = ({ order }: { order: Order }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const statusInfo = statusMap[order.status] || { label: order.status, color: '#999' };

    const renderTimeline = (currentStatus: string) => {
        if (currentStatus === 'cancelado') return null;
        const currentIndex = getStepIndex(currentStatus);

        return (
            <div className="timeline-container">
                <div className="timeline-line-bg"></div>
                {steps.map((step, index) => {
                    let statusClass = '';
                    if (index < currentIndex) statusClass = 'completed';
                    if (index === currentIndex) statusClass = 'active';

                    const stepInfo = statusMap[step.key] || { color: '#ccc' };
                    const isActiveOrCompleted = index <= currentIndex;
                    const circleStyle = isActiveOrCompleted
                        ? { borderColor: stepInfo.color }
                        : {};

                    return (
                        <div key={step.key} className={`timeline-step ${statusClass}`}>
                            <div className="timeline-circle" style={{ ...circleStyle }}>
                                {isActiveOrCompleted && index < currentIndex && <FaCheckCircle color={stepInfo.color} size={16} style={{ background: '#fff' }} />}
                            </div>
                            <div className="timeline-label">{step.label}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="compra-card public-card" style={{ cursor: 'pointer', marginBottom: 20 }} onClick={() => setIsExpanded(!isExpanded)}>
            <div className={`compra-header ${isExpanded ? 'expanded' : ''}`} style={{ borderBottom: isExpanded ? '1px solid #f0f0f0' : 'none', paddingBottom: isExpanded ? '20px' : '0', marginBottom: isExpanded ? '25px' : '0' }}>
                <div className="compra-header-left">
                    <div className="compra-icon-wrapper" style={{ backgroundColor: 'var(--primary-color)' }}>
                        <FaMotorcycle color="#fff" />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, color: '#333' }}>Pedido #{/^\d+$/.test(order.id) ? order.id : order.id.slice(-6).toUpperCase()}</h4>
                        <span style={{ fontSize: '0.85rem', color: '#666' }}>
                            {order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) : "Fecha desconocida"}
                        </span>
                    </div>
                </div>
                <div className="compra-header-right">
                    <span className="compra-status-badge" style={{ color: statusInfo.color, backgroundColor: `${statusInfo.color}15`, border: `1px solid ${statusInfo.color}30` }}>
                        {statusInfo.label}
                    </span>
                    <span className="compra-total-top">${Math.floor(order.total)}</span>
                    <span style={{ color: '#999', fontSize: '1.2rem', transition: 'transform 0.3s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                        <FaChevronDown />
                    </span>
                </div>
            </div>

            {isExpanded && (
                <div className="compra-details-expanded" onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                    {renderTimeline(order.status)}

                    <div className="compra-products-section">
                        <h5 className="compra-products-title">Productos</h5>
                        {order.items.map((item: any, idx: number) => (
                            <div key={idx} className="compra-product-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <img src={item.image || "https://via.placeholder.com/50"} alt={item.name} className="compra-product-img" />
                                    <div>
                                        <h6 style={{ margin: 0, fontSize: '0.95rem' }}>{item.name}</h6>
                                        <span style={{ fontSize: '0.85rem', color: '#666' }}>{item.variant ? item.variant : ''} Cant: {item.quantity}</span>
                                    </div>
                                </div>
                                <span className="compra-product-price">${Math.ceil(item.price * (item.quantity || 1))}</span>
                            </div>
                        ))}
                    </div>

                    <div className="compra-footer-info">
                        <div className="compra-info-col">
                            <span className="compra-info-label">Envío</span>
                            <span className="compra-info-value">{order.cliente?.direccion || 'A coordinar'}</span>
                        </div>
                        <div className="compra-info-col">
                            <span className="compra-info-label">Pago</span>
                            <span className="compra-info-value" style={{ textTransform: 'capitalize' }}>{order.cliente?.metodoPago || 'Efectivo/Transferencia'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
