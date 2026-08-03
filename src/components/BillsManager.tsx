import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/firebaseConfig';
import { collection, doc, deleteDoc, onSnapshot, orderBy, query, where, limit, Timestamp } from 'firebase/firestore';
import { FaSync, FaTrash, FaChevronDown, FaFileInvoiceDollar, FaReceipt } from 'react-icons/fa';
import { useCart } from '../context/CartContext';
import VoiceAIPurchases from './VoiceAIPurchases';
import { RawMaterial } from './CostManager';
import './CostManager.css';
import './BillsManager.css';

export default function BillsManager() {
    const { "*": tab } = useParams();
    const navigate = useNavigate();
    const { isSuperAdmin: contextIsSuperAdmin } = useCart();
    const isSuperAdmin = contextIsSuperAdmin || auth.currentUser?.email === 'sairebautista@gmail.com';

    const cleanTab = tab ? tab.replace(/^\//, '') : 'gastos';
    const validTabs = ['gastos', 'tickets'];
    const activeTab = validTabs.includes(cleanTab) ? cleanTab : 'gastos';

    // Raw Materials (necesarios para el generador de tickets)
    const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);

    useEffect(() => {
        const qMat = query(collection(db, "raw_materials"), orderBy("name"));
        const unsubMat = onSnapshot(qMat, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial));
            setRawMaterials(data);
        });
        return () => unsubMat();
    }, []);

    // Gastos (Expenses) State
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loadingExpenses, setLoadingExpenses] = useState(false);
    const [expenseFilter, setExpenseFilter] = useState<'hoy' | 'semana' | 'mes' | 'custom'>('mes');
    const [expenseCustomStart, setExpenseCustomStart] = useState<string>('');
    const [expenseCustomEnd, setExpenseCustomEnd] = useState<string>('');
    const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

    const handleDeleteExpense = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isSuperAdmin) return;
        if (window.confirm('¿Estás seguro de que deseas eliminar este registro de gasto? Esta acción solo borrará este registro del historial. NO se descontará ninguna materia prima creada o actualizada. ¿Deseas proceder?')) {
            try {
                await deleteDoc(doc(db, "expenses", id));
                setExpenses(prev => prev.filter(exp => exp.id !== id));
            } catch (error) {
                console.error("Error al eliminar gasto:", error);
                alert("Error al eliminar el registro.");
            }
        }
    };

    useEffect(() => {
        if (activeTab !== 'gastos') return;
        setLoadingExpenses(true);

        let startDate = new Date();
        let endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        if (expenseFilter === 'hoy') {
            startDate.setHours(0, 0, 0, 0);
        } else if (expenseFilter === 'semana') {
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
        } else if (expenseFilter === 'mes') {
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
        } else if (expenseFilter === 'custom') {
            if (expenseCustomStart && expenseCustomEnd) {
                startDate = new Date(expenseCustomStart + 'T00:00:00');
                endDate = new Date(expenseCustomEnd + 'T23:59:59');
            } else {
                startDate.setFullYear(2020);
            }
        }

        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        const q = query(
            collection(db, "expenses"),
            where("date", ">=", startTimestamp),
            where("date", "<=", endTimestamp),
            orderBy("date", "desc"),
            limit(100)
        );

        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            data.sort((a: any, b: any) => {
                const dateA = a.date?.seconds || 0;
                const dateB = b.date?.seconds || 0;
                if (dateB !== dateA) return dateB - dateA;
                const numA = a.ticketNumber || 0;
                const numB = b.ticketNumber || 0;
                return numB - numA;
            });
            setExpenses(data);
            setLoadingExpenses(false);
        }, () => setLoadingExpenses(false));
        return () => unsub();
    }, [activeTab, expenseFilter, expenseCustomStart, expenseCustomEnd]);

    return (
        <div className="cost-manager-container">
            <header className="cm-header">
                <h2>Gastos y Tickets</h2>
                <div className="cm-tabs">
                    <button
                        className={`cm-tab ${activeTab === 'gastos' ? 'active' : ''}`}
                        onClick={() => navigate('/editor/bills/gastos')}
                    >
                        <FaFileInvoiceDollar /> 1. Gastos
                    </button>
                    <button
                        className={`cm-tab ${activeTab === 'tickets' ? 'active' : ''}`}
                        onClick={() => navigate('/editor/bills/tickets')}
                    >
                        <FaReceipt /> 2. Cargar Ticket
                    </button>
                </div>
            </header>

            <main className="cm-content">
                {activeTab === 'gastos' && (
                    <div className="orders-table-container">
                        {loadingExpenses ? (
                            <div className="loading-state"><FaSync className="spin" size={24} /><p>Cargando gastos...</p></div>
                        ) : (
                            <div style={{ padding: '0px' }}>
                                <div className="bills-summary-bar">
                                    <span style={{ fontWeight: 'bold', color: '#475569', marginRight: '10px' }}>Filtrar por:</span>
                                    <button
                                        className={`bills-filter-btn ${expenseFilter === 'hoy' ? 'active' : ''}`}
                                        onClick={() => setExpenseFilter('hoy')}
                                    >Hoy</button>
                                    <button
                                        className={`bills-filter-btn ${expenseFilter === 'semana' ? 'active' : ''}`}
                                        onClick={() => setExpenseFilter('semana')}
                                    >Semana</button>
                                    <button
                                        className={`bills-filter-btn ${expenseFilter === 'mes' ? 'active' : ''}`}
                                        onClick={() => setExpenseFilter('mes')}
                                    >Mes Actual</button>
                                    <button
                                        className={`bills-filter-btn ${expenseFilter === 'custom' ? 'active' : ''}`}
                                        onClick={() => setExpenseFilter('custom')}
                                    >Personalizado</button>

                                    {expenseFilter === 'custom' && (
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
                                            <input
                                                type="date"
                                                value={expenseCustomStart}
                                                onChange={(e) => setExpenseCustomStart(e.target.value)}
                                                style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                            />
                                            <span style={{ color: '#64748b' }}>hasta</span>
                                            <input
                                                type="date"
                                                value={expenseCustomEnd}
                                                onChange={(e) => setExpenseCustomEnd(e.target.value)}
                                                style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                            />
                                        </div>
                                    )}

                                    <button
                                        onClick={() => navigate('/editor/bills/tickets')}
                                        style={{
                                            marginLeft: expenseFilter === 'custom' ? '0' : 'auto',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid #10b981',
                                            background: '#d1fae5',
                                            color: '#047857',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <FaReceipt /> Cargar Ticket Nuevo
                                    </button>
                                </div>

                                {expenses.length === 0 ? (
                                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No hay gastos registrados en este periodo.</p>
                                ) : (
                                    <div className="tickets-list" style={{ marginBottom: '30px' }}>
                                        {expenses.map((exp) => {
                                            const typeLabels: Record<string, string> = {
                                                materia_prima: '🛒 Materia Prima',
                                                servicio: '💡 Servicio',
                                                delivery: '🚚 Delivery',
                                                otro: '📦 Otro'
                                            };
                                            const typeLabel = typeLabels[exp.type] || exp.type || '📦 Otro';
                                            const dateObj = exp.date?.seconds ? new Date(exp.date.seconds * 1000) : null;
                                            const isExpanded = expandedTicketId === exp.id;
                                            return (
                                                <div key={exp.id} className={`ticket-row type-${exp.type} ${isExpanded ? 'expanded' : ''}`}>
                                                    {/* Fila compacta del Ticket */}
                                                    <div
                                                        className="ticket-row-main"
                                                        onClick={() => setExpandedTicketId(isExpanded ? null : exp.id)}
                                                    >
                                                        <div className="ticket-row-icon" title={typeLabel}>
                                                            {typeLabel.split(' ')[0]}
                                                        </div>
                                                        <div className="ticket-row-info">
                                                            <strong>{exp.description || 'Gasto Sin Título'}</strong>
                                                            <span className="ticket-row-meta">
                                                                TICKET #{exp.formattedTicketId || exp.id.slice(0, 6).toUpperCase()}
                                                                {' · '}
                                                                {dateObj ? dateObj.toLocaleDateString('es-AR') + ' ' + dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                                                {' · '}
                                                                {exp.createdByEmail || 'admin'}
                                                            </span>
                                                        </div>
                                                        <div className="ticket-row-amount">
                                                            ${Number(exp.totalAmount || 0).toLocaleString('es-AR')}
                                                        </div>
                                                        <FaChevronDown className="ticket-row-chevron" />
                                                    </div>

                                                    {/* Ticket Expandido Items */}
                                                    {isExpanded && (
                                                        <div className="ticket-row-details">
                                                            {exp.items && exp.items.length > 0 ? (
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '15px', color: '#475569' }}>
                                                                    <thead>
                                                                        <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#94a3b8' }}>
                                                                            <th style={{ textAlign: 'left', paddingBottom: '6px' }}>Cant. Base</th>
                                                                            <th style={{ textAlign: 'left', paddingBottom: '6px' }}>Multipl.</th>
                                                                            <th style={{ textAlign: 'left', paddingBottom: '6px' }}>Detalle</th>
                                                                            <th style={{ textAlign: 'right', paddingBottom: '6px' }}>Precio Base</th>
                                                                            <th style={{ textAlign: 'right', paddingBottom: '6px' }}>Subtotal</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {exp.items.map((item: any, i: number) => (
                                                                            <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                                                <td style={{ padding: '8px 0', fontWeight: 'bold' }}>{item.quantity} <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>{item.unit}</span></td>
                                                                                <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#3b82f6' }}>x{item.multiplier || 1}</td>
                                                                                <td style={{ padding: '8px 0' }}>{item.name}</td>
                                                                                <td style={{ padding: '8px 0', textAlign: 'right', color: '#94a3b8' }}>${Number(item.price || 0).toLocaleString('es-AR')}</td>
                                                                                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '600', color: '#0f172a' }}>${Number(item.subtotal || item.price || 0).toLocaleString('es-AR')}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            ) : (
                                                                <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', marginBottom: '15px' }}>Sin ítems detallados.</p>
                                                            )}

                                                            {isSuperAdmin && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id, e); }}
                                                                    style={{ width: '100%', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' }}
                                                                >
                                                                    <FaTrash /> Eliminar Registro
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Total Section Footer */}
                                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                    <span style={{ fontSize: '1.2rem', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                        TOTAL GASTOS ({expenseFilter})
                                    </span>
                                    <span style={{ fontSize: '2rem', color: '#ef4444', fontWeight: '800' }}>
                                        ${expenses.reduce((sum, e) => sum + (Number(e.totalAmount) || 0), 0).toLocaleString('es-AR')}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'tickets' && (
                    <VoiceAIPurchases rawMaterials={rawMaterials} />
                )}
            </main>
        </div>
    );
}
