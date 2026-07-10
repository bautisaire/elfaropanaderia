import { useState, useEffect } from 'react';
import { db, auth } from '../firebase/firebaseConfig';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, limit } from 'firebase/firestore';
import { FaMotorcycle, FaChartLine, FaCheckCircle, FaMoneyBillWave, FaCalendarAlt, FaMapMarkerAlt, FaPhone, FaUser, FaClock, FaCopy, FaChevronDown, FaChevronUp, FaDollarSign } from 'react-icons/fa';
import GlobalDeliveriesMapModal from './GlobalDeliveriesMapModal';
import './RiderDashboard.css';

interface Order {
    id: string;
    items: any[];
    total: number;
    shippingCost: number;
    cliente: {
        nombre: string;
        direccion: string;
        telefono: string;
        indicaciones?: string;
        metodoPago: string;
        mapsLink?: string;
        location?: {
            lat: number;
            lng: number;
        };
    };
    transferenciaEstado?: "pendiente" | "pagado";
    date: any;
    status: string;
    assignedRider?: string;
}

interface RiderExtra {
    id: string;
    amount: number;
    date: string;
    description: string;
}

export default function RiderDashboard() {
    const [activeTab, setActiveTab] = useState<'pedidos' | 'dashboard'>('pedidos');
    const [orders, setOrders] = useState<Order[]>([]);
    const [extras, setExtras] = useState<RiderExtra[]>([]);
    const [filter, setFilter] = useState<'hoy' | 'semana' | 'mes' | 'custom'>('hoy');
    const [customStart, setCustomStart] = useState<string>('');
    const [customEnd, setCustomEnd] = useState<string>('');

    // Quick Replies
    const [quickReplies] = useState<string[]>(() => {
        const saved = localStorage.getItem('riderQuickReplies');
        return saved ? JSON.parse(saved) : [];
    });

    // Delivery Confirmation
    const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);

    // Accordion History
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const [visibleHistoryCount, setVisibleHistoryCount] = useState<number>(10);

    // Accordion Active Orders
    const [expandedActiveOrderId, setExpandedActiveOrderId] = useState<string | null>(null);

    // Pedidos Tab View
    const [pedidosTab, setPedidosTab] = useState<'lista' | 'mapa'>('lista');

    const toggleActiveOrderAccordion = (id: string) => {
        setExpandedActiveOrderId(prev => prev === id ? null : id);
    };

    const currentUserEmail = auth.currentUser?.email || '';

    // Fetch Orders Assigned to Rider
    useEffect(() => {
        if (!currentUserEmail) return;

        const q = query(
            collection(db, "orders"),
            where("assignedRider", "==", currentUserEmail),
            orderBy("date", "desc"),
            limit(150)
        );

        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
            setOrders(data);
        }, (error) => {
            console.warn("Error fetching rider orders:", error);
        });

        return () => unsub();
    }, [currentUserEmail]);

    // Fetch Rider Extras
    useEffect(() => {
        if (!currentUserEmail) return;

        const q = query(
            collection(db, "rider_extras"),
            where("riderEmail", "==", currentUserEmail)
        );

        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderExtra));
            setExtras(data);
        }, (error) => {
            console.warn("Error fetching rider extras:", error);
        });

        return () => unsub();
    }, [currentUserEmail]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleConfirmDelivery = async () => {
        if (!confirmOrder) return;
        try {
            await updateDoc(doc(db, "orders", confirmOrder.id), {
                status: "entregado",
                paidToRider: false
            });
            setConfirmOrder(null);
        } catch (error) {
            console.error("Error updating order status", error);
            alert("Hubo un error al confirmar la entrega.");
        }
    };

    const toggleHistoryAccordion = (id: string) => {
        if (expandedHistoryId === id) {
            setExpandedHistoryId(null);
        } else {
            setExpandedHistoryId(id);
        }
    };

    // Filter Logic for Dashboard
    const getFilteredData = () => {
        let startDate = new Date();
        let endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        if (filter === 'hoy') {
            startDate.setHours(0, 0, 0, 0);
        } else if (filter === 'semana') {
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
        } else if (filter === 'mes') {
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
        } else if (filter === 'custom' && customStart && customEnd) {
            startDate = new Date(customStart + 'T00:00:00');
            endDate = new Date(customEnd + 'T23:59:59');
        } else if (filter === 'custom') {
            startDate.setFullYear(2020);
        }

        const filteredOrders = orders.filter(o => {
            if (!o.date) return false;
            const orderDate = o.date.toDate ? o.date.toDate() : new Date(o.date);
            return orderDate >= startDate && orderDate <= endDate;
        });

        const filteredExtras = extras.filter(e => {
            const extraDate = new Date(e.date + 'T12:00:00');
            return extraDate >= startDate && extraDate <= endDate;
        });

        return { filteredOrders, filteredExtras };
    };

    const { filteredOrders, filteredExtras } = getFilteredData();

    const deliveredOrders = filteredOrders.filter(o => o.status === 'entregado');
    const earningsFromOrders = deliveredOrders.reduce((acc, o) => {
        let orderShipping = Number(o.shippingCost) || 0;

        // Si no hay shippingCost a nivel superior (ej. pedidos de POS), buscar en los items
        if (orderShipping === 0 && o.items) {
            const envioItem = o.items.find(item =>
                String(item.nombre || item.name || "").toLowerCase().includes('envío') ||
                String(item.nombre || item.name || "").toLowerCase().includes('envio')
            );
            if (envioItem) {
                orderShipping = Number(envioItem.precio || envioItem.price || 0) * (Number(envioItem.cantidad || envioItem.quantity || 1));
            }
        }

        return acc + orderShipping;
    }, 0);
    const earningsFromExtras = filteredExtras.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const totalEarnings = earningsFromOrders + earningsFromExtras;

    const activeOrders = orders.filter(o => o.status !== 'entregado' && o.status !== 'cancelado');
    const historyOrders = orders.filter(o => o.status === 'entregado' || o.status === 'cancelado');

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pendiente': return '#f59e0b';
            case 'preparando': return '#3b82f6';
            case 'enviado': return '#8b5cf6';
            case 'entregado': return '#10b981';
            case 'cancelado': return '#ef4444';
            default: return '#6b7280';
        }
    };

    return (
        <div className="rider-dashboard">
            <div className="rider-tabs">
                <button
                    className={`rider-tab ${activeTab === 'pedidos' ? 'active' : ''}`}
                    onClick={() => setActiveTab('pedidos')}
                >
                    <FaMotorcycle /> Pedidos ({activeOrders.length})
                </button>
                <button
                    className={`rider-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    <FaChartLine /> Dashboard
                </button>
            </div>

            <div className="rider-content">
                {activeTab === 'pedidos' && (
                    <div className="rider-pedidos-section">
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <button
                                onClick={() => setPedidosTab('lista')}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: pedidosTab === 'lista' ? '#3b82f6' : '#fff', color: pedidosTab === 'lista' ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                Lista de Pedidos
                            </button>
                            <button
                                onClick={() => setPedidosTab('mapa')}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: pedidosTab === 'mapa' ? '#3b82f6' : '#fff', color: pedidosTab === 'mapa' ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <FaMapMarkerAlt /> Mapa Global
                            </button>
                        </div>
                        
                        {pedidosTab === 'mapa' ? (
                            <GlobalDeliveriesMapModal inline={true} orders={orders} />
                        ) : (
                            <>
                                <h3>Pedidos Activos</h3>
                        {activeOrders.length === 0 ? (
                            <div className="rider-empty">No tienes pedidos activos.</div>
                        ) : (
                            <div className="rider-cards-list">
                                {activeOrders.map(order => (
                                    <div key={order.id} className="rider-order-card animate-slide-in" style={{ borderLeft: `6px solid ${getStatusColor(order.status)}` }}>
                                        <div className="rider-card-header">
                                            <span className="rider-card-id">#{order.id.slice(-5)}</span>
                                            <span className="rider-card-time"><FaClock /> {formatTime(order.date)}</span>
                                            <span className="rider-card-status" style={{ backgroundColor: getStatusColor(order.status) }}>
                                                {order.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="rider-card-body">
                                            <div className="rider-info-row"><FaUser /> <strong>{order.cliente.nombre}</strong></div>
                                            <div className="rider-info-row">
                                                <FaMapMarkerAlt />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                    <div key={`dir-${order.cliente.direccion}`} className="animate-highlight" style={{ display: 'inline-block' }}>
                                                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.cliente.direccion + ", Senillosa, Neuquen, Argentina")}`} target="_blank" rel="noreferrer" className="rider-link">
                                                            {order.cliente.direccion}
                                                        </a>
                                                    </div>
                                                    {order.cliente.location && (
                                                        <div key={`loc-${order.cliente.location.lat}-${order.cliente.location.lng}`} className="animate-pop-in">
                                                            <a
                                                                href={`https://www.google.com/maps/search/?api=1&query=${order.cliente.location.lat},${order.cliente.location.lng}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{
                                                                    background: '#dcfce7',
                                                                    border: '1px solid #86efac',
                                                                    color: '#166534',
                                                                    padding: '6px 10px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.9rem',
                                                                    fontWeight: 'bold',
                                                                    textDecoration: 'none',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    marginTop: '4px',
                                                                    width: 'fit-content'
                                                                }}
                                                            >
                                                                🗺️ Abrir Ubicación GPS
                                                            </a>
                                                        </div>
                                                    )}
                                                    {order.cliente.mapsLink && (
                                                        <div key={`mapslink-${order.id}`} className="animate-pop-in">
                                                            <a
                                                                href={order.cliente.mapsLink.startsWith('http') ? order.cliente.mapsLink : `https://${order.cliente.mapsLink}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{
                                                                    background: '#e0f2fe',
                                                                    border: '1px solid #7dd3fc',
                                                                    color: '#0369a1',
                                                                    padding: '6px 10px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.9rem',
                                                                    fontWeight: 'bold',
                                                                    textDecoration: 'none',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    marginTop: '4px',
                                                                    width: 'fit-content'
                                                                }}
                                                            >
                                                                🔗 Abrir Link de Maps
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rider-info-row">
                                                <FaPhone />
                                                <div key={`tel-${order.cliente.telefono}`} className="animate-highlight" style={{ display: 'inline-block' }}>
                                                    <a href={`https://wa.me/+549${order.cliente.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="rider-link">{order.cliente.telefono}</a>
                                                </div>
                                            </div>

                                            {quickReplies.length > 0 && (
                                                <div className="rider-quick-replies">
                                                    {quickReplies.map((reply, i) => (
                                                        <button key={i} className="rider-quick-reply-btn" onClick={() => handleCopy(reply)} title="Copiar al portapapeles">
                                                            <FaCopy /> {reply.length > 20 ? reply.substring(0, 20) + '...' : reply}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {order.cliente.indicaciones && <div className="rider-info-note">"{order.cliente.indicaciones}"</div>}
                                            <div className="rider-payment-row">
                                                <span>A Cobrar: <strong style={{ color: '#10b981', fontSize: '1.2rem' }}>${order.total}</strong></span>
                                                <div className="order-details-group">
                                                    <p className="order-payment-method">
                                                        <span> Método de Pago:</span>
                                                        <span className={`payment-badge payment-${order.cliente.metodoPago.toLowerCase().replace(/\s/g, '-')}`}>
                                                            {order.cliente.metodoPago}
                                                        </span>
                                                    </p>
                                                    {order.cliente.metodoPago.toLowerCase().includes('transferencia') && (
                                                        <p className="order-payment-method" style={{ marginTop: '5px' }}>
                                                            <span>Estado del Pago:</span>
                                                            <span style={{
                                                                marginLeft: '10px',
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                fontWeight: 'bold',
                                                                fontSize: '0.9rem',
                                                                color: order.transferenciaEstado === 'pagado' ? '#166534' : '#991b1b',
                                                                backgroundColor: order.transferenciaEstado === 'pagado' ? '#dcfce7' : '#fee2e2',
                                                                border: `1px solid ${order.transferenciaEstado === 'pagado' ? '#86efac' : '#fca5a5'}`,
                                                                display: 'inline-block',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {order.transferenciaEstado === 'pagado' ? 'Pagado' : 'No Pagado'}
                                                            </span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Products Accordion */}
                                            {(() => {
                                                const productItems = order.items.filter(item => !item.name.toLowerCase().includes('envío'));
                                                if (productItems.length === 0) return null;
                                                return (
                                                    <div className="rider-products-accordion">
                                                        <div
                                                            className="rider-products-accordion-header"
                                                            onClick={() => toggleActiveOrderAccordion(order.id)}
                                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderTop: '1px solid #e5e7eb', marginTop: '10px', fontWeight: 'bold', color: '#4b5563' }}
                                                        >
                                                            <span>Productos ({productItems.length})</span>
                                                            {expandedActiveOrderId === order.id ? <FaChevronUp /> : <FaChevronDown />}
                                                        </div>
                                                        {expandedActiveOrderId === order.id && (
                                                            <div className="rider-products-list" style={{ padding: '5px 0 10px 0', fontSize: '0.9rem', color: '#374151', borderTop: '1px dashed #e5e7eb' }}>
                                                                {productItems.map((item, idx) => (
                                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                                        <span style={{ fontWeight: '500' }}>{item.quantity}x {item.name}</span>
                                                                        {item.variants && item.variants.map((v: any, vi: number) => (
                                                                            <span key={vi} style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginLeft: '15px' }}>- {v.name}</span>
                                                                        ))}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            <button className="rider-btn-entregado" onClick={() => setConfirmOrder(order)}>
                                                MARCAR COMO ENTREGADO
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <h3 style={{ marginTop: '30px' }}>Historial Reciente</h3>
                        {historyOrders.slice(0, visibleHistoryCount).map(order => (
                            <div key={order.id} className="rider-history-card-wrapper">
                                <div className="rider-history-card" onClick={() => toggleHistoryAccordion(order.id)}>
                                    <span>#{order.id.slice(-5)} - {order.cliente.nombre}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: getStatusColor(order.status), fontWeight: 'bold' }}>{order.status}</span>
                                        {expandedHistoryId === order.id ? <FaChevronUp /> : <FaChevronDown />}
                                    </div>
                                </div>
                                {expandedHistoryId === order.id && (
                                    <div className="rider-history-accordion-content">
                                        <p><strong>Dirección:</strong> {order.cliente.direccion}</p>
                                        <p><strong>Teléfono:</strong> <a href={`https://wa.me/+549${order.cliente.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="rider-link" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>{order.cliente.telefono}</a></p>
                                        <p><strong>Método de Pago:</strong> {order.cliente.metodoPago}</p>
                                        <p><strong>A cobrar:</strong> ${order.total}</p>
                                        {order.cliente.indicaciones && <p><strong>Indicaciones:</strong> {order.cliente.indicaciones}</p>}
                                    </div>
                                )}
                            </div>
                        ))}

                        {visibleHistoryCount < historyOrders.length && (
                            <button
                                onClick={() => setVisibleHistoryCount(prev => prev + 10)}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    marginTop: '15px',
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    color: '#475569',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Cargar más
                            </button>
                        )}
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'dashboard' && (
                    <div className="rider-stats-section">
                        <div className="dashboard-filters-mobile">
                            <button className={filter === 'hoy' ? 'active' : ''} onClick={() => setFilter('hoy')}>Hoy</button>
                            <button className={filter === 'semana' ? 'active' : ''} onClick={() => setFilter('semana')}>Semana</button>
                            <button className={filter === 'mes' ? 'active' : ''} onClick={() => setFilter('mes')}>Mes</button>
                            <button className={filter === 'custom' ? 'active' : ''} onClick={() => setFilter('custom')}><FaCalendarAlt /></button>
                        </div>

                        {filter === 'custom' && (
                            <div className="custom-date-filters-mobile">
                                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                                <span>a</span>
                                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                            </div>
                        )}

                        <div className="rider-stats-grid">
                            <div className="rider-stat-card purple-stat">
                                <div className="stat-icon-wrapper">
                                    <FaCheckCircle className="stat-icon" />
                                </div>
                                <div className="stat-info">
                                    <span className="stat-label">Pedidos ({deliveredOrders.length})</span>
                                    <span className="stat-value">${earningsFromOrders.toLocaleString('es-AR')}</span>
                                </div>
                            </div>

                            <div className="rider-stat-card yellow-stat">
                                <div className="stat-icon-wrapper">
                                    <FaDollarSign className="stat-icon" />
                                </div>
                                <div className="stat-info">
                                    <span className="stat-label">Extras</span>
                                    <span className="stat-value">${earningsFromExtras.toLocaleString('es-AR')}</span>
                                </div>
                            </div>

                            <div className="rider-stat-card primary-stat" style={{ gridColumn: '1 / -1', padding: '25px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                                <div className="stat-icon-wrapper" style={{ width: '80px', height: '80px' }}>
                                    <FaMoneyBillWave className="stat-icon" style={{ fontSize: '2.5rem' }} />
                                </div>
                                <div className="stat-info" style={{ alignItems: 'flex-start' }}>
                                    <span className="stat-label" style={{ fontSize: '1.2rem', marginBottom: '5px' }}>Ganancias Totales</span>
                                    <span className="stat-value" style={{ fontSize: '2.5rem' }}>${totalEarnings.toLocaleString('es-AR')}</span>
                                </div>
                            </div>
                        </div>

                        {filteredExtras.length > 0 && (
                            <div className="rider-extras-list">
                                <h3>Detalle de Extras / Bonos</h3>
                                {filteredExtras.map(extra => (
                                    <div key={extra.id} className="rider-extra-item">
                                        <div className="extra-desc">
                                            <strong>{extra.date}</strong>
                                            <span>{extra.description || 'Bono extra'}</span>
                                        </div>
                                        <div className="extra-amount">+${extra.amount}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal de Confirmación de Entrega */}
            {confirmOrder && (
                <div className="rider-modal-overlay">
                    <div className="rider-modal-content rider-confirm-modal">
                        <h3>¿Confirmar Entrega?</h3>
                        <p>¿Estás seguro de que entregaste el pedido de <strong>{confirmOrder.cliente.nombre}</strong>?</p>
                        <div className="rider-modal-actions">
                            <button className="rider-modal-btn-cancel" onClick={() => setConfirmOrder(null)}>Cancelar</button>
                            <button className="rider-modal-btn-confirm" onClick={handleConfirmDelivery}>Confirmar Entrega</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
