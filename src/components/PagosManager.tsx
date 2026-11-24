import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { FaPlus, FaCheck, FaUndo, FaTrash, FaTimes, FaSyncAlt, FaWallet, FaLock, FaUserSlash, FaUsers } from 'react-icons/fa';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import EmpleadosPanel from './EmpleadosPanel';
import { useConfirm } from './useConfirm';
import { todayKey, parts, utc, diffDays, addDays, nextMonth, nextWeekDay, WEEK_DAYS, weekDaysText } from '../utils/pagosDates';
import './PagosManager.css';

// Sección "Pagos": una agenda simple de lo que hay que pagar.
// Es independiente del resto del panel (no toca Caja ni Gastos).
// Los datos viven en finance_config/pagos/items (cubierto por la regla de finance_config: solo superadmin).

type Category = 'proveedores' | 'servicios' | 'sueldos' | 'impuestos' | 'alquiler' | 'otro';
type View = 'pendientes' | 'pagados';
// 'monthly': todos los meses el mismo día · 'weekdays': los días de la semana elegidos (ej. sueldo por día).
type Repeat = 'none' | 'monthly' | 'weekdays';

interface Pago {
    id: string;
    title: string;
    amount: number; // 0 = monto a definir
    dueDate: string; // yyyy-mm-dd
    category: Category;
    recurring: boolean; // se repite (true sin `repeat` = todos los meses, pagos cargados antes)
    repeat?: Repeat;
    weekDays?: number[]; // con repeat 'weekdays': 0 = domingo … 6 = sábado
    recurDay?: number; // día del mes original (para no "correr" el vencimiento en meses cortos)
    note?: string;
    // 'skipped': ese día/mes no se pagó (ej. el empleado no vino). No suma en ningún total.
    status: 'pending' | 'paid' | 'skipped';
    paidDate?: string; // yyyy-mm-dd
    skippedDate?: string; // yyyy-mm-dd, cuándo se marcó
    employeeId?: string; // sueldo creado desde el perfil del empleado (pestaña Empleados)
}

const repeatOf = (p: Pick<Pago, 'recurring' | 'repeat'>): Repeat => p.repeat || (p.recurring ? 'monthly' : 'none');

const DEFAULT_WEEK_DAYS = [1, 2, 3, 4, 5, 6];

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
    { key: 'proveedores', label: 'Proveedores', emoji: '🚚' },
    { key: 'servicios', label: 'Servicios', emoji: '💡' },
    { key: 'sueldos', label: 'Sueldos', emoji: '👥' },
    { key: 'impuestos', label: 'Impuestos', emoji: '🧾' },
    { key: 'alquiler', label: 'Alquiler', emoji: '🏠' },
    { key: 'otro', label: 'Otro', emoji: '📌' },
];
const catOf = (k: string) => CATEGORIES.find(c => c.key === k) || CATEGORIES[CATEGORIES.length - 1];

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
    repeat: Repeat;
    weekDays: number[];
    note: string;
}

