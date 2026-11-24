import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { FaPlus, FaTimes, FaUsers, FaUserSlash, FaLink, FaPhone, FaChevronLeft, FaChevronRight, FaTrash, FaClock } from 'react-icons/fa';
import { db } from '../firebase/firebaseConfig';
import { useCart } from '../context/CartContext';
import { useConfirm } from './useConfirm';
import { todayKey, parts, pad, addDays, weekDayOf, nextMonth, WEEK_DAYS, WEEKS_PER_MONTH, weekDaysText } from '../utils/pagosDates';
import './PagosManager.css';
import './EmpleadosPanel.css';

// Perfil de cada empleado: dónde trabaja, horario, cómo se le paga, su costo y las horas que
// trabajó de verdad. Vive en finance_config/pagos/empleados (permisos "pagos" o "employees");
// las horas, en la subcolección `horas` de cada empleado. Los empleados del módulo anterior
// (colección `employees`) aparecen para completar hasta que se guardan acá.

type Area = 'produccion' | 'atencion' | 'reparto' | 'limpieza' | 'administracion';
type PayMode = 'hour' | 'day' | 'month';
type PayFrequency = 'daily' | 'weekly' | 'monthly';

const AREAS: { key: Area; label: string; emoji: string }[] = [
    { key: 'produccion', label: 'Producción', emoji: '🥖' },
    { key: 'atencion', label: 'Mostrador / atención', emoji: '🛎️' },
    { key: 'reparto', label: 'Reparto', emoji: '🛵' },
    { key: 'limpieza', label: 'Limpieza', emoji: '🧽' },
    { key: 'administracion', label: 'Administración', emoji: '📋' },
];
const areaOf = (k: Area) => AREAS.find(a => a.key === k) || AREAS[0];

const PAY_MODES: { key: PayMode; label: string; unit: string }[] = [
    { key: 'hour', label: 'Por hora', unit: 'por hora' },
    { key: 'day', label: 'Por día', unit: 'por día' },
    { key: 'month', label: 'Por mes', unit: 'por mes' },
];
const FREQUENCIES: { key: PayFrequency; label: string }[] = [
    { key: 'daily', label: 'Cada día que trabaja' },
    { key: 'weekly', label: 'Semanal' },
    { key: 'monthly', label: 'Mensual' },
];

interface Shift { from: string; to: string }

interface EmployeeProfile {
    id: string;
    name: string;
    active: boolean;
    deleted?: boolean;
    phone?: string;
    emergencyContact?: string;
    startDate?: string;
    areas: { area: Area; percent: number }[];
    schedule: Record<string, Shift>; // días que trabaja; clave: día de la semana ('0' = domingo … '6' = sábado)
    // 'perDay': las mismas horas todos los días que trabaja (`dailyHours`).
    // 'times': entrada y salida por día (las horas salen de `schedule`).
    hoursMode: 'perDay' | 'times';
    dailyHours: number;
    payMode: PayMode;
    payAmount: number;
    payFrequency: PayFrequency;
    payWeekDay?: number;
    payMonthDay?: number;
    notes?: string;
    syncPago: boolean;
    /** Solo en pantalla: viene del módulo anterior y todavía no se guardó acá. */
    legacy?: boolean;
}

/** Un día trabajado (horas reales). */
interface HoursEntry {
    id: string;
    date: string; // yyyy-mm-dd
    from?: string; // solo si se anotó con entrada y salida
    to?: string;
    hours: number;
    note?: string;
}

// Lo que se necesita de cada pago (los pagos los carga PagosManager).
export interface PagoLite {
    id: string;
    title: string;
    amount: number;
    dueDate: string;
    status: 'pending' | 'paid' | 'skipped';
    paidDate?: string;
    employeeId?: string;
}

const DEFAULT_SHIFT: Shift = { from: '08:00', to: '14:00' };

const emptyProfile = (): EmployeeProfile => ({
    id: '', name: '', active: true, areas: [], schedule: {}, hoursMode: 'perDay', dailyHours: 8,
    payMode: 'day', payAmount: 0, payFrequency: 'weekly', payWeekDay: 6, payMonthDay: 5,
    syncPago: true,
});

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
const hoursText = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('es-AR')} h`;

const shiftHours = (s: Shift) => {
    const [fh, fm] = s.from.split(':').map(Number);
    const [th, tm] = s.to.split(':').map(Number);
    if ([fh, fm, th, tm].some(n => !Number.isFinite(n))) return 0;
    let mins = (th * 60 + tm) - (fh * 60 + fm);
    if (mins <= 0) mins += 24 * 60; // turno que pasa la medianoche (ej. 22:00 a 06:00)
    return mins / 60;
};

const workDaysOf = (p: EmployeeProfile) => Object.keys(p.schedule).map(Number).filter(n => n >= 0 && n <= 6);

/** Horas que trabaja ese día de la semana (0 si no trabaja). */
const dayHours = (p: EmployeeProfile, weekDay: number) => {
    const s = p.schedule[String(weekDay)];
    if (!s) return 0;
    return p.hoursMode === 'times' ? shiftHours(s) : Number(p.dailyHours) || 0;
};

// ---- Meses ('yyyy-mm') ----
const monthDays = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => `${month}-${pad(i + 1)}`);
};
const shiftMonth = (month: string, delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const monthLabel = (month: string) => {
    const s = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00Z`));
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const dayLabel = (key: string) => {
    const [, m, d] = parts(key);
    return `${WEEK_DAYS.find(w => w.day === weekDayOf(key))?.label || ''} ${pad(d)}/${pad(m)}`;
};

