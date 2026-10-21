import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, limit, serverTimestamp, Timestamp } from 'firebase/firestore';
import { FaCashRegister, FaArrowDown, FaArrowUp, FaMoneyBillWave, FaCreditCard, FaExchangeAlt, FaListUl, FaEye, FaEyeSlash, FaLock, FaHistory, FaArrowLeft, FaBoxOpen, FaTrash, FaQrcode, FaInfoCircle, FaFilter, FaExclamationCircle } from 'react-icons/fa';
import { useCart } from '../context/CartContext';
import CajaVentaTabs from './CajaVentaTabs';
import CajaStockAdjust from './CajaStockAdjust';
import './CajaManager.css';

type MovementType = 'venta' | 'ingreso' | 'egreso';
type PaymentMethod = 'Efectivo' | 'Débito' | 'Transferencia' | 'QR' | 'Online';

interface CajaMovement {
    id: string;
    type: MovementType;
    amount: number;
    paymentMethod?: PaymentMethod;
    description?: string;
    orderId?: string;
    itemCount?: number;
    date?: Timestamp | Date;
    createdByEmail?: string;
}

interface CajaSessionStats {
    enCaja: number;
    ingresos: number;
    egresos: number;
    ventas: number;
    efectivo: number;
    transferencia: number;
    debito: number;
    qr?: number;
    cantidad: number;
}

interface CajaSession {
    id: string;
    closedAt?: Timestamp | Date;
    closedByEmail?: string;
    periodStart?: Timestamp | Date | null;
    stats: CajaSessionStats;
}

const getArgentinaDate = (date: Date) => {
    return new Date(date.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
};

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
};

// Los pedidos online guardan el método en minúscula / con otros nombres ('efectivo', 'transferencia', 'mercadopago'),
// mientras que la caja usa 'Efectivo', 'Transferencia', etc. Se unifica para que cuente en el medio correcto.
// Mercado Pago cobra por QR 0,8% + 21% de IVA sobre esa comisión = 0,968% (ej: $7.500 -> $72,60)
const QR_FEE_RATE = 0.008 * 1.21;

const normalizePaymentMethod = (raw?: string | null): PaymentMethod => {
    const v = (raw || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!v) return 'Efectivo';
    if (v.includes('efectivo')) return 'Efectivo';
    if (v.includes('transfer')) return 'Transferencia';
    if (v === 'qr' || v.includes('qr')) return 'QR';
    if (v.includes('debito') || v.includes('tarjeta')) return 'Débito';
    return 'Online';
};

const toDate = (value: Timestamp | Date | null | undefined): Date | null => {
    if (!value) return null;
    return value instanceof Timestamp ? value.toDate() : value;
};

