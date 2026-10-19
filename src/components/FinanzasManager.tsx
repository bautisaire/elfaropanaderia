import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import {
    collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy,
    serverTimestamp, Timestamp
} from 'firebase/firestore';
import { FaChartLine, FaLock, FaTrash, FaCheck } from 'react-icons/fa';
import { useCart } from '../context/CartContext';
import SueldosPanel from './SueldosPanel';
import './FinanzasManager.css';

type Tab = 'panel' | 'cierre' | 'fondos' | 'sueldos' | 'calendario';
type Horizon = 7 | 15 | 30;
type MovKind = 'adelanto' | 'retiro_personal' | 'deposito_banco' | 'extraccion_banco';
type FundKey = 'materia_prima' | 'sueldos' | 'servicios' | 'impuestos' | 'reserva';
type PayableCategory = FundKey | 'otro';

interface FinConfig {
    openingCash: number;
    openingBank: number;
    openingDate: string;
    fundPct: Record<FundKey, number>;
}

interface Closing {
    id: string; // yyyy-mm-dd
    ventasEfectivo: number;
    ventasDigital: number;
    egresosEfectivo: number;
    egresosBanco: number;
    retirosEfectivo: number;
    retirosBanco: number;
    expectedCash: number;
    expectedBank: number;
    efectivoContado: number;
    saldoBanco: number;
    diffCash: number;
    diffBank: number;
    diffResolved?: boolean;
    notes?: string;
    closedByEmail?: string;
}

interface FinMovement {
    id: string;
    kind: MovKind;
    person?: string;
    amount: number;
    method: 'Efectivo' | 'Banco';
    note?: string;
    dateKey: string;
}

interface Payable {
    id: string;
    title: string;
    amount: number;
    dueDate: string; // yyyy-mm-dd
    category: PayableCategory;
    status: 'pending' | 'paid';
}

const DEFAULT_CONFIG: FinConfig = {
    openingCash: 0,
    openingBank: 0,
    openingDate: '',
    fundPct: { materia_prima: 35, sueldos: 30, servicios: 15, impuestos: 10, reserva: 10 }
};

const FUND_LABELS: Record<FundKey, string> = {
    materia_prima: 'Materia prima',
    sueldos: 'Sueldos familiares',
    servicios: 'Servicios y gastos fijos',
    impuestos: 'Impuestos y obligaciones',
    reserva: 'Reserva / utilidad'
};

const KIND_LABELS: Record<MovKind, string> = {
    adelanto: 'Adelanto de sueldo',
    retiro_personal: 'Retiro personal (no es costo)',
    deposito_banco: 'Depósito caja → banco (no es gasto)',
    extraccion_banco: 'Extracción banco → caja (no es gasto)'
};

const AR_TZ = 'America/Argentina/Buenos_Aires';
const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (key: string, n: number) => {
    const d = new Date(`${key}T12:00:00-03:00`);
    d.setDate(d.getDate() + n);
    return dayKey(d);
};
const toDate = (v: any): Date | null => {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};
const fmt = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-AR')}`;
const num = (s: string) => Number(String(s).replace(',', '.')) || 0;
const isCash = (m?: string) => !m || m === 'Efectivo';

