import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, Timestamp } from 'firebase/firestore';
import { FaCashRegister, FaArrowDown, FaArrowUp, FaMoneyBillWave, FaCreditCard, FaExchangeAlt, FaListUl, FaEye, FaEyeSlash } from 'react-icons/fa';
import { useCart } from '../context/CartContext';
import CajaVenta from './CajaVenta';
import './CajaManager.css';

type MovementType = 'venta' | 'ingreso' | 'egreso';
type PaymentMethod = 'Efectivo' | 'Débito' | 'Transferencia';

interface CajaMovement {
    id: string;
    type: MovementType;
    amount: number;
    paymentMethod?: PaymentMethod;
    description?: string;
    orderId?: string;
    date?: Timestamp | Date;
    createdByEmail?: string;
}

const getArgentinaDate = (date: Date) => {
    return new Date(date.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
};

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
};

export default function CajaManager() {
    const { user } = useCart();
    const [view, setView] = useState<'menu' | 'venta'>('menu');
    const [movements, setMovements] = useState<CajaMovement[]>([]);
    const [loading, setLoading] = useState(true);

    const [movementModal, setMovementModal] = useState<'ingreso' | 'egreso' | null>(null);
    const [formAmount, setFormAmount] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('Efectivo');
    const [addToExpenses, setAddToExpenses] = useState(false);
    const [saving, setSaving] = useState(false);

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

    const todaysMovements = useMemo(() => {
        const now = getArgentinaDate(new Date());
        return movements.filter(m => {
            if (!m.date) return false;
            const d = m.date instanceof Timestamp ? m.date.toDate() : m.date;
            return isSameDay(now, getArgentinaDate(d));
        });
    }, [movements]);

    const stats = useMemo(() => {
        let ingresos = 0;
        let egresos = 0;
        let ventas = 0;
        let efectivo = 0;
        let transferencia = 0;
        let debito = 0;

        todaysMovements.forEach(m => {
            const method = m.paymentMethod || 'Efectivo';
            const sign = m.type === 'egreso' ? -1 : 1;

            if (m.type === 'ingreso') ingresos += m.amount;
            else if (m.type === 'egreso') egresos += m.amount;
            else ventas += m.amount;

            if (method === 'Efectivo') efectivo += sign * m.amount;
            else if (method === 'Transferencia') transferencia += sign * m.amount;
            else if (method === 'Débito') debito += sign * m.amount;
        });

        return {
            enCaja: ventas + ingresos - egresos,
            ingresos,
            egresos,
            efectivo,
            transferencia,
            debito,
            cantidad: todaysMovements.length
        };
    }, [todaysMovements]);

    const fmt = (n: number) => showAmounts ? `$${Math.round(n).toLocaleString('es-AR')}` : '***';

    const handleSaleComplete = async (data: { amount: number; payments: { method: string; amount: number }[]; orderId: string }) => {
        try {
            await Promise.all(data.payments.map(p => addDoc(collection(db, 'caja_movements'), {
                type: 'venta',
                amount: p.amount,
                paymentMethod: p.method,
                orderId: data.orderId,
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

    const formatTime = (timestamp?: Timestamp | Date) => {
        if (!timestamp) return '';
        const d = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    };

    if (view === 'venta') {
        return (
            <CajaVenta
                onBack={() => setView('menu')}
                onSaleComplete={handleSaleComplete}
            />
        );
    }

    return (
        <div className="caja-container">
            <div className="caja-header">
                <h2><FaCashRegister /> Caja</h2>
                <span className="caja-subtitle">Resumen del día</span>
                <button
                    className="caja-toggle-amounts-btn"
                    onClick={() => setShowAmounts(!showAmounts)}
                    title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                >
                    {showAmounts ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
            </div>

            <div className="caja-stats-bar">
                <div className="caja-stat caja-stat-main">
                    <span className="caja-stat-label">En caja</span>
                    <span className="caja-stat-value">{fmt(stats.enCaja)}</span>
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
                    <span className="caja-stat-label"><FaExchangeAlt /> Transf.</span>
                    <span className="caja-stat-value">{fmt(stats.transferencia)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label"><FaMoneyBillWave /> Efectivo</span>
                    <span className="caja-stat-value">{fmt(stats.efectivo)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label"><FaCreditCard /> Débito</span>
                    <span className="caja-stat-value">{fmt(stats.debito)}</span>
                </div>
                <div className="caja-stat">
                    <span className="caja-stat-label"><FaListUl /> Movimientos</span>
                    <span className="caja-stat-value">{stats.cantidad}</span>
                </div>
            </div>

            <div className="caja-actions">
                <button className="caja-big-btn" onClick={() => setView('venta')}>
                    <FaCashRegister /> Registrar venta
                </button>
                <button className="caja-big-btn" onClick={() => openMovementModal('ingreso')}>
                    <FaArrowDown /> Registrar ingreso
                </button>
                <button className="caja-big-btn" onClick={() => openMovementModal('egreso')}>
                    <FaArrowUp /> Registrar egreso
                </button>
            </div>

            <div className="caja-movements-list">
                <h3>Movimientos de hoy</h3>
                {loading ? (
                    <p className="caja-empty">Cargando...</p>
                ) : todaysMovements.length === 0 ? (
                    <p className="caja-empty">Todavía no hay movimientos registrados hoy.</p>
                ) : (
                    todaysMovements.map(m => (
                        <div key={m.id} className={`caja-movement-row caja-movement-${m.type}`}>
                            <span className="caja-movement-type">
                                {m.type === 'venta' ? 'Venta' : m.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                            </span>
                            <span className="caja-movement-desc">{m.description || (m.orderId ? `Pedido #${m.orderId}` : '—')}</span>
                            <span className="caja-movement-method">{m.paymentMethod || ''}</span>
                            <span className="caja-movement-time">{formatTime(m.date)}</span>
                            <span className={`caja-movement-amount ${m.type === 'egreso' ? 'negative' : 'positive'}`}>
                                {showAmounts ? `${m.type === 'egreso' ? '-' : '+'}${fmt(m.amount)}` : '***'}
                            </span>
                        </div>
                    ))
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
                                    {(['Efectivo', 'Débito', 'Transferencia'] as PaymentMethod[]).map(pm => (
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