export default function CajaManager({ active = true, onPendingSalesChange }: { active?: boolean; onPendingSalesChange?: (count: number) => void }) {
    const { user, isSuperAdmin } = useCart();
    const [view, setView] = useState<'menu' | 'venta' | 'historial' | 'stock'>('menu');
    const [movements, setMovements] = useState<CajaMovement[]>([]);
    const [rawOrders, setRawOrders] = useState<any[]>([]);
    const [sessions, setSessions] = useState<CajaSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);

    const [movementModal, setMovementModal] = useState<'ingreso' | 'egreso' | null>(null);
    const [formAmount, setFormAmount] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('Efectivo');
    const [addToExpenses, setAddToExpenses] = useState(false);
    const [saving, setSaving] = useState(false);
    const [filterType, setFilterType] = useState<'all' | MovementType>('all');
    const [filterMethod, setFilterMethod] = useState<'all' | PaymentMethod>('all');
    const [filterOrigin, setFilterOrigin] = useState<'all' | 'pedido' | 'caja' | 'manual'>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [feeInfoId, setFeeInfoId] = useState<string | null>(null);
    const [showOnlineInfo, setShowOnlineInfo] = useState(false);
    const [showVentasInfo, setShowVentasInfo] = useState(false);

    const [showAmounts, setShowAmounts] = useState(() => {
        return localStorage.getItem('showSensitiveData') !== 'false';
    });

    useEffect(() => {
        localStorage.setItem('showSensitiveData', showAmounts.toString());
    }, [showAmounts]);

    useEffect(() => {
        const q = query(collection(db, 'caja_movements'), orderBy('date', 'desc'), limit(300));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as CajaMovement));
            setMovements(data);
            setLoading(false);
        }, (error) => {
            console.error('Error cargando movimientos de caja:', error);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
            setRawOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            console.error('Error cargando pedidos:', error);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'caja_sessions'), orderBy('closedAt', 'desc'), limit(100));
        const unsub = onSnapshot(q, (snap) => {
            setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as CajaSession)));
        }, (error) => {
            console.error('Error cargando historial de cajas:', error);
        });
        return () => unsub();
    }, []);

    // The current register session runs from the last close (if any) until now.
    // With no prior close yet, it falls back to "today" (Argentina time), same as before.
    const lastSession = sessions[0];

    const isInCurrentSession = (d: Date) => {
        const closedAtDate = toDate(lastSession?.closedAt);
        if (closedAtDate) {
            return d.getTime() > closedAtDate.getTime();
        }
        return isSameDay(getArgentinaDate(new Date()), getArgentinaDate(d));
    };

    const currentSessionMovements = useMemo(() => {
        // Pedidos cancelados: sus ventas ya registradas en caja no deben seguir sumando
        const ordersById = new Map<string, any>(rawOrders.map(o => [o.id, o]));
        const cancelledOrderIds = new Set(rawOrders.filter(o => o.status === 'cancelado').map(o => o.id));
        const cajaMovs = movements.filter(m => {
            if (m.type === 'venta' && m.orderId && cancelledOrderIds.has(m.orderId)) return false;
            const d = toDate(m.date);
            return d ? isInCurrentSession(d) : false;
        }).map(m => {
            // Si después se cambió el método de pago del pedido (Pedidos → editar), la caja lo sigue.
            // Los pagos mixtos ("Efectivo + Débito") se dejan como se registraron.
            if (m.type !== 'venta' || !m.orderId) return m;
            const order = ordersById.get(m.orderId);
            const current = (order?.cliente?.metodoPago || '').toString().trim();
            if (!current || current.includes('+')) return m;
            return { ...m, paymentMethod: normalizePaymentMethod(current) };
        });

        const coveredOrderIds = new Set(
            cajaMovs.filter(m => m.type === 'venta' && m.orderId).map(m => m.orderId)
        );

        const orderMovs: CajaMovement[] = rawOrders
            .filter(o => o.status !== 'cancelado' && !o.isTestOrder && !coveredOrderIds.has(o.id))
            .map(o => {
                const d = o.date && typeof o.date.toDate === 'function' ? o.date.toDate() : (o.date ? new Date(o.date) : null);
                if (!d) return null;
                return {
                    id: `order-${o.id}`,
                    type: 'venta' as MovementType,
                    amount: Number(o.total) || 0,
                    paymentMethod: normalizePaymentMethod(o.cliente?.metodoPago),
                    orderId: o.id,
                    itemCount: Array.isArray(o.items) ? o.items.length : 0,
                    date: d
                } as CajaMovement;
            })
            .filter((m): m is CajaMovement => m !== null && isInCurrentSession(m.date as Date));

        return [...cajaMovs, ...orderMovs].sort((a, b) => {
            const da = toDate(a.date)?.getTime() || 0;
            const db_ = toDate(b.date)?.getTime() || 0;
            return db_ - da;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movements, rawOrders, lastSession]);

    const stats = useMemo(() => {
        let ingresos = 0;
        let egresos = 0;
        let ventas = 0;
        let efectivo = 0;
        let transferencia = 0;
        let debito = 0;
        let qr = 0;
        let onlineGen = 0;
        let ventasEfectivo = 0;
        let ventasOnline = 0;
        let cantVentas = 0;
        let qrVentas = 0;

        currentSessionMovements.forEach(m => {
            const method = normalizePaymentMethod(m.paymentMethod);
            const sign = m.type === 'egreso' ? -1 : 1;

            if (m.type === 'ingreso') ingresos += m.amount;
            else if (m.type === 'egreso') egresos += m.amount;
            else {
                ventas += m.amount;
                cantVentas += 1;
                if (method === 'Efectivo') ventasEfectivo += m.amount; else ventasOnline += m.amount;
                if (method === 'QR') qrVentas += m.amount;
            }

            if (method === 'Efectivo') efectivo += sign * m.amount;
            else if (method === 'Transferencia') transferencia += sign * m.amount;
            else if (method === 'Débito') debito += sign * m.amount;
            else if (method === 'QR') qr += sign * m.amount;
            else if (method === 'Online') onlineGen += sign * m.amount;
        });

        return {
            enCaja: ventas + ingresos - egresos,
            ingresos,
            egresos,
            ventas,
            ventasEfectivo,
            ventasOnline,
            cantVentas,
            qrVentas,
            qrComision: qrVentas * QR_FEE_RATE,
            efectivo,
            transferencia,
            debito,
            qr,
            online: transferencia + debito + qr + onlineGen,
            onlineGen,
            cantidad: currentSessionMovements.length
        };
    }, [currentSessionMovements]);

    const filteredMovements = useMemo(() => currentSessionMovements.filter(m => {
        if (filterType !== 'all' && m.type !== filterType) return false;
        if (filterMethod !== 'all' && normalizePaymentMethod(m.paymentMethod) !== filterMethod) return false;
        // 'pedido' = pedidos online/delivery (no pasaron por la caja); 'caja' = ventas cargadas en caja; 'manual' = ingresos/egresos
        if (filterOrigin === 'pedido' && !m.id.startsWith('order-')) return false;
        if (filterOrigin === 'caja' && !(m.type === 'venta' && !m.id.startsWith('order-'))) return false;
        if (filterOrigin === 'manual' && m.type === 'venta') return false;
        return true;
    }), [currentSessionMovements, filterType, filterMethod, filterOrigin]);

    const activeFilterCount = [filterType, filterMethod, filterOrigin].filter(f => f !== 'all').length;
    const filtersActive = filterType !== 'all' || filterMethod !== 'all' || filterOrigin !== 'all';
    const filteredTotal = filteredMovements.reduce((s, m) => s + (m.type === 'egreso' ? -m.amount : m.amount), 0);

    const fmt = (n: number) => showAmounts ? `$${Math.round(n).toLocaleString('es-AR')}` : '***';

    const handleSaleComplete = async (data: { amount: number; payments: { method: string; amount: number }[]; orderId: string; itemCount: number }) => {
        try {
            await Promise.all(data.payments.map(p => addDoc(collection(db, 'caja_movements'), {
                type: 'venta',
                amount: p.amount,
                paymentMethod: p.method,
                orderId: data.orderId,
                itemCount: data.itemCount,
                date: serverTimestamp(),
                createdByEmail: user?.email || 'admin'
            })));
        } catch (error) {
            console.error('Error registrando venta en caja:', error);
        }
    };

    const openMovementModal = (type: 'ingreso' | 'egreso') => {
        setFormAmount('');
        setFormDescription(type === 'ingreso' ? 'Inicio de caja' : '');
        setFormPaymentMethod('Efectivo');
        setAddToExpenses(false);
        setMovementModal(type);
    };

    const handleSaveMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!movementModal || !formAmount || Number(formAmount) <= 0) return;

        setSaving(true);
        try {
            await addDoc(collection(db, 'caja_movements'), {
                type: movementModal,
                amount: Number(formAmount),
                paymentMethod: formPaymentMethod,
                description: formDescription.trim(),
                date: serverTimestamp(),
                createdByEmail: user?.email || 'admin'
            });

            if (movementModal === 'egreso' && addToExpenses) {
                const itemName = formDescription.trim() || 'Egreso';
                await addDoc(collection(db, 'expenses'), {
                    description: 'Egreso desde Caja',
                    totalAmount: Number(formAmount),
                    date: Timestamp.now(),
                    type: 'otro',
                    items: [{
                        name: itemName,
                        quantity: 1,
                        unit: 'un',
                        multiplier: 1,
                        price: Number(formAmount),
                        subtotal: Number(formAmount)
                    }],
                    createdByEmail: user?.email || 'admin'
                });
            }

            setMovementModal(null);
        } catch (error) {
            console.error('Error registrando movimiento de caja:', error);
            alert('Error al registrar el movimiento.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteMovement = async (movement: CajaMovement) => {
        if (!isSuperAdmin) return;
        if (!window.confirm(`¿Eliminar este movimiento de caja${movement.description ? ` ("${movement.description}")` : ''} por ${fmt(movement.amount)}? Esta acción no se puede deshacer.`)) return;

        try {
            await deleteDoc(doc(db, 'caja_movements', movement.id));
        } catch (error) {
            console.error('Error eliminando movimiento de caja:', error);
            alert('Error al eliminar el movimiento.');
        }
    };

    const formatTime = (timestamp?: Timestamp | Date) => {
        if (!timestamp) return '';
        const d = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateTime = (timestamp?: Timestamp | Date | null) => {
        const d = toDate(timestamp);
        if (!d) return '—';
        return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const handleCloseCaja = async () => {
        if (stats.cantidad === 0) {
            alert('No hay movimientos para cerrar en esta caja.');
            return;
        }
        if (!window.confirm(`¿Cerrar la caja actual?\n\nEn caja: ${fmt(stats.enCaja)}\nMovimientos: ${stats.cantidad}\n\nLos contadores volverán a cero y se guardará este resumen en el historial.`)) {
            return;
        }

        setClosing(true);
        try {
            await addDoc(collection(db, 'caja_sessions'), {
                closedAt: serverTimestamp(),
                closedByEmail: user?.email || 'admin',
                periodStart: lastSession?.closedAt || null,
                stats: {
                    enCaja: stats.enCaja,
                    ingresos: stats.ingresos,
                    egresos: stats.egresos,
                    ventas: stats.ventas,
                    efectivo: stats.efectivo,
                    transferencia: stats.transferencia + stats.onlineGen,
                    debito: stats.debito,
                    qr: stats.qr,
                    cantidad: stats.cantidad
                }
            });
        } catch (error) {
            console.error('Error cerrando caja:', error);
            alert('Error al cerrar la caja.');
        } finally {
            setClosing(false);
        }
    };

    if (view === 'historial') {
        return (
            <div className="caja-container">
                <div className="caja-header">
                    <button className="caja-back-btn" onClick={() => setView('menu')}>
                        <FaArrowLeft /> Volver
                    </button>
                    <h2><FaHistory /> Historial de Cajas</h2>
                </div>

                <div className="caja-history-list">
                    {sessions.length === 0 ? (
                        <p className="caja-empty">Todavía no se cerró ninguna caja.</p>
                    ) : (
                        sessions.map(s => (
                            <div key={s.id} className="caja-history-row">
                                <div className="caja-history-top">
                                    <span className="caja-history-date">{formatDateTime(s.closedAt)}</span>
                                    <span className="caja-history-enCaja">{fmt(s.stats?.enCaja || 0)}</span>
                                </div>
                                <div className="caja-history-stats">
                                    <span>Ventas: {fmt(s.stats?.ventas || 0)}</span>
                                    <span>Ingresos: {fmt(s.stats?.ingresos || 0)}</span>
                                    <span>Egresos: {fmt(s.stats?.egresos || 0)}</span>
                                    <span>Efectivo: {fmt(s.stats?.efectivo || 0)}</span>
                                    <span title={`Transf. ${fmt(s.stats?.transferencia || 0)} · Débito ${fmt(s.stats?.debito || 0)} · QR ${fmt(s.stats?.qr || 0)}`}>Online: {fmt((s.stats?.transferencia || 0) + (s.stats?.debito || 0) + (s.stats?.qr || 0))}</span>
                                    <span>{s.stats?.cantidad || 0} mov.</span>
                                </div>
                                {s.closedByEmail && <div className="caja-history-closedby">Cerrado por {s.closedByEmail}</div>}
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    if (view === 'venta') {
        return (
            <CajaVentaTabs
                onPendingSalesChange={onPendingSalesChange}
                active={active}
                onBack={() => setView('menu')}
                onSaleComplete={handleSaleComplete}
            />
        );
    }

    if (view === 'stock') {
        return <CajaStockAdjust active={active} onBack={() => setView('menu')} />;
    }

    return (
        <div className="caja-container">
            <div className="caja-header">
                <h2><FaCashRegister /> Caja</h2>
                <span className="caja-subtitle">Caja actual{lastSession ? ` (desde ${formatDateTime(lastSession.closedAt)})` : ' (hoy)'}</span>
                <div className="caja-header-actions">
                    <button
                        className="caja-secondary-btn"
                        onClick={() => setView('historial')}
                        title="Historial de Cajas"
                    >
                        <FaHistory /> Historial
                    </button>
                    <button
                        className="caja-secondary-btn caja-close-btn"
                        onClick={handleCloseCaja}
                        disabled={closing}
                        title="Cerrar Caja"
                    >
                        <FaLock /> {closing ? 'Cerrando...' : 'Cerrar Caja'}
                    </button>
                    <button
                        className="caja-toggle-amounts-btn"
                        onClick={() => setShowAmounts(!showAmounts)}
                        title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                    >
                        {showAmounts ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                    </button>
                </div>
            </div>

            <div className="caja-stats-bar">
                <div className="caja-stat caja-stat-main">
                    <span className="caja-stat-label">En caja</span>
                    <span className="caja-stat-value">{fmt(stats.enCaja)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label">
                        Ventas
                        <span
                            className="caja-info-trigger"
                            onMouseEnter={() => setShowVentasInfo(true)}
                            onMouseLeave={() => setShowVentasInfo(false)}
                            onClick={(e) => { e.stopPropagation(); setShowVentasInfo(v => !v); }}
                        >
                            <FaInfoCircle color="#10b981" size={15} title="Ver desglose de ventas" />
                            {showVentasInfo && (
                                <div className="caja-info-bubble" onClick={(e) => e.stopPropagation()}>
                                    <div className="caja-bubble-pointer" />
                                    <h4>Solo ventas (sin ingresos ni egresos)</h4>
                                    <div className="caja-bubble-row"><span><FaMoneyBillWave /> Efectivo</span><strong>{fmt(stats.ventasEfectivo)}</strong></div>
                                    <div className="caja-bubble-row"><span><FaExchangeAlt /> Online</span><strong>{fmt(stats.ventasOnline)}</strong></div>
                                    <div className="caja-bubble-row"><span><FaListUl /> Cantidad de ventas</span><strong>{stats.cantVentas}</strong></div>
                                </div>
                            )}
                        </span>
                    </span>
                    <span className="caja-stat-value" style={{ color: '#059669' }}>{fmt(stats.ventas)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label">Ingresos</span>
                    <span className="caja-stat-value" style={{ color: '#10b981' }}>{fmt(stats.ingresos)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label">Egresos</span>
                    <span className="caja-stat-value" style={{ color: '#ef4444' }}>{fmt(stats.egresos)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label">
                        <FaExchangeAlt /> Online
                        <span
                            className="caja-info-trigger"
                            onMouseEnter={() => setShowOnlineInfo(true)}
                            onMouseLeave={() => setShowOnlineInfo(false)}
                            onClick={(e) => { e.stopPropagation(); setShowOnlineInfo(v => !v); }}
                        >
                            <FaInfoCircle color="#3b82f6" size={15} title="Ver desglose de pagos online" />
                            {showOnlineInfo && (
                                <div className="caja-info-bubble" onClick={(e) => e.stopPropagation()}>
                                    <div className="caja-bubble-pointer" />
                                    <h4>Pagos online</h4>
                                    <div className="caja-bubble-row"><span><FaExchangeAlt /> Transferencia</span><strong>{fmt(stats.transferencia)}</strong></div>
                                    <div className="caja-bubble-row"><span><FaCreditCard /> Débito</span><strong>{fmt(stats.debito)}</strong></div>
                                    <div className="caja-bubble-row"><span><FaQrcode /> QR</span><strong>{fmt(stats.qr)}</strong></div>
                                    {stats.qrComision > 0 && (
                                        <div className="caja-bubble-row" style={{ background: '#fef2f2' }}>
                                            <span style={{ color: '#b91c1c' }}><FaExclamationCircle /> Comisión QR ({(QR_FEE_RATE * 100).toFixed(3).replace('.', ',')}%)</span>
                                            <strong style={{ color: '#b91c1c' }}>-{showAmounts ? `$${stats.qrComision.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '***'}</strong>
                                        </div>
                                    )}
                                    {stats.onlineGen !== 0 && <div className="caja-bubble-row"><span><FaExchangeAlt /> Otros (sin detallar)</span><strong>{fmt(stats.onlineGen)}</strong></div>}
                                </div>
                            )}
                        </span>
                    </span>
                    <span className="caja-stat-value">{fmt(stats.online)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label"><FaMoneyBillWave /> Efectivo</span>
                    <span className="caja-stat-value">{fmt(stats.efectivo)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label"><FaListUl /> Movimientos</span>
                    <span className="caja-stat-value">{stats.cantidad}</span>
                </div>
            </div>

            <div className="caja-actions">
                <button className="caja-big-btn caja-big-btn-venta" onClick={() => setView('venta')}>
                    <FaCashRegister /> Registrar venta
                </button>
                <button className="caja-big-btn" onClick={() => openMovementModal('ingreso')}>
                    <FaArrowDown /> Registrar ingreso
                </button>
                <button className="caja-big-btn caja-big-btn-egreso" onClick={() => openMovementModal('egreso')}>
                    <FaArrowUp /> Registrar egreso
                </button>
                <button className="caja-big-btn caja-big-btn-stock" onClick={() => setView('stock')}>
                    <FaBoxOpen /> Ajustar Stock
                </button>
            </div>

            <div className="caja-movements-list">
                <div className="caja-list-header">
                    <h3>Movimientos de la caja actual</h3>
                    <div className="caja-filter-wrap">
                        <button
                            className={`caja-filter-btn ${filtersActive ? 'active' : ''}`}
                            onClick={() => setShowFilters(v => !v)}
                            title="Filtros"
                        >
                            <FaFilter />
                            {activeFilterCount > 0 && <span className="caja-filter-badge">{activeFilterCount}</span>}
                        </button>
                        {showFilters && (
                            <>
                                <div className="caja-filter-backdrop" onClick={() => setShowFilters(false)} />
                                <div className="caja-filter-panel">
                                    <div className="caja-filter-group">
                                        <span className="caja-filter-label">Origen</span>
                                        <div className="caja-filter-chips">
                                            {([['all', 'Todos'], ['pedido', 'Pedidos'], ['caja', 'Ventas en caja'], ['manual', 'Manuales']] as const).map(([v, l]) => (
                                                <button key={v} className={`caja-filter-chip ${filterOrigin === v ? 'active' : ''}`} onClick={() => setFilterOrigin(v)}>{l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="caja-filter-group">
                                        <span className="caja-filter-label">Método de pago</span>
                                        <div className="caja-filter-chips">
                                            {([['all', 'Todos'], ['Efectivo', 'Efectivo'], ['Transferencia', 'Transferencia'], ['Débito', 'Débito'], ['QR', 'QR'], ['Online', 'Otros online']] as const).map(([v, l]) => (
                                                <button key={v} className={`caja-filter-chip ${filterMethod === v ? 'active' : ''}`} onClick={() => setFilterMethod(v)}>{l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="caja-filter-group">
                                        <span className="caja-filter-label">Tipo</span>
                                        <div className="caja-filter-chips">
                                            {([['all', 'Todos'], ['venta', 'Ventas'], ['ingreso', 'Ingresos'], ['egreso', 'Egresos']] as const).map(([v, l]) => (
                                                <button key={v} className={`caja-filter-chip ${filterType === v ? 'active' : ''}`} onClick={() => setFilterType(v)}>{l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="caja-filter-footer">
                                        <span>{filteredMovements.length} mov. · Total {fmt(filteredTotal)}</span>
                                        <button
                                            className="caja-filter-clear"
                                            disabled={!filtersActive}
                                            onClick={() => { setFilterType('all'); setFilterMethod('all'); setFilterOrigin('all'); }}
                                        >
                                            Limpiar
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                {loading ? (
                    <p className="caja-empty">Cargando...</p>
                ) : currentSessionMovements.length === 0 ? (
                    <p className="caja-empty">Todavía no hay movimientos registrados en esta caja.</p>
                ) : filteredMovements.length === 0 ? (
                    <p className="caja-empty">Ningún movimiento coincide con los filtros.</p>
                ) : (
                    filteredMovements.map(m => {
                        const isRealMovement = !m.id.startsWith('order-');
                        return (
                            <div key={m.id} className={`caja-movement-row caja-movement-${m.type}`}>
                                <span className="caja-movement-type">
                                    {m.type === 'venta' ? 'Venta' : m.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                                </span>
                                <span className="caja-movement-desc">{m.description || (m.orderId ? `Pedido #${m.orderId}` : '—')}</span>
                                <span className="caja-movement-qty">
                                    {m.type === 'venta' && m.itemCount ? `${m.itemCount} ${m.itemCount === 1 ? 'producto' : 'productos'}` : ''}
                                </span>
                                <span className="caja-movement-method">
                                    {m.paymentMethod || ''}
                                    {m.type === 'venta' && normalizePaymentMethod(m.paymentMethod) === 'QR' && (
                                        <span
                                            className="caja-info-trigger"
                                            onMouseEnter={() => setFeeInfoId(m.id)}
                                            onMouseLeave={() => setFeeInfoId(null)}
                                            onClick={(e) => { e.stopPropagation(); setFeeInfoId(feeInfoId === m.id ? null : m.id); }}
                                        >
                                            <FaExclamationCircle color="#ef4444" size={14} title="Comisión de esta venta" />
                                            {feeInfoId === m.id && (
                                                <div className="caja-info-bubble" onClick={(e) => e.stopPropagation()}>
                                                    <div className="caja-bubble-pointer" />
                                                    <h4>Comisión QR (Mercado Pago)</h4>
                                                    <div className="caja-bubble-row" style={{ background: '#fef2f2' }}>
                                                        <span style={{ color: '#b91c1c' }}>Descontado ({(QR_FEE_RATE * 100).toFixed(3).replace('.', ',')}%)</span>
                                                        <strong style={{ color: '#b91c1c' }}>-{showAmounts ? `$${(m.amount * QR_FEE_RATE).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '***'}</strong>
                                                    </div>
                                                    <div className="caja-bubble-row">
                                                        <span>Neto a recibir</span>
                                                        <strong>{showAmounts ? `$${(m.amount * (1 - QR_FEE_RATE)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '***'}</strong>
                                                    </div>
                                                </div>
                                            )}
                                        </span>
                                    )}
                                </span>
                                <span className="caja-movement-time">{formatTime(m.date)}</span>
                                <span className={`caja-movement-amount ${m.type === 'egreso' ? 'negative' : 'positive'}`}>
                                    {showAmounts ? `${m.type === 'egreso' ? '-' : '+'}${fmt(m.amount)}` : '***'}
                                </span>
                                {isSuperAdmin && isRealMovement && (
                                    <button
                                        className="caja-movement-delete-btn"
                                        onClick={() => handleDeleteMovement(m)}
                                        title="Eliminar movimiento"
                                    >
                                        <FaTrash />
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {movementModal && (
                <div className="caja-modal-overlay" onClick={() => setMovementModal(null)}>
                    <div className="caja-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>{movementModal === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Egreso'}</h3>
                        <form onSubmit={handleSaveMovement}>
                            <div className="caja-form-group">
                                <label>Monto ($)</label>
                                <input type="number" required min="1" autoFocus value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="Ej: 5000" />
                            </div>
                            <div className="caja-form-group">
                                <label>Medio</label>
                                <div className="caja-method-options">
                                    {(['Efectivo', 'Online'] as PaymentMethod[]).map(pm => (
                                        <button
                                            type="button"
                                            key={pm}
                                            className={`caja-method-chip ${formPaymentMethod === pm ? 'active' : ''}`}
                                            onClick={() => setFormPaymentMethod(pm)}
                                        >
                                            {pm}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="caja-form-group">
                                <label>Descripción (Opcional)</label>
                                <input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Ej: Cambio de caja, retiro de efectivo..." />
                            </div>
                            {movementModal === 'egreso' && (
                                <div className="caja-form-group caja-form-checkbox">
                                    <label>
                                        <input type="checkbox" checked={addToExpenses} onChange={e => setAddToExpenses(e.target.checked)} />
                                        Añadir a gastos
                                    </label>
                                </div>
                            )}
                            <div className="caja-modal-actions">
                                <button type="button" className="caja-btn-cancel" onClick={() => setMovementModal(null)}>Cancelar</button>
                                <button type="submit" className="caja-btn-save" disabled={saving || !formAmount}>
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