/** Horas y pago previstos por mes según el horario. */
const calc = (p: EmployeeProfile) => {
    const days = workDaysOf(p);
    const weeklyHours = days.reduce((s, d) => s + dayHours(p, d), 0);
    const monthlyHours = weeklyHours * WEEKS_PER_MONTH;
    const daysPerMonth = days.length * WEEKS_PER_MONTH;
    const amount = Number(p.payAmount) || 0;
    const monthlyPay = p.payMode === 'hour' ? amount * monthlyHours : p.payMode === 'day' ? amount * daysPerMonth : amount;
    return { days, weeklyHours, monthlyHours, daysPerMonth, monthlyPay, hourly: monthlyHours > 0 ? monthlyPay / monthlyHours : 0 };
};

/** Horas reales de un mes frente a lo que marca el horario, y lo que corresponde pagar por ellas. */
const monthHours = (p: EmployeeProfile, entries: HoursEntry[], month: string) => {
    const list = entries.filter(e => e.date.startsWith(month));
    const worked = list.reduce((s, e) => s + (Number(e.hours) || 0), 0);
    const daysWorked = new Set(list.map(e => e.date)).size;
    let expected = 0;
    let expectedDays = 0;
    monthDays(month).forEach(k => {
        if (p.schedule[String(weekDayOf(k))]) { expected += dayHours(p, weekDayOf(k)); expectedDays++; }
    });
    const amount = Number(p.payAmount) || 0;
    const toPay = p.payMode === 'hour' ? worked * amount : p.payMode === 'day' ? daysWorked * amount : null;
    return { list, worked, daysWorked, expected, expectedDays, toPay };
};

const scheduleText = (p: EmployeeProfile) => {
    const days = workDaysOf(p);
    if (days.length === 0) return 'Sin horario cargado';
    if (p.hoursMode !== 'times') return `${weekDaysText(days)} · ${hoursText(Number(p.dailyHours) || 0)} por día`;
    const shifts = days.map(d => p.schedule[String(d)]);
    const same = shifts.every(s => s.from === shifts[0].from && s.to === shifts[0].to);
    return `${weekDaysText(days)} · ${same ? `${shifts[0].from} a ${shifts[0].to}` : 'horario variable'}`;
};

// Configuración del pago en Pagos según cómo y cada cuánto se le paga.
const pagoPlan = (p: EmployeeProfile, today: string) => {
    const c = calc(p);
    if (c.monthlyPay <= 0) return null;
    const firstOn = (weekDays: number[]) => {
        for (let i = 0; i < 7; i++) {
            const k = addDays(today, i);
            if (weekDays.includes(weekDayOf(k))) return k;
        }
        return today;
    };
    if (p.payFrequency === 'daily') {
        if (c.days.length === 0) return null;
        const perDay = p.payMode === 'day' ? p.payAmount : c.monthlyPay / c.daysPerMonth;
        return { amount: Math.round(perDay), repeat: 'weekdays' as const, weekDays: c.days, recurDay: null, dueDate: firstOn(c.days), label: 'cada día que trabaja' };
    }
    if (p.payFrequency === 'weekly') {
        const wd = p.payWeekDay ?? 6;
        return { amount: Math.round(c.monthlyPay / WEEKS_PER_MONTH), repeat: 'weekdays' as const, weekDays: [wd], recurDay: null, dueDate: firstOn([wd]), label: `cada ${WEEK_DAYS.find(w => w.day === wd)?.label || ''}` };
    }
    const day = Math.min(Math.max(p.payMonthDay || 5, 1), 31);
    const [y, m] = parts(today);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const thisMonth = `${today.slice(0, 7)}-${pad(Math.min(day, last))}`;
    return { amount: Math.round(c.monthlyPay), repeat: 'monthly' as const, weekDays: null, recurDay: day, dueDate: thisMonth >= today ? thisMonth : nextMonth(today, day), label: `el ${day} de cada mes` };
};

interface LegacyEmployee { id: string; name?: string; active?: boolean; hourlyRate?: number; dailyRate?: number; paymentMode?: string }

interface EntryDraft { date: string; from: string; to: string; hours: string; note: string }