export default function FinanzasManager() {
    const { user, isSuperAdmin } = useCart();
    const [tab, setTab] = useState<Tab>('panel');
    const [horizon, setHorizon] = useState<Horizon>(30);

    const [config, setConfig] = useState<FinConfig>(DEFAULT_CONFIG);
    const [closings, setClosings] = useState<Closing[]>([]);
    const [movs, setMovs] = useState<FinMovement[]>([]);
    const [payables, setPayables] = useState<Payable[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [cajaMovs, setCajaMovs] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [timeEntries, setTimeEntries] = useState<any[]>([]);

    const today = dayKey(new Date());
    const monthKey = today.slice(0, 7);
    const since = useMemo(() => new Date(Date.now() - 70 * 24 * 3600 * 1000), []);

    useEffect(() => {
        if (!isSuperAdmin) return;
        const err = (n: string) => (e: unknown) => console.error(`Finanzas: error cargando ${n}`, e);
        const unsubs = [
            onSnapshot(doc(db, 'finance_config', 'main'), s => {
                const d: any = s.data();
                setConfig(d ? { ...DEFAULT_CONFIG, ...d, fundPct: { ...DEFAULT_CONFIG.fundPct, ...(d.fundPct || {}) } } : DEFAULT_CONFIG);
            }, err('config')),
            onSnapshot(query(collection(db, 'finance_closings'), orderBy('dateKey', 'desc')), s =>
                setClosings(s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Closing))), err('cierres')),
            onSnapshot(query(collection(db, 'finance_movements'), orderBy('dateKey', 'desc')), s =>
                setMovs(s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as FinMovement))), err('movimientos')),
            onSnapshot(collection(db, 'finance_payables'), s =>
                setPayables(s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Payable))), err('pagos')),
            onSnapshot(collection(db, 'orders'), s => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() }))), err('pedidos')),
            onSnapshot(query(collection(db, 'caja_movements'), where('date', '>=', Timestamp.fromDate(since)), orderBy('date', 'desc')),
                s => setCajaMovs(s.docs.map(d => ({ id: d.id, ...d.data() }))), err('caja')),
            onSnapshot(query(collection(db, 'expenses'), where('date', '>=', Timestamp.fromDate(since)), orderBy('date', 'desc')),
                s => setExpenses(s.docs.map(d => ({ id: d.id, ...d.data() }))), err('gastos')),
            onSnapshot(collection(db, 'employees'), s => setEmployees(s.docs.map(d => ({ id: d.id, ...d.data() }))), err('empleados')),
            onSnapshot(collection(db, 'time_entries'), s => setTimeEntries(s.docs.map(d => ({ id: d.id, ...d.data() }))), err('fichajes')),
        ];
        return () => unsubs.forEach(u => u());
    }, [isSuperAdmin, since]);

    // ---- Ventas unificadas (misma lógica que Caja: movimientos de caja + pedidos no cubiertos) ----
    const sales = useMemo(() => {
        const list: { dateKey: string; amount: number; cash: boolean }[] = [];
        const covered = new Set<string>();
        cajaMovs.forEach(m => {
            if (m.type !== 'venta') return;
            const d = toDate(m.date);
            if (!d) return;
            if (m.orderId) covered.add(m.orderId);
            list.push({ dateKey: dayKey(d), amount: Number(m.amount) || 0, cash: isCash(m.paymentMethod) });
        });
        orders.forEach(o => {
            if (o.status === 'cancelado' || o.isTestOrder || covered.has(o.id)) return;
            const d = toDate(o.date);
            if (!d || d < since) return;
            list.push({ dateKey: dayKey(d), amount: Number(o.total) || 0, cash: isCash(o.cliente?.metodoPago) });
        });
        return list;
    }, [cajaMovs, orders, since]);

    const classifyExpense = (e: any): FundKey | 'otro' => {
        const desc = String(e.description || '');
        if (/^Pago Sueldo/i.test(desc)) return 'sueldos';
        if (/impuesto|afip|arca|monotributo/i.test(desc)) return 'impuestos';
        if (e.type === 'materia_prima') return 'materia_prima';
        if (e.type === 'servicio') return 'servicios';
        return 'otro';
    };

    const computeDay = (key: string) => {
        let vEf = 0, vDig = 0, eEf = 0, eBk = 0;
        sales.filter(s => s.dateKey === key).forEach(s => (s.cash ? (vEf += s.amount) : (vDig += s.amount)));
        cajaMovs.forEach(m => {
            if (m.type !== 'egreso') return;
            const d = toDate(m.date);
            if (!d || dayKey(d) !== key) return;
            if (isCash(m.paymentMethod)) eEf += Number(m.amount) || 0; else eBk += Number(m.amount) || 0;
        });
        expenses.forEach(e => {
            const d = toDate(e.date);
            if (!d || dayKey(d) !== key || e.description === 'Egreso desde Caja') return; // ya está en caja_movements
            if (isCash(e.paymentMethod)) eEf += Number(e.totalAmount) || 0; else eBk += Number(e.totalAmount) || 0;
        });
        const dm = movs.filter(m => m.dateKey === key);
        const sum = (kinds: MovKind[], method?: string) =>
            dm.filter(m => kinds.includes(m.kind) && (!method || m.method === method)).reduce((s, m) => s + m.amount, 0);
        return {
            vEf, vDig, eEf, eBk,
            rEf: sum(['adelanto', 'retiro_personal'], 'Efectivo'),
            rBk: sum(['adelanto', 'retiro_personal'], 'Banco'),
            dep: sum(['deposito_banco']),
            ext: sum(['extraccion_banco'])
        };
    };

    const lastClosing = closings[0];
    const hasBaseline = !!lastClosing || !!config.openingDate;
    const realCash = lastClosing ? lastClosing.efectivoContado : config.openingCash;
    const realBank = lastClosing ? lastClosing.saldoBanco : config.openingBank;
    const realMoney = realCash + realBank;

    // ---- Resultado económico del mes ----
    const monthResult = useMemo(() => {
        const ventas = sales.filter(s => s.dateKey.startsWith(monthKey)).reduce((s, x) => s + x.amount, 0);
        const spent: Record<string, number> = { materia_prima: 0, sueldos: 0, servicios: 0, impuestos: 0, otro: 0 };
        expenses.forEach(e => {
            const d = toDate(e.date);
            if (!d || !dayKey(d).startsWith(monthKey)) return;
            spent[classifyExpense(e)] += Number(e.totalAmount) || 0;
        });
        movs.filter(m => m.kind === 'adelanto' && m.dateKey.startsWith(monthKey)).forEach(m => (spent.sueldos += m.amount));
        const costos = Object.values(spent).reduce((s, x) => s + x, 0);
        const retirosPersonales = movs.filter(m => m.kind === 'retiro_personal' && m.dateKey.startsWith(monthKey)).reduce((s, m) => s + m.amount, 0);
        return { ventas, spent, costos, ganancia: ventas - costos, retirosPersonales };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sales, expenses, movs, monthKey]);

    // ---- Calendario / proyecciones ----
    const pending = useMemo(() => payables.filter(p => p.status === 'pending').sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [payables]);
    const dueWithin = (days: number) => pending.filter(p => p.dueDate <= addDays(today, days));
    const sumP = (l: Payable[]) => l.reduce((s, p) => s + p.amount, 0);

    const avgDailySales = useMemo(() => {
        const from = addDays(today, -14);
        return sales.filter(s => s.dateKey >= from && s.dateKey < today).reduce((s, x) => s + x.amount, 0) / 14;
    }, [sales, today]);

    const fundsBalance = useMemo(() => {
        const out = {} as Record<FundKey, { assigned: number; spent: number; balance: number }>;
        (Object.keys(FUND_LABELS) as FundKey[]).forEach(k => {
            const assigned = monthResult.ventas * (config.fundPct[k] || 0) / 100;
            const spent = k === 'reserva' ? 0 : (monthResult.spent[k] || 0);
            out[k] = { assigned, spent, balance: assigned - spent };
        });
        return out;
    }, [monthResult, config.fundPct]);

    const committed = sumP(dueWithin(horizon));
    const sueldosPendientes = sumP(dueWithin(horizon).filter(p => p.category === 'sueldos'));
    const sueldosReservados = Math.max(0, fundsBalance.sueldos.balance - sueldosPendientes);
    const libre = realMoney - committed - sueldosReservados;

    const last7Keys = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
    const closedLast7 = last7Keys.filter(k => closings.some(c => c.id === k)).length;
    const unresolved = closings.filter(c => c.id >= addDays(today, -30) && !c.diffResolved && (Math.abs(c.diffCash) > 0 || Math.abs(c.diffBank) > 0));
    const diffTotal = unresolved.reduce((s, c) => s + Math.abs(c.diffCash) + Math.abs(c.diffBank), 0);

    const fixedMonthly = useMemo(() => {
        const from = addDays(today, -30);
        let t = 0;
        expenses.forEach(e => {
            const d = toDate(e.date);
            if (!d || dayKey(d) < from) return;
            if (classifyExpense(e) !== 'materia_prima') t += Number(e.totalAmount) || 0;
        });
        movs.filter(m => m.kind === 'adelanto' && m.dateKey >= from).forEach(m => (t += m.amount));
        return t;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenses, movs, today]);
    const coverageDays = fixedMonthly > 0 ? Math.floor(realMoney / (fixedMonthly / 30)) : null;

    const [purchase, setPurchase] = useState('');
    const purchaseNum = num(purchase);

    // ---- Persistencia ----
    const saveConfig = async (patch: Partial<FinConfig>) => {
        try {
            await setDoc(doc(db, 'finance_config', 'main'), { ...config, ...patch }, { merge: true });
        } catch (e) { console.error(e); alert('No se pudo guardar la configuración.'); }
    };

    // ---- Cierre diario ----
    const [closeDate, setCloseDate] = useState(today);
    const [ov, setOv] = useState<Record<string, string>>({});
    const [closeNotes, setCloseNotes] = useState('');
    const [savingClose, setSavingClose] = useState(false);
    useEffect(() => { setOv({}); setCloseNotes(closings.find(c => c.id === closeDate)?.notes || ''); }, [closeDate]); // eslint-disable-line react-hooks/exhaustive-deps

    const day = useMemo(() => computeDay(closeDate), [closeDate, sales, cajaMovs, expenses, movs]); // eslint-disable-line react-hooks/exhaustive-deps
    const prev = closings.find(c => c.id < closeDate);
    const prevCash = prev ? prev.efectivoContado : config.openingCash;
    const prevBank = prev ? prev.saldoBanco : config.openingBank;
    const existing = closings.find(c => c.id === closeDate);
    const f = (k: string, computed: number) => (ov[k] ?? String(Math.round(computed)));
    const vEf = num(f('vEf', day.vEf)), vDig = num(f('vDig', day.vDig)), eEf = num(f('eEf', day.eEf)), eBk = num(f('eBk', day.eBk));
    const expectedCash = prevCash + vEf - eEf - day.rEf - day.dep + day.ext;
    const expectedBank = prevBank + vDig - eBk - day.rBk + day.dep - day.ext;
    const counted = ov.counted ?? (existing ? String(existing.efectivoContado) : '');
    const bankBal = ov.bank ?? (existing ? String(existing.saldoBanco) : '');
    const diffCash = counted === '' ? 0 : num(counted) - expectedCash;
    const diffBank = bankBal === '' ? 0 : num(bankBal) - expectedBank;

    const handleClose = async () => {
        if (counted === '' || bankBal === '') { alert('Cargá el efectivo contado y el saldo del banco.'); return; }
        if (!hasBaseline && !window.confirm('Todavía no definiste un punto de partida (Fondos → Punto de partida). Las diferencias de este primer cierre no serán confiables. ¿Cerrar igual?')) return;
        setSavingClose(true);
        try {
            await setDoc(doc(db, 'finance_closings', closeDate), {
                dateKey: closeDate,
                ventasEfectivo: vEf, ventasDigital: vDig, egresosEfectivo: eEf, egresosBanco: eBk,
                retirosEfectivo: day.rEf, retirosBanco: day.rBk,
                expectedCash, expectedBank,
                efectivoContado: num(counted), saldoBanco: num(bankBal),
                diffCash, diffBank, diffResolved: false,
                notes: closeNotes.trim(), closedByEmail: user?.email || 'admin', closedAt: serverTimestamp()
            });
            alert('Cierre guardado.');
        } catch (e) { console.error(e); alert('Error al guardar el cierre.'); }
        finally { setSavingClose(false); }
    };

    // ---- Retiros / adelantos ----
    const [mKind, setMKind] = useState<MovKind>('adelanto');
    const [mPerson, setMPerson] = useState('');
    const [mAmount, setMAmount] = useState('');
    const [mMethod, setMMethod] = useState<'Efectivo' | 'Banco'>('Efectivo');
    const [mNote, setMNote] = useState('');
    const addMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (num(mAmount) <= 0) return;
        if ((mKind === 'adelanto' || mKind === 'retiro_personal') && !mPerson.trim()) { alert('Indicá la persona.'); return; }
        try {
            await addDoc(collection(db, 'finance_movements'), {
                kind: mKind, person: mPerson.trim(), amount: num(mAmount),
                method: mKind === 'deposito_banco' || mKind === 'extraccion_banco' ? 'Efectivo' : mMethod,
                note: mNote.trim(), dateKey: today, createdAt: serverTimestamp(), createdByEmail: user?.email || 'admin'
            });
            setMAmount(''); setMNote('');
        } catch (err) { console.error(err); alert('Error al registrar el movimiento.'); }
    };
    const delMovement = async (id: string) => {
        if (window.confirm('¿Eliminar este registro?')) await deleteDoc(doc(db, 'finance_movements', id));
    };

    // ---- Calendario ----
    const [pTitle, setPTitle] = useState('');
    const [pAmount, setPAmount] = useState('');
    const [pDate, setPDate] = useState(addDays(today, 3));
    const [pCat, setPCat] = useState<PayableCategory>('materia_prima');
    const addPayable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pTitle.trim() || num(pAmount) <= 0) return;
        try {
            await addDoc(collection(db, 'finance_payables'), {
                title: pTitle.trim(), amount: num(pAmount), dueDate: pDate, category: pCat, status: 'pending', createdAt: serverTimestamp()
            });
            setPTitle(''); setPAmount('');
        } catch (err) { console.error(err); alert('Error al guardar el pago.'); }
    };
    const markPaid = async (p: Payable) => {
        const reg = window.confirm(`¿Marcar "${p.title}" como pagado?\n\nAceptar = pagado y registrarlo también en Gastos (efectivo).\nSi ya lo cargaste en Gastos, cancelá y usá "Pagado (sin gasto)".`);
        if (!reg) return;
        try {
            await updateDoc(doc(db, 'finance_payables', p.id), { status: 'paid', paidAt: serverTimestamp() });
            await addDoc(collection(db, 'expenses'), {
                description: p.category === 'sueldos' ? `Pago Sueldo: ${p.title}` : p.title,
                totalAmount: p.amount, date: Timestamp.now(),
                type: p.category === 'materia_prima' ? 'materia_prima' : p.category === 'servicios' ? 'servicio' : 'otro',
                createdByEmail: user?.email || 'admin'
            });
        } catch (err) { console.error(err); alert('Error al marcar como pagado.'); }
    };
    const markPaidNoExpense = async (p: Payable) => {
        await updateDoc(doc(db, 'finance_payables', p.id), { status: 'paid', paidAt: serverTimestamp() });
    };

    if (!isSuperAdmin) {
        return <div className="fin-container"><p>Esta sección es solo para el administrador principal.</p></div>;
    }

    const projection = (days: number) => {
        const ingresos = avgDailySales * days;
        const pagos = sumP(dueWithin(days));
        return { ingresos, pagos, saldo: realMoney + ingresos - pagos };
    };

    const Kpi = ({ label, value, tone, hint }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn'; hint?: string }) => (
        <div className={`fin-kpi ${tone || ''}`}>
            <span className="fin-kpi-label">{label}</span>
            <strong>{value}</strong>
            {hint && <small>{hint}</small>}
        </div>
    );

    const costRows: [string, number][] = [
        ['Materia prima (compras del mes)', monthResult.spent.materia_prima],
        ['Servicios y gastos fijos', monthResult.spent.servicios],
        ['Sueldos y adelantos', monthResult.spent.sueldos],
        ['Impuestos y obligaciones', monthResult.spent.impuestos],
        ['Otros gastos operativos', monthResult.spent.otro]
    ];

    return (
        <div className="fin-container">
            <div className="fin-header">
                <h2><FaChartLine /> Finanzas <span className="fin-badge"><FaLock /> Solo admin</span></h2>
                <p className="fin-sub">Resultado económico (cuánto gana la panadería) y flujo de caja (cuánta plata hay y cuánta está libre) son cosas distintas.</p>
            </div>

            <div className="fin-tabs">
                {([['panel', 'Panel'], ['cierre', 'Cierre diario'], ['fondos', 'Fondos'], ['sueldos', 'Sueldos y retiros'], ['calendario', 'Calendario de pagos']] as [Tab, string][]).map(([k, l]) => (
                    <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
                ))}
            </div>

            {tab === 'panel' && (
                <>
                    {!hasBaseline && (
                        <div className="fin-alert warn">Primero definí el punto de partida: en <b>Fondos → Punto de partida</b> cargá el efectivo contado y el saldo del banco de hoy. Sin eso, los indicadores de dinero no son reales.</div>
                    )}
                    <h3 className="fin-h">Flujo de caja — ¿cuánta plata hay?</h3>
                    <div className="fin-grid">
                        <Kpi label="Dinero real (caja + banco)" value={fmt(realMoney)} hint={`Efectivo ${fmt(realCash)} · Banco ${fmt(realBank)}${lastClosing ? ` · al ${lastClosing.id}` : ''}`} />
                        <Kpi label={`Pagos próximos ${horizon} días`} value={fmt(committed)} tone={committed > realMoney ? 'bad' : undefined} />
                        <Kpi label="Sueldos reservados" value={fmt(sueldosReservados)} hint="Fondo de sueldos del mes sin gastar" />
                        <Kpi label="Disponible no comprometido" value={fmt(libre)} tone={libre < 0 ? 'bad' : 'good'} hint="Efectivo + bancos − pagos − reservas" />
                    </div>
                    <div className="fin-horizon">
                        Horizonte: {([7, 15, 30] as Horizon[]).map(h => <button key={h} className={horizon === h ? 'active' : ''} onClick={() => setHorizon(h)}>{h} días</button>)}
                    </div>

                    <div className="fin-grid">
                        <Kpi label="Cierres completados (7 días)" value={`${closedLast7} de 7`} tone={closedLast7 < 7 ? 'warn' : 'good'} />
                        <Kpi label="Diferencias por conciliar" value={fmt(diffTotal)} tone={diffTotal > 0 ? 'warn' : 'good'} hint={`${unresolved.length} cierre(s)`} />
                        <Kpi label="Cobertura de gastos fijos" value={coverageDays === null ? '—' : `${coverageDays} días`} hint="Dinero real ÷ gasto diario (sin materia prima)" />
                    </div>

                    <div className="fin-card">
                        <h4>¿Puedo hacer esta compra?</h4>
                        <input type="number" inputMode="decimal" placeholder="Monto ($)" value={purchase} onChange={e => setPurchase(e.target.value)} />
                        {purchaseNum > 0 && (
                            purchaseNum > libre
                                ? <div className="fin-alert bad">Esta compra de {fmt(purchaseNum)} deja el disponible en {fmt(libre - purchaseNum)}.{realMoney - purchaseNum < sueldosPendientes + sueldosReservados ? ' Pone en riesgo el pago de sueldos.' : ' Compromete pagos próximos.'}</div>
                                : <div className="fin-alert good">Alcanza: quedarían {fmt(libre - purchaseNum)} libres.</div>
                        )}
                    </div>

                    <h3 className="fin-h">Proyección de saldo</h3>
                    <div className="fin-grid">
                        {[7, 15, 30].map(d => {
                            const p = projection(d);
                            return <Kpi key={d} label={`En ${d} días`} value={fmt(p.saldo)} tone={p.saldo < 0 ? 'bad' : undefined}
                                hint={`+${fmt(p.ingresos)} ventas esperadas · −${fmt(p.pagos)} pagos`} />;
                        })}
                    </div>

                    <h3 className="fin-h">Resultado económico — ¿cuánto gana la panadería? ({monthKey})</h3>
                    <div className="fin-card">
                        <table className="fin-table">
                            <tbody>
                                <tr><td>Ventas</td><td className="r">{fmt(monthResult.ventas)}</td></tr>
                                {costRows.map(([l, v]) => <tr key={l}><td>{l}</td><td className="r neg">−{fmt(v)}</td></tr>)}
                                <tr className="total"><td>Ganancia estimada</td><td className={`r ${monthResult.ganancia < 0 ? 'neg' : 'pos'}`}>{fmt(monthResult.ganancia)}</td></tr>
                            </tbody>
                        </table>
                        <p className="fin-note">Retiros personales del mes: {fmt(monthResult.retirosPersonales)} (no se restan de la ganancia, pero sí de la caja). Las compras de materia prima se cuentan cuando se pagan, no cuando se consumen.</p>
                    </div>
                </>
            )}

            {tab === 'cierre' && (
                <div className="fin-card">
                    <h3>Cierre de caja diario</h3>
                    <label className="fin-field">Fecha<input type="date" value={closeDate} max={today} onChange={e => e.target.value && setCloseDate(e.target.value)} /></label>
                    {existing && <div className="fin-alert warn">Ya hay un cierre para esta fecha; guardar lo reemplaza.</div>}
                    <p className="fin-note">Los números se completan solos con Caja y Gastos; corregilos si no coinciden. Partimos de efectivo {fmt(prevCash)} y banco {fmt(prevBank)} del cierre anterior.</p>
                    <div className="fin-form-grid">
                        <label className="fin-field">Ventas en efectivo<input type="number" inputMode="decimal" value={f('vEf', day.vEf)} onChange={e => setOv({ ...ov, vEf: e.target.value })} /></label>
                        <label className="fin-field">Ventas transferencia / débito<input type="number" inputMode="decimal" value={f('vDig', day.vDig)} onChange={e => setOv({ ...ov, vDig: e.target.value })} /></label>
                        <label className="fin-field">Egresos pagados en efectivo<input type="number" inputMode="decimal" value={f('eEf', day.eEf)} onChange={e => setOv({ ...ov, eEf: e.target.value })} /></label>
                        <label className="fin-field">Egresos pagados por banco<input type="number" inputMode="decimal" value={f('eBk', day.eBk)} onChange={e => setOv({ ...ov, eBk: e.target.value })} /></label>
                    </div>
                    <p className="fin-note">Retiros/adelantos del día: efectivo {fmt(day.rEf)}, banco {fmt(day.rBk)} · Depósitos {fmt(day.dep)} · Extracciones {fmt(day.ext)} (se cargan en <b>Sueldos y retiros</b>).</p>
                    <div className="fin-form-grid">
                        <label className="fin-field strong">Efectivo contado al cierre<input type="number" inputMode="decimal" value={counted} onChange={e => setOv({ ...ov, counted: e.target.value })} /></label>
                        <label className="fin-field strong">Saldo cuenta bancaria<input type="number" inputMode="decimal" value={bankBal} onChange={e => setOv({ ...ov, bank: e.target.value })} /></label>
                    </div>
                    <table className="fin-table">
                        <tbody>
                            <tr><td>Efectivo que debería haber</td><td className="r">{fmt(expectedCash)}</td></tr>
                            <tr><td>Diferencia de efectivo</td><td className={`r ${diffCash === 0 ? '' : diffCash < 0 ? 'neg' : 'pos'}`}>{fmt(diffCash)}</td></tr>
                            <tr><td>Saldo bancario esperado</td><td className="r">{fmt(expectedBank)}</td></tr>
                            <tr><td>Diferencia bancaria</td><td className={`r ${diffBank === 0 ? '' : diffBank < 0 ? 'neg' : 'pos'}`}>{fmt(diffBank)}</td></tr>
                            <tr className="total"><td>Dinero total disponible</td><td className="r">{fmt(num(counted) + num(bankBal))}</td></tr>
                        </tbody>
                    </table>
                    <label className="fin-field">Notas<input type="text" value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Explicación de diferencias, etc." /></label>
                    <button className="fin-primary" disabled={savingClose} onClick={handleClose}>{savingClose ? 'Guardando…' : 'Guardar cierre'}</button>

                    <h4 style={{ marginTop: 24 }}>Historial de cierres</h4>
                    <div className="fin-scroll">
                        <table className="fin-table">
                            <thead><tr><th>Fecha</th><th className="r">Efectivo</th><th className="r">Banco</th><th className="r">Dif. caja</th><th className="r">Dif. banco</th><th /></tr></thead>
                            <tbody>
                                {closings.slice(0, 30).map(c => (
                                    <tr key={c.id}>
                                        <td>{c.id}</td><td className="r">{fmt(c.efectivoContado)}</td><td className="r">{fmt(c.saldoBanco)}</td>
                                        <td className={`r ${c.diffCash < 0 ? 'neg' : ''}`}>{fmt(c.diffCash)}</td>
                                        <td className={`r ${c.diffBank < 0 ? 'neg' : ''}`}>{fmt(c.diffBank)}</td>
                                        <td>{(c.diffCash !== 0 || c.diffBank !== 0) && (c.diffResolved
                                            ? <small>Conciliado</small>
                                            : <button className="fin-mini" onClick={() => updateDoc(doc(db, 'finance_closings', c.id), { diffResolved: true })}><FaCheck /> Conciliar</button>)}</td>
                                    </tr>
                                ))}
                                {closings.length === 0 && <tr><td colSpan={6}>Aún no hay cierres.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'fondos' && (
                <>
                    <div className="fin-card">
                        <h3>Punto de partida</h3>
                        <p className="fin-note">Contá todo el efectivo y consultá el banco hoy. Es la base real desde la que se calculan los cierres.</p>
                        <StartForm config={config} onSave={(c, b) => saveConfig({ openingCash: c, openingBank: b, openingDate: today })} />
                    </div>
                    <div className="fin-card">
                        <h3>Fondos separados por obligación</h3>
                        <p className="fin-note">Cada venta alimenta estos fondos de forma virtual (porcentajes editables; ajustalos a tus costos reales). El dinero de sueldos no se usa para materia prima ni gastos personales.</p>
                        <table className="fin-table">
                            <thead><tr><th>Fondo</th><th>%</th><th className="r">Asignado</th><th className="r">Gastado</th><th className="r">Saldo</th></tr></thead>
                            <tbody>
                                {(Object.keys(FUND_LABELS) as FundKey[]).map(k => (
                                    <tr key={k}>
                                        <td>{FUND_LABELS[k]}</td>
                                        <td><input className="fin-pct" type="number" value={config.fundPct[k]} onChange={e => setConfig({ ...config, fundPct: { ...config.fundPct, [k]: Number(e.target.value) } })} onBlur={() => saveConfig({ fundPct: config.fundPct })} /></td>
                                        <td className="r">{fmt(fundsBalance[k].assigned)}</td>
                                        <td className="r">{fmt(fundsBalance[k].spent)}</td>
                                        <td className={`r ${fundsBalance[k].balance < 0 ? 'neg' : 'pos'}`}>{fmt(fundsBalance[k].balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="fin-note">Total: {Object.values(config.fundPct).reduce((s, x) => s + (x || 0), 0)}% · Base: ventas de {monthKey} ({fmt(monthResult.ventas)}).</p>
                    </div>
                </>
            )}

            {tab === 'sueldos' && (
                <>
                    <SueldosPanel
                        employees={employees}
                        expenses={expenses}
                        movs={movs}
                        timeEntries={timeEntries}
                        monthKey={monthKey}
                        userEmail={user?.email || 'admin'}
                        dayKeyOf={v => { const d = toDate(v); return d ? dayKey(d) : null; }}
                        fmt={fmt}
                    />
                    <div className="fin-card">
                        <h3>Registrar adelanto, retiro o transferencia</h3>
                        <form onSubmit={addMovement} className="fin-form-grid">
                            <label className="fin-field">Tipo
                                <select value={mKind} onChange={e => setMKind(e.target.value as MovKind)}>
                                    {(Object.keys(KIND_LABELS) as MovKind[]).map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                                </select>
                            </label>
                            {(mKind === 'adelanto' || mKind === 'retiro_personal') && (
                                <label className="fin-field">Persona
                                    <input list="fin-people" value={mPerson} onChange={e => setMPerson(e.target.value)} />
                                    <datalist id="fin-people">{employees.map(e => <option key={e.id} value={e.name} />)}</datalist>
                                </label>
                            )}
                            <label className="fin-field">Monto<input type="number" inputMode="decimal" value={mAmount} onChange={e => setMAmount(e.target.value)} /></label>
                            {(mKind === 'adelanto' || mKind === 'retiro_personal') && (
                                <label className="fin-field">Salió de
                                    <select value={mMethod} onChange={e => setMMethod(e.target.value as 'Efectivo' | 'Banco')}><option>Efectivo</option><option>Banco</option></select>
                                </label>
                            )}
                            <label className="fin-field">Nota<input value={mNote} onChange={e => setMNote(e.target.value)} /></label>
                            <button className="fin-primary" type="submit">Registrar</button>
                        </form>
                        <p className="fin-note">Los adelantos cuentan como costo de sueldos. Los retiros personales y las transferencias entre caja y banco <b>no</b> son costo operativo.</p>
                    </div>
                    <div className="fin-card">
                        <h4>Últimos registros</h4>
                        <table className="fin-table">
                            <tbody>
                                {movs.slice(0, 30).map(m => (
                                    <tr key={m.id}><td>{m.dateKey}</td><td>{KIND_LABELS[m.kind]}{m.person ? ` · ${m.person}` : ''}{m.note ? ` (${m.note})` : ''}</td><td className="r">{fmt(m.amount)}</td>
                                        <td><button className="fin-mini" onClick={() => delMovement(m.id)}><FaTrash /></button></td></tr>
                                ))}
                                {movs.length === 0 && <tr><td>Sin registros.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {tab === 'calendario' && (
                <>
                    <div className="fin-card">
                        <h3>Próximas obligaciones</h3>
                        <table className="fin-table">
                            <tbody>
                                {pending.map(p => (
                                    <tr key={p.id} className={p.dueDate < today ? 'overdue' : ''}>
                                        <td>{p.dueDate.slice(8)}/{p.dueDate.slice(5, 7)}</td>
                                        <td>{p.title}<small> · {p.category === 'otro' ? 'Otro' : FUND_LABELS[p.category]}{p.dueDate < today ? ' · VENCIDO' : ''}</small></td>
                                        <td className="r">{fmt(p.amount)}</td>
                                        <td className="fin-actions">
                                            <button className="fin-mini" title="Pagado" onClick={() => markPaid(p)}><FaCheck /></button>
                                            <button className="fin-mini" title="Pagado (sin gasto)" onClick={() => markPaidNoExpense(p)}>sin gasto</button>
                                            <button className="fin-mini" title="Eliminar" onClick={() => window.confirm('¿Eliminar?') && deleteDoc(doc(db, 'finance_payables', p.id))}><FaTrash /></button>
                                        </td>
                                    </tr>
                                ))}
                                {pending.length === 0 && <tr><td>No hay pagos pendientes.</td></tr>}
                                <tr className="total"><td /><td>Total comprometido</td><td className="r">{fmt(sumP(pending))}</td><td /></tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="fin-card">
                        <h3>Agregar pago</h3>
                        <form onSubmit={addPayable} className="fin-form-grid">
                            <label className="fin-field">Concepto<input value={pTitle} onChange={e => setPTitle(e.target.value)} placeholder="Compra de harina" /></label>
                            <label className="fin-field">Monto<input type="number" inputMode="decimal" value={pAmount} onChange={e => setPAmount(e.target.value)} /></label>
                            <label className="fin-field">Vence<input type="date" value={pDate} onChange={e => setPDate(e.target.value)} /></label>
                            <label className="fin-field">Categoría
                                <select value={pCat} onChange={e => setPCat(e.target.value as PayableCategory)}>
                                    {(Object.keys(FUND_LABELS) as FundKey[]).map(k => <option key={k} value={k}>{FUND_LABELS[k]}</option>)}
                                    <option value="otro">Otro</option>
                                </select>
                            </label>
                            <button className="fin-primary" type="submit">Agregar</button>
                        </form>
                    </div>
                </>
            )}
        </div>
    );
}

function StartForm({ config, onSave }: { config: FinConfig; onSave: (cash: number, bank: number) => void }) {
    const [cash, setCash] = useState(config.openingDate ? String(config.openingCash) : '');
    const [bank, setBank] = useState(config.openingDate ? String(config.openingBank) : '');
    return (
        <div className="fin-form-grid">
            <label className="fin-field">Efectivo contado<input type="number" inputMode="decimal" value={cash} onChange={e => setCash(e.target.value)} /></label>
            <label className="fin-field">Saldo bancario<input type="number" inputMode="decimal" value={bank} onChange={e => setBank(e.target.value)} /></label>
            <button className="fin-primary" onClick={() => { if (cash === '' || bank === '') return; onSave(num(cash), num(bank)); }}>Guardar punto de partida</button>
            {config.openingDate && <small>Definido el {config.openingDate}</small>}
        </div>
    );
}