export default function PagosManager() {
    const { user, adminPermissions } = useCart();
    const { "*": subPath } = useParams();
    const navigate = useNavigate();
    // Dos permisos independientes: "pagos" (esta agenda) y "employees" (pestaña Empleados).
    const canAccess = adminPermissions?.pagos === true;
    const canEmployees = adminPermissions?.employees === true;
    const { confirm, dialog: confirmDialog } = useConfirm();
    const section: 'pagos' | 'empleados' = canEmployees && (subPath === 'empleados' || !canAccess) ? 'empleados' : 'pagos';
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
        if (!canAccess) return;
        return onSnapshot(col, snap => {
            setPagos(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Pago, 'id'>) })));
            setLoading(false);
            setLoadError(false);
        }, e => {
            console.error('Pagos: error cargando', e);
            setLoading(false);
            setLoadError(true);
        });
    }, [canAccess, col]);

    const pending = useMemo(
        () => pagos.filter(p => p.status === 'pending').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        [pagos]
    );
    const paid = useMemo(
        () => pagos.filter(p => p.status === 'paid').sort((a, b) => (b.paidDate || b.dueDate).localeCompare(a.paidDate || a.dueDate)),
        [pagos]
    );
    // Historial: lo pagado y los días que no se pagaron (no vino), por fecha.
    const history = useMemo(
        () => pagos.filter(p => p.status === 'paid' || p.status === 'skipped')
            .sort((a, b) => (b.paidDate || b.dueDate).localeCompare(a.paidDate || a.dueDate)),
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
        byCat(history).slice(0, 150).forEach(p => {
            const k = (p.paidDate || p.dueDate).slice(0, 7);
            map.set(k, [...(map.get(k) || []), p]);
        });
        return Array.from(map.entries());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, catFilter]);
    const sumPaid = (l: Pago[]) => sum(l.filter(p => p.status === 'paid'));

    const openNew = () => setForm({ title: '', amount: '', dueDate: today, category: 'proveedores', repeat: 'none', weekDays: DEFAULT_WEEK_DAYS, note: '' });
    const openEdit = (p: Pago) => setForm({
        id: p.id, title: p.title, amount: p.amount ? String(p.amount) : '', dueDate: p.dueDate,
        category: p.category, repeat: repeatOf(p),
        weekDays: p.weekDays && p.weekDays.length ? p.weekDays : DEFAULT_WEEK_DAYS, note: p.note || ''
    });

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form || !form.title.trim() || !form.dueDate) return;
        if (form.repeat === 'weekdays' && form.weekDays.length === 0) {
            alert('Elegí al menos un día de la semana.');
            return;
        }
        setSaving(true);
        const data = {
            title: form.title.trim(),
            amount: Math.max(0, num(form.amount)),
            dueDate: form.dueDate,
            category: form.category,
            recurring: form.repeat !== 'none',
            repeat: form.repeat,
            weekDays: form.repeat === 'weekdays' ? form.weekDays : null,
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

    // Crea el próximo vencimiento de un pago que se repite.
    const createNext = async (p: Pago) => {
        const repeat = repeatOf(p);
        const weekDays = p.weekDays && p.weekDays.length ? p.weekDays : null;
        if (repeat === 'none' || (repeat === 'weekdays' && !weekDays)) return;
        const recurDay = p.recurDay || parts(p.dueDate)[2];
        await addDoc(col, {
            title: p.title, amount: p.amount || 0, category: p.category, recurring: true,
            repeat, weekDays: repeat === 'weekdays' ? weekDays : null,
            recurDay, note: p.note || '',
            // El siguiente sale de la fecha de vencimiento, no de hoy: si se paga atrasado,
            // los días que faltan siguen apareciendo como vencidos.
            dueDate: repeat === 'weekdays' ? nextWeekDay(p.dueDate, weekDays!) : nextMonth(p.dueDate, recurDay),
            status: 'pending', createdAt: serverTimestamp(), createdByEmail: user?.email || 'admin'
        });
    };

    const markPaid = async (p: Pago) => {
        setBusyId(p.id);
        try {
            await updateDoc(doc(col, p.id), { status: 'paid', paidDate: today, paidAt: serverTimestamp() });
            await createNext(p);
        } catch (err) {
            console.error(err);
            alert('No se pudo marcar como pagado.');
        } finally {
            setBusyId(null);
        }
    };

    // "No vino": ese día no se paga, queda registrado en el historial y sigue el próximo.
    const markSkipped = async (p: Pago) => {
        setBusyId(p.id);
        try {
            await updateDoc(doc(col, p.id), { status: 'skipped', skippedDate: today });
            await createNext(p);
        } catch (err) {
            console.error(err);
            alert('No se pudo registrar.');
        } finally {
            setBusyId(null);
        }
    };

    const undoPaid = async (p: Pago) => {
        const extra = p.recurring ? '\n\nOjo: el pago siguiente que se creó automáticamente no se borra.' : '';
        if (!(await confirm(`¿Volver "${p.title}" a pendientes?${extra}`, { confirmLabel: 'Volver a pendientes', danger: false }))) return;
        try {
            await updateDoc(doc(col, p.id), { status: 'pending', paidDate: null, paidAt: null, skippedDate: null });
        } catch (err) {
            console.error(err);
            alert('No se pudo deshacer.');
        }
    };

    const remove = async (id: string, title: string) => {
        if (!(await confirm(`¿Eliminar "${title}"? No se puede deshacer.`, { confirmLabel: 'Eliminar' }))) return;
        try {
            await deleteDoc(doc(col, id));
            setForm(null);
        } catch (err) {
            console.error(err);
            alert('No se pudo eliminar.');
        }
    };

    if (!canAccess && !canEmployees) {
        return <div className="pg-container"><p>No tenés acceso a esta sección.</p></div>;
    }

    // Las pestañas solo aparecen si tiene los dos permisos.
    const sectionTabs = canAccess && canEmployees && (
        <div className="pg-tabs pg-section-tabs" role="tablist">
            <button role="tab" aria-selected={section === 'pagos'} className={section === 'pagos' ? 'active' : ''} onClick={() => navigate('/editor/finanzas')}>
                <FaWallet /> Pagos
            </button>
            <button role="tab" aria-selected={section === 'empleados'} className={section === 'empleados' ? 'active' : ''} onClick={() => navigate('/editor/finanzas/empleados')}>
                <FaUsers /> Empleados
            </button>
        </div>
    );

    if (section === 'empleados') {
        return (
            <div className="pg-container">
                {sectionTabs}
                <EmpleadosPanel pagos={pagos} canPagos={canAccess} />
            </div>
        );
    }

    return (
        <div className="pg-container">
            {confirmDialog}
            {sectionTabs}
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
                        Historial
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
                                            <span className="pg-title">{p.title}{p.recurring && <FaSyncAlt className="pg-rec" title={repeatOf(p) === 'weekdays' ? `Se repite: ${weekDaysText(p.weekDays)}` : 'Se repite todos los meses'} />}</span>
                                            <span className="pg-meta">
                                                {c.emoji} {c.label} · {fmtDate(p.dueDate)} · <em>{whenLabel(p.dueDate, today)}</em>
                                                {repeatOf(p) === 'weekdays' && <> · {weekDaysText(p.weekDays)}</>}
                                            </span>
                                            {p.note && <span className="pg-note">{p.note}</span>}
                                        </button>
                                        <span className={`pg-amount ${p.amount ? '' : 'tbd'}`}>{p.amount ? fmt(p.amount) : 'A definir'}</span>
                                        {p.recurring && (
                                            <div className="pg-actions">
                                                <button
                                                    className="pg-skip"
                                                    title={repeatOf(p) === 'weekdays' ? 'No vino: ese día no se paga' : 'Esta vez no se paga'}
                                                    aria-label={`${p.title}: no se paga esta vez`}
                                                    disabled={busyId === p.id}
                                                    onClick={() => markSkipped(p)}
                                                ><FaUserSlash /></button>
                                            </div>
                                        )}
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
                        <h3>{fmtMonth(`${month}-01`)} <span>{fmt(sumPaid(items))}</span></h3>
                        <ul>
                            {items.map(p => {
                                const c = catOf(p.category);
                                const skipped = p.status === 'skipped';
                                return (
                                    <li key={p.id} className={`pg-item done ${skipped ? 'skipped' : ''}`}>
                                        <span className={`pg-check done ${skipped ? 'skipped' : ''}`}>{skipped ? <FaUserSlash /> : <FaCheck />}</span>
                                        <div className="pg-body">
                                            <span className="pg-title">{p.title}</span>
                                            <span className="pg-meta">
                                                {c.emoji} {c.label} · {skipped
                                                    ? <>No se pagó ({repeatOf(p) === 'weekdays' ? 'no vino' : 'salteado'}) · {fmtDate(p.dueDate)}</>
                                                    : <>Pagado {p.paidDate ? fmtDate(p.paidDate) : ''}</>}
                                            </span>
                                        </div>
                                        <span className={`pg-amount ${skipped ? 'tbd' : ''}`}>{skipped ? '$0' : p.amount ? fmt(p.amount) : '—'}</span>
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
                            <label className="pg-field">{form.repeat === 'weekdays' ? 'Monto por día' : 'Monto'}
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

                        <div className="pg-field">¿Se repite?
                            <div className="pg-chips pick">
                                {([['none', 'No'], ['monthly', 'Todos los meses'], ['weekdays', 'Por día / días de la semana']] as [Repeat, string][]).map(([k, l]) => (
                                    <button type="button" key={k} className={form.repeat === k ? 'active' : ''}
                                        onClick={() => setForm({ ...form, repeat: k })}>{l}</button>
                                ))}
                            </div>
                        </div>

                        {form.repeat === 'weekdays' && (
                            <div className="pg-field">Días que se paga
                                <div className="pg-chips pick pg-days">
                                    {WEEK_DAYS.map(({ day, label }) => {
                                        const on = form.weekDays.includes(day);
                                        return (
                                            <button type="button" key={day} className={on ? 'active' : ''}
                                                onClick={() => setForm({ ...form, weekDays: on ? form.weekDays.filter(d => d !== day) : [...form.weekDays, day] })}>
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <small className="pg-hint">
                                    {form.weekDays.length === 0
                                        ? 'Elegí al menos un día.'
                                        : num(form.amount) > 0
                                            ? `${fmt(num(form.amount))} cada día marcado = ${fmt(num(form.amount) * form.weekDays.length)} por semana · ≈ ${fmt(num(form.amount) * form.weekDays.length * 52 / 12)} por mes.`
                                            : 'El monto es por cada día marcado. Marcá un solo día para pagar una vez por semana.'}
                                    {' '}Al marcarlo pagado se crea solo el del próximo día marcado.
                                </small>
                            </div>
                        )}

                        {form.repeat === 'monthly' && (
                            <small className="pg-hint">Al marcarlo pagado se crea solo el del mes siguiente.</small>
                        )}

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