// `canPagos`: sin el permiso de Pagos no se leen ni se crean pagos (solo el perfil y las horas).
export default function EmpleadosPanel({ pagos, canPagos }: { pagos: PagoLite[]; canPagos: boolean }) {
    const { user } = useCart();
    const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
    const [legacy, setLegacy] = useState<LegacyEmployee[]>([]);
    const [laborRate, setLaborRate] = useState<{ name: string; perHour: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<EmployeeProfile | null>(null);
    const [saving, setSaving] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const today = todayKey();
    const [month, setMonth] = useState(today.slice(0, 7));
    const [hoursByEmp, setHoursByEmp] = useState<Record<string, HoursEntry[]>>({});
    const [draft, setDraft] = useState<EntryDraft | null>(null);
    const [addingHours, setAddingHours] = useState(false);
    const { confirm, dialog: confirmDialog } = useConfirm();

    const monthKey = today.slice(0, 7);
    const col = useMemo(() => collection(db, 'finance_config', 'pagos', 'empleados'), []);
    const pagosCol = useMemo(() => collection(db, 'finance_config', 'pagos', 'items'), []);
    const hoursCol = (empId: string) => collection(db, 'finance_config', 'pagos', 'empleados', empId, 'horas');

    useEffect(() => {
        const u1 = onSnapshot(col, s => {
            setProfiles(s.docs.map(d => ({ ...emptyProfile(), ...(d.data() as Partial<EmployeeProfile>), id: d.id })));
            setLoading(false);
        }, e => { console.error('Empleados: error cargando', e); setLoading(false); });
        // Empleados del módulo anterior: si no se pueden leer, simplemente no aparecen.
        const u2 = onSnapshot(collection(db, 'employees'), s => {
            setLegacy(s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LegacyEmployee, 'id'>) })));
        }, () => setLegacy([]));
        // Valor de la mano de obra que usan las recetas (ej. "Tiempo panadero").
        const u3 = onSnapshot(query(collection(db, 'raw_materials'), where('category', '==', 'mano de obra')), s => {
            const m = s.docs[0]?.data();
            if (!m) { setLaborRate(null); return; }
            const perUnit = (Number(m.price) || 0) / (Number(m.baseQuantity) || 1);
            const unit = String(m.unit || '').toLowerCase();
            setLaborRate({ name: String(m.name || 'Mano de obra'), perHour: unit.startsWith('min') ? perUnit * 60 : perUnit });
        }, () => setLaborRate(null));
        return () => { u1(); u2(); u3(); };
    }, [col]);

    // Horas del mes elegido de cada empleado guardado.
    const savedIds = useMemo(() => profiles.filter(p => !p.deleted).map(p => p.id).sort().join(','), [profiles]);
    useEffect(() => {
        if (!savedIds) return;
        const unsubs = savedIds.split(',').map(id => onSnapshot(
            query(collection(db, 'finance_config', 'pagos', 'empleados', id, 'horas'),
                where('date', '>=', `${month}-01`), where('date', '<=', `${month}-31`)),
            s => setHoursByEmp(prev => ({ ...prev, [id]: s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<HoursEntry, 'id'>) })) })),
            e => console.error('Empleados: error cargando horas', e)
        ));
        return () => unsubs.forEach(u => u());
    }, [savedIds, month]);

    const employees = useMemo<EmployeeProfile[]>(() => {
        const known = new Set(profiles.map(p => p.id));
        const fromLegacy = legacy
            .filter(l => !known.has(l.id) && l.name)
            .map(l => ({
                ...emptyProfile(),
                id: l.id,
                name: String(l.name),
                active: l.active !== false,
                payMode: (l.paymentMode === 'daily' ? 'day' : 'hour') as PayMode,
                payAmount: Number(l.paymentMode === 'daily' ? l.dailyRate : l.hourlyRate) || 0,
                legacy: true,
            }));
        return [...profiles.filter(p => !p.deleted), ...fromLegacy].sort((a, b) => a.name.localeCompare(b.name));
    }, [profiles, legacy]);

    const active = employees.filter(e => e.active);
    const inactive = employees.filter(e => !e.active);

    const monthStats = (id: string) => {
        const mine = pagos.filter(p => p.employeeId === id);
        return {
            faltas: mine.filter(p => p.status === 'skipped' && p.dueDate.startsWith(monthKey)).length,
            pagado: mine.filter(p => p.status === 'paid' && (p.paidDate || '').startsWith(monthKey)).reduce((s, p) => s + (p.amount || 0), 0),
            next: mine.filter(p => p.status === 'pending').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0],
        };
    };

    const totals = active.reduce((acc, e) => {
        const h = monthHours(e, hoursByEmp[e.id] || [], month);
        return {
            worked: acc.worked + h.worked,
            expected: acc.expected + h.expected,
            cost: acc.cost + calc(e).monthlyPay,
            paid: acc.paid + monthStats(e.id).pagado,
        };
    }, { worked: 0, expected: 0, cost: 0, paid: 0 });
    const pendingLegacy = employees.filter(e => e.legacy).length;

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form || !form.name.trim()) return;
        setSaving(true);
        try {
            const id = form.id || doc(col).id;
            // Sin `id`/`legacy` (solo de pantalla) ni campos vacíos: Firestore no acepta `undefined`.
            const data = Object.fromEntries(
                Object.entries({ ...form, name: form.name.trim() }).filter(([k, v]) => k !== 'id' && k !== 'legacy' && v !== undefined)
            );
            await setDoc(doc(col, id), { ...data, updatedAt: serverTimestamp() });

            // Mantener su sueldo en Pagos: crea el pago si no tiene uno pendiente, o actualiza el monto.
            const plan = canPagos && form.syncPago && form.active ? pagoPlan({ ...form, id }, today) : null;
            if (plan) {
                const pendings = pagos.filter(p => p.employeeId === id && p.status === 'pending');
                const fields = {
                    title: form.name.trim(), amount: plan.amount, category: 'sueldos', recurring: true,
                    repeat: plan.repeat, weekDays: plan.weekDays, employeeId: id,
                    ...(plan.recurDay ? { recurDay: plan.recurDay } : {}),
                };
                if (pendings.length === 0) {
                    await addDoc(pagosCol, {
                        ...fields, dueDate: plan.dueDate, recurDay: plan.recurDay || parts(plan.dueDate)[2], note: '',
                        status: 'pending', createdAt: serverTimestamp(), createdByEmail: user?.email || 'admin',
                    });
                } else {
                    for (const p of pendings) await updateDoc(doc(pagosCol, p.id), fields);
                }
            }
            setForm(null);
        } catch (err) {
            console.error(err);
            alert('No se pudo guardar el empleado.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!form) return;
        if (!(await confirm(`¿Eliminar a ${form.name}?
Si solo dejó de trabajar, mejor marcalo como inactivo para conservar su historial.`, { confirmLabel: 'Eliminar' }))) return;
        try {
            await setDoc(doc(col, form.id), { name: form.name, deleted: true, active: false }, { merge: true });
            setForm(null);
        } catch (err) {
            console.error(err);
            alert('No se pudo eliminar.');
        }
    };

    // ---- Horas trabajadas ----
    const shiftFor = (p: EmployeeProfile, date: string): Shift => p.schedule[String(weekDayOf(date))] || DEFAULT_SHIFT;
    const newDraft = (p: EmployeeProfile, date: string): EntryDraft => ({
        date, ...shiftFor(p, date),
        hours: String(dayHours(p, weekDayOf(date)) || Number(p.dailyHours) || ''),
        note: '',
    });
    const draftHours = (p: EmployeeProfile, d: EntryDraft) => (p.hoursMode === 'times' ? shiftHours(d) : Number(String(d.hours).replace(',', '.')) || 0);

    const openEmployee = (e: EmployeeProfile) => {
        setForm({ ...e });
        const date = today.startsWith(month) ? today : `${month}-01`;
        setDraft(newDraft(e, date));
    };

    const addHours = async () => {
        if (!form || !draft || !draft.date) return;
        const hours = Math.round(draftHours(form, draft) * 100) / 100;
        if (hours <= 0 || hours > 24) { alert('Revisá las horas: tienen que ser más de 0 y hasta 24.'); return; }
        setAddingHours(true);
        try {
            await addDoc(hoursCol(form.id), {
                date: draft.date, hours,
                ...(form.hoursMode === 'times' ? { from: draft.from, to: draft.to } : {}),
                ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
                createdAt: serverTimestamp(), createdByEmail: user?.email || 'admin',
            });
            // Deja listo el día siguiente que trabaja, con su horario.
            let next = addDays(draft.date, 1);
            for (let i = 0; i < 7 && !form.schedule[String(weekDayOf(next))] && workDaysOf(form).length > 0; i++) next = addDays(next, 1);
            setDraft(newDraft(form, next));
        } catch (err) {
            console.error(err);
            alert('No se pudieron guardar las horas.');
        } finally {
            setAddingHours(false);
        }
    };

    const removeHours = async (entry: HoursEntry) => {
        if (!form || !(await confirm(`¿Borrar las horas del ${dayLabel(entry.date)}?`, { confirmLabel: 'Borrar' }))) return;
        try {
            await deleteDoc(doc(hoursCol(form.id), entry.id));
        } catch (err) {
            console.error(err);
            alert('No se pudo borrar.');
        }
    };

    const renderCard = (e: EmployeeProfile) => {
        const c = calc(e);
        const h = monthHours(e, hoursByEmp[e.id] || [], month);
        const st = monthStats(e.id);
        const mode = PAY_MODES.find(m => m.key === e.payMode);
        return (
            <button key={e.id} className={`em-card ${e.active ? '' : 'inactive'}`} onClick={() => openEmployee(e)}>
                <div className="em-card-top">
                    <div className="em-avatar">{e.name.trim().charAt(0).toUpperCase()}</div>
                    <div className="em-card-name">
                        <strong>{e.name}</strong>
                        <span>{scheduleText(e)}</span>
                    </div>
                    {e.legacy && <span className="em-tag warn">Para completar</span>}
                    {!e.active && <span className="em-tag">Inactivo</span>}
                </div>
                {e.areas.length > 0 && (
                    <div className="em-areas">
                        {e.areas.map(a => (
                            <span key={a.area} className="em-area">{areaOf(a.area).emoji} {areaOf(a.area).label}{e.areas.length > 1 ? ` · ${a.percent}%` : ''}</span>
                        ))}
                    </div>
                )}
                <div className="em-card-grid">
                    <div>
                        <span>Horas trabajadas</span>
                        <b>{e.legacy ? '—' : hoursText(h.worked)}</b>
                        <small>{h.expected > 0 ? `de ${hoursText(h.expected)} según horario` : c.weeklyHours > 0 ? `${hoursText(c.weeklyHours)}/sem` : 'sin horario'}</small>
                    </div>
                    <div><span>Paga</span><b>{e.payAmount ? `${fmt(e.payAmount)} ${mode?.unit || ''}` : 'A definir'}</b>{h.toPay !== null && h.worked > 0 && <small>{fmt(h.toPay)} por lo trabajado</small>}</div>
                    <div><span>Costo por mes</span><b>{c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—'}</b>{c.hourly > 0 && <small>{fmt(c.hourly)} la hora</small>}</div>
                    {canPagos && <div><span>Este mes</span><b>{fmt(st.pagado)} pagado</b><small className={st.faltas ? 'warn' : ''}>{st.faltas} {st.faltas === 1 ? 'falta' : 'faltas'}</small></div>}
                </div>
                {st.next && (
                    <div className="em-card-foot">
                        <span className="em-next"><FaLink /> Próximo pago {st.next.dueDate.slice(8, 10)}/{st.next.dueDate.slice(5, 7)}</span>
                    </div>
                )}
            </button>
        );
    };

    // ---- Formulario ----
    const f = form;
    const fc = f ? calc(f) : null;
    const fh = f ? monthHours(f, hoursByEmp[f.id] || [], month) : null;
    const isSaved = !!f && profiles.some(p => p.id === f.id);
    const plan = f ? pagoPlan(f, today) : null;
    const setF = (patch: Partial<EmployeeProfile>) => setForm(prev => (prev ? { ...prev, ...patch } : prev));

    const toggleArea = (area: Area) => {
        if (!f) return;
        const has = f.areas.some(a => a.area === area);
        const list = has ? f.areas.filter(a => a.area !== area) : [...f.areas, { area, percent: 0 }];
        // Al sumar o quitar un área se reparte en partes iguales; después se puede ajustar.
        const even = list.length ? Math.floor(100 / list.length) : 0;
        setF({ areas: list.map((a, i) => ({ ...a, percent: i === 0 ? 100 - even * (list.length - 1) : even })) });
    };

    const toggleDay = (day: number) => {
        if (!f) return;
        const key = String(day);
        const schedule = { ...f.schedule };
        if (schedule[key]) delete schedule[key];
        else {
            const firstKey = WEEK_DAYS.map(w => String(w.day)).find(k => schedule[k]);
            schedule[key] = firstKey ? { ...schedule[firstKey] } : { ...DEFAULT_SHIFT };
        }
        setF({ schedule });
    };

    const setShift = (day: number, patch: Partial<Shift>) => {
        if (!f) return;
        const key = String(day);
        setF({ schedule: { ...f.schedule, [key]: { ...f.schedule[key], ...patch } } });
    };

    const copyShiftToAll = (day: number) => {
        if (!f) return;
        const src = f.schedule[String(day)];
        const schedule: Record<string, Shift> = {};
        Object.keys(f.schedule).forEach(k => { schedule[k] = { ...src }; });
        setF({ schedule });
    };

    const areaSum = f ? f.areas.reduce((s, a) => s + (Number(a.percent) || 0), 0) : 100;
    const productionShare = f ? (f.areas.find(a => a.area === 'produccion')?.percent || 0) : 0;

    const monthPicker = (
        <div className="em-month">
            <button type="button" aria-label="Mes anterior" onClick={() => setMonth(m => shiftMonth(m, -1))}><FaChevronLeft /></button>
            <span>{monthLabel(month)}</span>
            <button type="button" aria-label="Mes siguiente" disabled={month >= monthKey} onClick={() => setMonth(m => shiftMonth(m, 1))}><FaChevronRight /></button>
        </div>
    );

    return (
        <div className="em-panel">
            {confirmDialog}
            <header className="pg-header">
                <div>
                    <h2><FaUsers /> Empleados</h2>
                    <p>Dónde trabaja cada uno, su horario, cómo se le paga y las horas que trabajó.</p>
                </div>
                <button className="pg-new" onClick={() => { setForm(emptyProfile()); setDraft(null); }}><FaPlus /> Nuevo empleado</button>
            </header>

            <div className="em-month-row">{monthPicker}</div>

            <div className="pg-summary">
                <div className="pg-stat"><span>Activos</span><strong>{active.length}</strong><small>{inactive.length} inactivos</small></div>
                <div className="pg-stat"><span>Horas trabajadas</span><strong>{hoursText(totals.worked)}</strong><small>de {hoursText(totals.expected)} según horario</small></div>
                <div className="pg-stat"><span>Costo por mes</span><strong>{fmt(totals.cost)}</strong><small>según horario y paga</small></div>
                {canPagos && <div className="pg-stat good"><span>Pagado este mes</span><strong>{fmt(totals.paid)}</strong><small>desde Pagos</small></div>}
            </div>

            {pendingLegacy > 0 && (
                <div className="em-alert warn">{pendingLegacy} {pendingLegacy === 1 ? 'empleado viene' : 'empleados vienen'} del registro anterior con su valor hora viejo. Abrilos para completar el perfil y guardarlos.</div>
            )}

            {loading && <div className="pg-empty">Cargando…</div>}
            {!loading && employees.length === 0 && (
                <div className="pg-empty">
                    <div className="pg-empty-icon">👥</div>
                    <strong>Todavía no hay empleados</strong>
                    <button className="pg-new" onClick={() => { setForm(emptyProfile()); setDraft(null); }}><FaPlus /> Nuevo empleado</button>
                </div>
            )}

            <div className="em-grid">{active.map(renderCard)}</div>

            {inactive.length > 0 && (
                <>
                    <button className="em-toggle" onClick={() => setShowInactive(v => !v)}>
                        <FaUserSlash /> {showInactive ? 'Ocultar' : 'Ver'} inactivos ({inactive.length})
                    </button>
                    {showInactive && <div className="em-grid">{inactive.map(renderCard)}</div>}
                </>
            )}

            {f && fc && fh && (
                <div className="pg-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setForm(null); }}>
                    <form className="pg-modal em-modal" onSubmit={save}>
                        <div className="pg-modal-head">
                            <h3>{f.id ? f.name || 'Empleado' : 'Nuevo empleado'}</h3>
                            <button type="button" className="pg-close" aria-label="Cerrar" onClick={() => setForm(null)}><FaTimes /></button>
                        </div>

                        <section className="em-sec">
                            <div className="em-sec-head">
                                <h4><FaClock /> Horas trabajadas</h4>
                                {monthPicker}
                            </div>
                            {!isSaved ? (
                                <small className="pg-hint">Guardá el empleado para empezar a anotar sus horas.</small>
                            ) : (
                                <>
                                    <div className="em-hours-sum">
                                        <div><span>Trabajó</span><b>{hoursText(fh.worked)}</b><small>{fh.daysWorked} {fh.daysWorked === 1 ? 'día' : 'días'}</small></div>
                                        <div><span>Según horario</span><b>{hoursText(fh.expected)}</b><small>{fh.expectedDays} días</small></div>
                                        <div className={fh.worked - fh.expected < 0 ? 'neg' : 'pos'}><span>Diferencia</span><b>{fh.worked - fh.expected >= 0 ? '+' : ''}{hoursText(fh.worked - fh.expected)}</b></div>
                                        {fh.toPay !== null && <div><span>Corresponde pagar</span><b>{fmt(fh.toPay)}</b><small>{f.payMode === 'hour' ? 'por las horas' : 'por los días'}</small></div>}
                                    </div>

                                    {draft && (
                                        <div className="em-hours-add">
                                            <input type="date" value={draft.date} max={today}
                                                onChange={e => setDraft(e.target.value ? { ...newDraft(f, e.target.value), note: draft.note } : draft)} aria-label="Día" />
                                            {f.hoursMode === 'times' ? (
                                                <>
                                                    <input type="time" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} aria-label="Entrada" />
                                                    <span>a</span>
                                                    <input type="time" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} aria-label="Salida" />
                                                    <em>{hoursText(shiftHours(draft))}</em>
                                                </>
                                            ) : (
                                                <label className="em-hours-qty">
                                                    <input type="number" min={0} max={24} step="0.5" value={draft.hours} onChange={e => setDraft({ ...draft, hours: e.target.value })} aria-label="Horas trabajadas" />
                                                    <span>horas</span>
                                                </label>
                                            )}
                                            <input className="em-hours-note" value={draft.note} placeholder="Nota (opcional)" onChange={e => setDraft({ ...draft, note: e.target.value })}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHours(); } }} />
                                            <button type="button" className="em-hours-btn" disabled={addingHours} onClick={addHours}><FaPlus /> Anotar</button>
                                        </div>
                                    )}

                                    {fh.list.length === 0 ? (
                                        <small className="pg-hint">No hay horas anotadas en {monthLabel(month).toLowerCase()}.</small>
                                    ) : (
                                        <ul className="em-hours-list">
                                            {[...fh.list].sort((a, b) => b.date.localeCompare(a.date) || (b.from || '').localeCompare(a.from || '')).map(entry => (
                                                <li key={entry.id}>
                                                    <b>{dayLabel(entry.date)}</b>
                                                    {entry.from && entry.to && <span>{entry.from} a {entry.to}</span>}
                                                    <em>{hoursText(entry.hours)}</em>
                                                    {entry.note && <small>{entry.note}</small>}
                                                    <button type="button" aria-label="Borrar" onClick={() => removeHours(entry)}><FaTrash /></button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            )}
                        </section>

                        <section className="em-sec">
                            <h4>Datos</h4>
                            <label className="pg-field">Nombre y apellido
                                <input required autoFocus={!f.id} value={f.name} onChange={e => setF({ name: e.target.value })} />
                            </label>
                            <div className="pg-row">
                                <label className="pg-field">Teléfono
                                    <input type="tel" value={f.phone || ''} onChange={e => setF({ phone: e.target.value })} />
                                </label>
                                <label className="pg-field">Fecha de ingreso
                                    <input type="date" value={f.startDate || ''} onChange={e => setF({ startDate: e.target.value })} />
                                </label>
                            </div>
                            <label className="pg-field">Contacto de emergencia
                                <input value={f.emergencyContact || ''} placeholder="Nombre y teléfono" onChange={e => setF({ emergencyContact: e.target.value })} />
                            </label>
                            <label className="pg-switch">
                                <input type="checkbox" checked={f.active} onChange={e => setF({ active: e.target.checked })} />
                                <span><b>Activo</b><small>Si deja de trabajar, destildalo: se conserva su historial.</small></span>
                            </label>
                        </section>

                        <section className="em-sec">
                            <h4>Días y horas que trabaja</h4>
                            <div className="pg-chips pick pg-days">
                                {WEEK_DAYS.map(({ day, label }) => (
                                    <button type="button" key={day} className={f.schedule[String(day)] ? 'active' : ''} onClick={() => toggleDay(day)}>{label}</button>
                                ))}
                            </div>
                            {fc.days.length === 0 && <small className="pg-hint">Marcá los días que trabaja.</small>}
                            <div className="pg-chips pick">
                                <button type="button" className={f.hoursMode !== 'times' ? 'active' : ''} onClick={() => setF({ hoursMode: 'perDay' })}>Horas por día</button>
                                <button type="button" className={f.hoursMode === 'times' ? 'active' : ''} onClick={() => setF({ hoursMode: 'times' })}>Entrada y salida de cada día</button>
                            </div>
                            {f.hoursMode !== 'times' && (
                                <div className="em-daily">
                                    <label className="pg-field em-short">Horas por día
                                        <input type="number" min={0} max={24} step="0.5" value={f.dailyHours || ''} onChange={e => setF({ dailyHours: Number(e.target.value) || 0 })} />
                                    </label>
                                    <div className="pg-chips pick">
                                        {[4, 6, 8, 10].map(h => (
                                            <button type="button" key={h} className={Number(f.dailyHours) === h ? 'active' : ''} onClick={() => setF({ dailyHours: h })}>{h} h</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {f.hoursMode === 'times' && WEEK_DAYS.filter(w => f.schedule[String(w.day)]).map(({ day, label }, i) => {
                                const s = f.schedule[String(day)];
                                return (
                                    <div key={day} className="em-shift">
                                        <b>{label}</b>
                                        <input type="time" value={s.from} onChange={e => setShift(day, { from: e.target.value })} aria-label={`${label} entrada`} />
                                        <span>a</span>
                                        <input type="time" value={s.to} onChange={e => setShift(day, { to: e.target.value })} aria-label={`${label} salida`} />
                                        <em>{hoursText(shiftHours(s))}</em>
                                        {i === 0 && workDaysOf(f).length > 1 && (
                                            <button type="button" className="em-link" onClick={() => copyShiftToAll(day)}>Copiar este horario a todos</button>
                                        )}
                                    </div>
                                );
                            })}
                            {fc.days.length > 0 && (
                                <small className="pg-hint">{hoursText(fc.weeklyHours)} por semana · ≈ {hoursText(fc.monthlyHours)} y {(Math.round(fc.daysPerMonth * 10) / 10).toLocaleString('es-AR')} días por mes.</small>
                            )}
                        </section>

                        <section className="em-sec">
                            <h4>Dónde trabaja</h4>
                            <div className="pg-chips pick">
                                {AREAS.map(a => (
                                    <button type="button" key={a.key} className={f.areas.some(x => x.area === a.key) ? 'active' : ''} onClick={() => toggleArea(a.key)}>
                                        {a.emoji} {a.label}
                                    </button>
                                ))}
                            </div>
                            {f.areas.length > 1 && (
                                <div className="em-percents">
                                    {f.areas.map((a, i) => (
                                        <label key={a.area} className="pg-field">{areaOf(a.area).label}
                                            <div className="em-inline">
                                                <input type="number" min={0} max={100} value={a.percent}
                                                    onChange={e => setF({ areas: f.areas.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) || 0 } : x)) })} />
                                                <span>%</span>
                                            </div>
                                        </label>
                                    ))}
                                    <small className={`pg-hint ${areaSum !== 100 ? 'em-warn-text' : ''}`}>Suma {areaSum}% {areaSum !== 100 && '— debería dar 100%'}</small>
                                </div>
                            )}
                        </section>

                        <section className="em-sec">
                            <h4>Cómo se le paga</h4>
                            <div className="pg-chips pick">
                                {PAY_MODES.map(m => (
                                    <button type="button" key={m.key} className={f.payMode === m.key ? 'active' : ''} onClick={() => setF({ payMode: m.key })}>{m.label}</button>
                                ))}
                            </div>
                            <label className="pg-field">Monto {PAY_MODES.find(m => m.key === f.payMode)?.unit}
                                <input type="number" min={0} value={f.payAmount || ''} onChange={e => setF({ payAmount: Number(e.target.value) || 0 })} />
                            </label>
                            <div className="pg-field">Se le paga
                                <div className="pg-chips pick">
                                    {FREQUENCIES.map(fr => (
                                        <button type="button" key={fr.key} className={f.payFrequency === fr.key ? 'active' : ''} onClick={() => setF({ payFrequency: fr.key })}>{fr.label}</button>
                                    ))}
                                </div>
                            </div>
                            {f.payFrequency === 'weekly' && (
                                <div className="pg-field">Día de pago
                                    <div className="pg-chips pick pg-days">
                                        {WEEK_DAYS.map(({ day, label }) => (
                                            <button type="button" key={day} className={(f.payWeekDay ?? 6) === day ? 'active' : ''} onClick={() => setF({ payWeekDay: day })}>{label}</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {f.payFrequency === 'monthly' && (
                                <label className="pg-field em-short">Día del mes
                                    <input type="number" min={1} max={31} value={f.payMonthDay || ''} onChange={e => setF({ payMonthDay: Number(e.target.value) || undefined })} />
                                </label>
                            )}
                            {canPagos && <label className="pg-switch">
                                <input type="checkbox" checked={f.syncPago} onChange={e => setF({ syncPago: e.target.checked })} />
                                <span>
                                    <b>Crear y mantener su pago en Pagos</b>
                                    <small>{plan
                                        ? `Al guardar: ${fmt(plan.amount)} ${plan.label}, como Sueldo. Si ya tiene un pago pendiente, se le actualiza el monto.`
                                        : 'Cargá el monto y el horario para calcular el pago.'}</small>
                                </span>
                            </label>}
                        </section>

                        <section className="em-sec">
                            <h4>Notas</h4>
                            <textarea className="em-notes" rows={2} value={f.notes || ''} onChange={e => setF({ notes: e.target.value })} placeholder="Lo que quieras recordar" />
                        </section>

                        <section className="em-calc">
                            <h4>Cuánto cuesta por mes</h4>
                            <div className="em-calc-total"><span>Según horario y paga</span><b>{fmt(fc.monthlyPay)}</b></div>
                            {fc.hourly > 0 && <div><span>Por hora trabajada</span><b>{fmt(fc.hourly)}</b></div>}
                            {fc.hourly > 0 && productionShare > 0 && laborRate && (
                                <p className={`em-compare ${Math.abs(fc.hourly - laborRate.perHour) / laborRate.perHour > 0.1 ? 'warn' : 'ok'}`}>
                                    Las recetas usan <b>{fmt(laborRate.perHour)}</b> la hora ("{laborRate.name}").{' '}
                                    {fc.hourly > laborRate.perHour * 1.1
                                        ? 'Este empleado cuesta más: tus productos quedan con la mano de obra baja.'
                                        : fc.hourly < laborRate.perHour * 0.9
                                            ? 'Este empleado cuesta menos que lo que cargan las recetas.'
                                            : 'Coincide con lo que cargan las recetas.'}
                                </p>
                            )}
                            {f.areas.length > 0 && fc.monthlyPay > 0 && (
                                <p className="em-split">
                                    {productionShare > 0 && <>Producción ({productionShare}%): {fmt(fc.monthlyPay * productionShare / 100)} — entra en el costo por "Tiempo panadero". </>}
                                    {productionShare < 100 && <>Resto ({100 - productionShare}%): {fmt(fc.monthlyPay * (100 - productionShare) / 100)} — va en Gastos Fijos → Estructura.</>}
                                </p>
                            )}
                        </section>

                        <div className="pg-modal-foot">
                            {isSaved && (
                                <button type="button" className="pg-delete" onClick={remove}>Eliminar</button>
                            )}
                            <button type="submit" className="pg-save" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                        </div>
                        {f.phone && <a className="em-call" href={`tel:${f.phone}`}><FaPhone /> Llamar</a>}
                    </form>
                </div>
            )}
        </div>
    );
}
