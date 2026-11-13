import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { FaPlus, FaCheck, FaUndo, FaTrash, FaTimes, FaSyncAlt, FaWallet, FaLock } from 'react-icons/fa';
import { useCart } from '../context/CartContext';
import './PagosManager.css';

// Sección "Pagos": una agenda simple de lo que hay que pagar.
// Es independiente del resto del panel (no toca Caja ni Gastos).
// Los datos viven en finance_config/pagos/items (cubierto por la regla de finance_config: solo superadmin).

type Category = 'proveedores' | 'servicios' | 'sueldos' | 'impuestos' | 'alquiler' | 'otro';
type View = 'pendientes' | 'pagados';

interface Pago {
    id: string;
    title: string;
    amount: number; // 0 = monto a definir
    dueDate: string; // yyyy-mm-dd
    category: Category;
    recurring: boolean; // se repite todos los meses
    recurDay?: number; // día del mes original (para no "correr" el vencimiento en meses cortos)
    note?: string;
    status: 'pending' | 'paid';
    paidDate?: string; // yyyy-mm-dd
}

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
    { key: 'proveedores', label: 'Proveedores', emoji: '🚚' },
    { key: 'servicios', label: 'Servicios', emoji: '💡' },
    { key: 'sueldos', label: 'Sueldos', emoji: '👥' },
    { key: 'impuestos', label: 'Impuestos', emoji: '🧾' },
    { key: 'alquiler', label: 'Alquiler', emoji: '🏠' },
    { key: 'otro', label: 'Otro', emoji: '📌' },
];
const catOf = (k: string) => CATEGORIES.find(c => c.key === k) || CATEGORIES[CATEGORIES.length - 1];

const AR_TZ = 'America/Argentina/Buenos_Aires';
const todayKey = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const pad = (n: number) => String(n).padStart(2, '0');
const parts = (key: string) => key.split('-').map(Number) as [number, number, number];
const utc = (key: string) => { const [y, m, d] = parts(key); return Date.UTC(y, m - 1, d); };
const diffDays = (a: string, b: string) => Math.round((utc(a) - utc(b)) / 86400000);
const addDays = (key: string, n: number) => new Date(utc(key) + n * 86400000).toISOString().slice(0, 10);
const nextMonth = (key: string, day: number) => {
    const [y, m] = parts(key);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${ny}-${pad(nm)}-${pad(Math.min(day, last))}`;
};
const fmtDate = (key: string) =>
    new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(utc(key)));
const fmtMonth = (key: string) => {
    const s = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(utc(`${key.slice(0, 7)}-01`)));
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

const whenLabel = (due: string, today: string) => {
    const d = diffDays(due, today);
    if (d === 0) return 'Vence hoy';
    if (d === 1) return 'Vence mañana';
    if (d === -1) return 'Venció ayer';
    if (d < 0) return `Venció hace ${-d} días`;
    return `En ${d} días`;
};

interface FormState {
    id?: string;
    title: string;
    amount: string;
    dueDate: string;
    category: Category;
    recurring: boolean;
    note: string;
}

export default function PagosManager() {
    const { user, isSuperAdmin } = useCart();
    const [pagos, setPagos] = useState<Pago[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [view, setView] = useState<View>('pendientes');
    const [catFilter, setCatFilter] = useState<Category | 'todas'>('todas');
    const [form, setForm] = useState<FormState | null>(null);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const today = todayKey();
    const col = useMemo(() => collection(db, 'finance_config', 'pagos', 'items'), []);

    useEffect(() => {
        if (!isSuperAdmin) return;
        return onSnapshot(col, snap => {
            setPagos(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Pago, 'id'>) })));
            setLoading(false);
            setLoadError(false);
        }, e => {
            console.error('Pagos: error cargando', e);
            setLoading(false);
            setLoadError(true);
        });
    }, [isSuperAdmin, col]);

    const pending = useMemo(
        () => pagos.filter(p => p.status === 'pending').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        [pagos]
    );
    const paid = useMemo(
        () => pagos.filter(p => p.status === 'paid').sort((a, b) => (b.paidDate || b.dueDate).localeCompare(a.paidDate || a.dueDate)),
        [pagos]
    );

    const sum = (l: Pago[]) => l.reduce((s, p) => s + (p.amount || 0), 0);
    const overdue = pending.filter(p => p.dueDate < today);
    const next7 = pending.filter(p => p.dueDate >= today && p.dueDate <= addDays(today, 7));
    const paidThisMonth = paid.filter(p => (p.paidDate || '').startsWith(today.slice(0, 7)));

    const byCat = (l: Pago[]) => (catFilter === 'todas' ? l : l.filter(p => p.category === catFilter));
    const usedCats = CATEGORIES.filter(c => pagos.some(p => p.category === c.key));

    const groups = useMemo(() => {
        const list = byCat(pending);
        const week = addDays(today, 7);
        return [
            { key: 'vencidos', label: 'Vencidos', tone: 'bad', items: list.filter(p => p.dueDate < today) },
            { key: 'hoy', label: 'Hoy', tone: 'warn', items: list.filter(p => p.dueDate === today) },
            { key: 'semana', label: 'Próximos 7 días', tone: '', items: list.filter(p => p.dueDate > today && p.dueDate <= week) },
            { key: 'despues', label: 'Más adelante', tone: '', items: list.filter(p => p.dueDate > week) },
        ].filter(g => g.items.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pending, today, catFilter]);

    const paidGroups = useMemo(() => {
        const map = new Map<string, Pago[]>();
        byCat(paid).slice(0, 150).forEach(p => {
            const k = (p.paidDate || p.dueDate).slice(0, 7);
            map.set(k, [...(map.get(k) || []), p]);
        });
        return Array.from(map.entries());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paid, catFilter]);

    const openNew = () => setForm({ title: '', amount: '', dueDate: today, category: 'proveedores', recurring: false, note: '' });
    const openEdit = (p: Pago) => setForm({
        id: p.id, title: p.title, amount: p.amount ? String(p.amount) : '', dueDate: p.dueDate,
        category: p.category, recurring: !!p.recurring, note: p.note || ''
    });

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form || !form.title.trim() || !form.dueDate) return;
        setSaving(true);
        const data = {
            title: form.title.trim(),
            amount: Math.max(0, num(form.amount)),
            dueDate: form.dueDate,
            category: form.category,
            recurring: form.recurring,
            recurDay: parts(form.dueDate)[2],
            note: form.note.trim(),
        };
        try {
            if (form.id) await updateDoc(doc(col, form.id), data);
            else await addDoc(col, { ...data, status: 'pending', createdAt: serverTimestamp(), createdByEmail: user?.email || 'admin' });
            setForm(null);
        } catch (err) {
            console.error(err);
            alert('No se pudo guardar el pago.');
        } finally {
            setSaving(false);
        }
    };

    const markPaid = async (p: Pago) => {
        setBusyId(p.id);
        try {
            await updateDoc(doc(col, p.id), { status: 'paid', paidDate: today, paidAt: serverTimestamp() });
            if (p.recurring) {
                await addDoc(col, {
                    title: p.title, amount: p.amount || 0, category: p.category, recurring: true,
                    recurDay: p.recurDay || parts(p.dueDate)[2], note: p.note || '',
                    dueDate: nextMonth(p.dueDate, p.recurDay || parts(p.dueDate)[2]),
                    status: 'pending', createdAt: serverTimestamp(), createdByEmail: user?.email || 'admin'
                });
            }
        } catch (err) {
            console.error(err);
            alert('No se pudo marcar como pagado.');
        } finally {
            setBusyId(null);
        }
    };

    const undoPaid = async (p: Pago) => {
        const extra = p.recurring ? '\n\nOjo: el pago del mes siguiente que se creó automáticamente no se borra.' : '';
        if (!window.confirm(`¿Volver "${p.title}" a pendientes?${extra}`)) return;
        try {
            await updateDoc(doc(col, p.id), { status: 'pending', paidDate: null, paidAt: null });
        } catch (err) {
            console.error(err);
            alert('No se pudo deshacer.');
        }
    };

    const remove = async (id: string, title: string) => {
        if (!window.confirm(`¿Eliminar "${title}"? No se puede deshacer.`)) return;
        try {
            await deleteDoc(doc(col, id));
            setForm(null);
        } catch (err) {
            console.error(err);
            alert('No se pudo eliminar.');
        }
    };

    if (!isSuperAdmin) {
        return <div className="pg-container"><p>Esta sección es solo para el administrador principal.</p></div>;
    }

    return (
        <div className="pg-container">
            <header className="pg-header">
                <div>
                    <h2><FaWallet /> Pagos <span className="pg-badge"><FaLock /> Solo admin</span></h2>
                    <p>Anotá lo que hay que pagar y tildalo cuando esté pago.</p>
                </div>
                <button className="pg-new" onClick={openNew}><FaPlus /> Nuevo pago</button>
            </header>

            <div className="pg-summary">
                <div className={`pg-stat ${overdue.length ? 'bad' : ''}`}>
                    <span>Vencido</span>
                    <strong>{fmt(sum(overdue))}</strong>
                    <small>{overdue.length} {overdue.length === 1 ? 'pago' : 'pagos'}</small>
                </div>
                <div className="pg-stat">
                    <span>Próximos 7 días</span>
                    <strong>{fmt(sum(next7))}</strong>
                    <small>{next7.length} {next7.length === 1 ? 'pago' : 'pagos'}</small>
                </div>
                <div className="pg-stat">
                    <span>Total pendiente</span>
                    <strong>{fmt(sum(pending))}</strong>
                    <small>{pending.length} {pending.length === 1 ? 'pago' : 'pagos'}</small>
                </div>
                <div className="pg-stat good">
                    <span>Pagado este mes</span>
                    <strong>{fmt(sum(paidThisMonth))}</strong>
                    <small>{paidThisMonth.length} {paidThisMonth.length === 1 ? 'pago' : 'pagos'}</small>
                </div>
            </div>

            <div className="pg-toolbar">
                <div className="pg-tabs" role="tablist">
                    <button role="tab" aria-selected={view === 'pendientes'} className={view === 'pendientes' ? 'active' : ''} onClick={() => setView('pendientes')}>
                        Pendientes <b>{pending.length}</b>
                    </button>
                    <button role="tab" aria-selected={view === 'pagados'} className={view === 'pagados' ? 'active' : ''} onClick={() => setView('pagados')}>
                        Pagados
                    </button>
                </div>
                {usedCats.length > 1 && (
                    <div className="pg-chips">
                        <button className={catFilter === 'todas' ? 'active' : ''} onClick={() => setCatFilter('todas')}>Todas</button>
                        {usedCats.map(c => (
                            <button key={c.key} className={catFilter === c.key ? 'active' : ''} onClick={() => setCatFilter(c.key)}>
                                {c.emoji} {c.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {loadError && <div className="pg-empty bad">No se pudieron cargar los pagos. Revisá la conexión y recargá la página.</div>}
            {loading && !loadError && <div className="pg-empty">Cargando…</div>}

            {!loading && !loadError && view === 'pendientes' && (
                groups.length === 0 ? (
                    <div className="pg-empty">
                        <div className="pg-empty-icon">✅</div>
                        <strong>{pending.length === 0 ? 'No hay pagos pendientes' : 'Nada pendiente en esta categoría'}</strong>
                        {pending.length === 0 && <>
                            <p>Cargá el primero: una factura de proveedor, la luz, el alquiler…</p>
                            <button className="pg-new" onClick={openNew}><FaPlus /> Nuevo pago</button>
                        </>}
                    </div>
                ) : groups.map(g => (
                    <section key={g.key} className="pg-group">
                        <h3 className={g.tone}>{g.label} <span>{fmt(sum(g.items))}</span></h3>
                        <ul>
                            {g.items.map(p => {
                                const c = catOf(p.category);
                                const late = p.dueDate < today;
                                return (
                                    <li key={p.id} className={`pg-item ${late ? 'late' : ''}`}>
                                        <button
                                            className="pg-check"
                                            title="Marcar como pagado"
                                            aria-label={`Marcar ${p.title} como pagado`}
                                            disabled={busyId === p.id}
                                            onClick={() => markPaid(p)}
                                        ><FaCheck /></button>
                                        <button className="pg-body" onClick={() => openEdit(p)} title="Editar">
                                            <span className="pg-title">{p.title}{p.recurring && <FaSyncAlt className="pg-rec" title="Se repite todos los meses" />}</span>
                                            <span className="pg-meta">
                                                {c.emoji} {c.label} · {fmtDate(p.dueDate)} · <em>{whenLabel(p.dueDate, today)}</em>
                                            </span>
                                            {p.note && <span className="pg-note">{p.note}</span>}
                                        </button>
                                        <span className={`pg-amount ${p.amount ? '' : 'tbd'}`}>{p.amount ? fmt(p.amount) : 'A definir'}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))
            )}

            {!loading && !loadError && view === 'pagados' && (
                paidGroups.length === 0 ? (
                    <div className="pg-empty"><strong>Todavía no hay pagos realizados</strong></div>
                ) : paidGroups.map(([month, items]) => (
                    <section key={month} className="pg-group">
                        <h3>{fmtMonth(`${month}-01`)} <span>{fmt(sum(items))}</span></h3>
                        <ul>
                            {items.map(p => {
                                const c = catOf(p.category);
                                return (
                                    <li key={p.id} className="pg-item done">
                                        <span className="pg-check done"><FaCheck /></span>
                                        <div className="pg-body">
                                            <span className="pg-title">{p.title}</span>
                                            <span className="pg-meta">{c.emoji} {c.label} · Pagado {p.paidDate ? fmtDate(p.paidDate) : ''}</span>
                                        </div>
                                        <span className="pg-amount">{p.amount ? fmt(p.amount) : '—'}</span>
                                        <div className="pg-actions">
                                            <button title="Volver a pendientes" aria-label="Volver a pendientes" onClick={() => undoPaid(p)}><FaUndo /></button>
                                            <button title="Eliminar" aria-label="Eliminar" className="danger" onClick={() => remove(p.id, p.title)}><FaTrash /></button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))
            )}

            {form && (
                <div className="pg-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setForm(null); }}>
                    <form className="pg-modal" onSubmit={save}>
                        <div className="pg-modal-head">
                            <h3>{form.id ? 'Editar pago' : 'Nuevo pago'}</h3>
                            <button type="button" className="pg-close" aria-label="Cerrar" onClick={() => setForm(null)}><FaTimes /></button>
                        </div>

                        <label className="pg-field">¿Qué hay que pagar?
                            <input autoFocus={!form.id} required value={form.title} placeholder="Ej: Harina Calsa, luz, alquiler"
                                onChange={e => setForm({ ...form, title: e.target.value })} />
                        </label>

                        <div className="pg-row">
                            <label className="pg-field">Monto
                                <input type="text" inputMode="decimal" value={form.amount} placeholder="$ (opcional)"
                                    onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^\d.,]/g, '') })} />
                            </label>
                            <label className="pg-field">Vence
                                <input type="date" required value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
                            </label>
                        </div>

                        <div className="pg-field">Categoría
                            <div className="pg-chips pick">
                                {CATEGORIES.map(c => (
                                    <button type="button" key={c.key} className={form.category === c.key ? 'active' : ''}
                                        onClick={() => setForm({ ...form, category: c.key })}>{c.emoji} {c.label}</button>
                                ))}
                            </div>
                        </div>

                        <label className="pg-switch">
                            <input type="checkbox" checked={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.checked })} />
                            <span>
                                <b>Se repite todos los meses</b>
                                <small>Al marcarlo pagado se crea solo el del mes siguiente.</small>
                            </span>
                        </label>

                        <label className="pg-field">Nota (opcional)
                            <input value={form.note} placeholder="N° de factura, alias, etc." onChange={e => setForm({ ...form, note: e.target.value })} />
                        </label>

                        <div className="pg-modal-foot">
                            {form.id && (
                                <button type="button" className="pg-delete" onClick={() => remove(form.id!, form.title)}><FaTrash /> Eliminar</button>
                            )}
                            <button type="submit" className="pg-save" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
