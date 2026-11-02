import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, Timestamp
} from 'firebase/firestore';
import { FaTrash, FaEdit } from 'react-icons/fa';

type PaymentMode = 'daily' | 'monthly';
export interface PanelEmployee { id: string; name: string; hourlyRate?: number; monthlyHours?: number; active?: boolean; paymentMode?: PaymentMode; dailyRate?: number }
export interface PanelExpense { description?: string; totalAmount?: number; date?: unknown; employeeId?: string }
export interface PanelMovement { kind: string; person?: string; amount: number; dateKey: string }
interface OpenEntry { id: string; employeeId: string; status?: string; clockOut?: unknown; amountDue?: number }
interface RiderDebt { email: string; orders: { id: string }[]; extras: { id: string; description?: string; amount?: number }[]; total: number }

interface Props {
    employees: PanelEmployee[];
    expenses: PanelExpense[];
    movs: PanelMovement[];
    timeEntries: OpenEntry[];
    monthKey: string;
    userEmail: string;
    dayKeyOf: (v: unknown) => string | null;
    fmt: (n: number) => string;
}

const num = (s: string) => Number(String(s).replace(',', '.')) || 0;

export default function SueldosPanel({ employees, expenses, movs, timeEntries, monthKey, userEmail, dayKeyOf, fmt }: Props) {
    const [editing, setEditing] = useState<PanelEmployee | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [fName, setFName] = useState('');
    const [fRate, setFRate] = useState('');
    const [fHours, setFHours] = useState('');
    const [fMode, setFMode] = useState<PaymentMode>('daily');
    const [fDailyRate, setFDailyRate] = useState('');
    const [payFor, setPayFor] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payDays, setPayDays] = useState('1');
    const [savingPay, setSavingPay] = useState(false);
    const [payMethod, setPayMethod] = useState<'Efectivo' | 'Banco'>('Efectivo');
    const [riders, setRiders] = useState<string[]>([]);
    const [unpaidOrders, setUnpaidOrders] = useState<Record<string, unknown>[]>([]);
    const [unpaidExtras, setUnpaidExtras] = useState<Record<string, unknown>[]>([]);

    useEffect(() => {
        const unsubs = [
            onSnapshot(query(collection(db, 'admin_roles'), where('is_rider', '==', true)), s => setRiders(s.docs.map(d => d.id))),
            onSnapshot(query(collection(db, 'orders'), where('status', '==', 'entregado'), where('paidToRider', '==', false)),
                s => setUnpaidOrders(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, 'rider_extras'),
                s => setUnpaidExtras(s.docs.map(d => ({ id: d.id, ...d.data() })).filter((d: Record<string, unknown>) => d.paidToRider === false)))
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const riderDebts: RiderDebt[] = useMemo(() => riders.map(email => {
        const mail = email.trim().toLowerCase();
        const orders = unpaidOrders.filter(o => String(o.assignedRider || '').trim().toLowerCase() === mail);
        const extras = unpaidExtras.filter(x => String(x.riderEmail || '').trim().toLowerCase() === mail);
        const ordersDebt = orders.reduce((sum, o) => {
            let ship = Number(o.shippingCost) || 0;
            if (ship === 0 && Array.isArray(o.items)) {
                const item = (o.items as Record<string, unknown>[]).find(i => /env[ií]o/i.test(String(i.nombre || i.name || '')));
                if (item) ship = Number(item.precio || item.price || 0) * Number(item.cantidad || item.quantity || 1);
            }
            return sum + ship;
        }, 0);
        const extrasDebt = extras.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        return {
            email, total: ordersDebt + extrasDebt,
            orders: orders as { id: string }[],
            extras: extras as { id: string; description?: string; amount?: number }[]
        };
    }), [riders, unpaidOrders, unpaidExtras]);

    const rows = employees.filter(e => e.active !== false).map(e => {
        // Los registros anteriores conservan la modalidad mensual hasta que se editen.
        const isDaily = e.paymentMode === 'daily';
        const salary = isDaily ? 0 : (Number(e.hourlyRate) || 0) * (Number(e.monthlyHours) || 0);
        const paid = expenses
            .filter(x => (x.employeeId ? x.employeeId === e.id : String(x.description || '') === `Pago Sueldo: ${e.name}`) && (dayKeyOf(x.date) || '').startsWith(monthKey))
            .reduce((s, x) => s + (Number(x.totalAmount) || 0), 0);
        const advances = movs
            .filter(m => m.kind === 'adelanto' && m.person === e.name && m.dateKey.startsWith(monthKey))
            .reduce((s, m) => s + m.amount, 0);
        const oldDebt = timeEntries
            .filter(t => t.employeeId === e.id && t.status === 'open' && t.clockOut != null)
            .reduce((s, t) => s + (Number(t.amountDue) || 0), 0);
        return { ...e, isDaily, salary, paid, advances, oldDebt, pending: isDaily ? 0 : Math.max(0, salary - paid - advances) };
    });
    const hasMonthlyEmployees = rows.some(r => !r.isDaily);

    const openForm = (emp?: PanelEmployee) => {
        setEditing(emp || null);
        setFName(emp?.name || '');
        setFRate(emp ? String(emp.hourlyRate ?? '') : '');
        setFHours(emp ? String(emp.monthlyHours ?? '') : '');
        setFMode(emp ? emp.paymentMode || 'monthly' : 'daily');
        setFDailyRate(emp ? String(emp.dailyRate ?? '') : '');
        setShowForm(true);
    };

    const saveEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fName.trim()) return;
        const values = [num(fRate), num(fHours), num(fDailyRate)];
        if (values.some(value => !Number.isFinite(value) || value < 0)) return;
        const data = { name: fName.trim(), hourlyRate: num(fRate), monthlyHours: num(fHours), paymentMode: fMode, dailyRate: num(fDailyRate) };
        try {
            if (editing) await updateDoc(doc(db, 'employees', editing.id), data);
            else await addDoc(collection(db, 'employees'), { ...data, active: true });
            setShowForm(false);
        } catch (err) { console.error(err); alert('Error al guardar.'); }
    };

    const removeEmployee = async (id: string) => {
        if (window.confirm('¿Eliminar este integrante?')) await deleteDoc(doc(db, 'employees', id));
    };

    const startPay = (emp: (typeof rows)[number]) => {
        setPayFor(emp.id);
        setPayDays('1');
        setPayAmount(emp.isDaily ? (emp.dailyRate ? String(emp.dailyRate) : '') : String(Math.round(emp.pending + emp.oldDebt)));
    };

    const confirmPay = async (emp: (typeof rows)[number]) => {
        const amount = num(payAmount);
        if (savingPay || !Number.isFinite(amount) || amount <= 0) return;
        if (emp.isDaily && (!Number.isFinite(num(payDays)) || num(payDays) <= 0)) return;
        setSavingPay(true);
        try {
            await addDoc(collection(db, 'expenses'), {
                description: `Pago Sueldo: ${emp.name}`,
                totalAmount: amount,
                date: Timestamp.now(),
                type: 'servicio',
                paymentMethod: payMethod,
                employeeId: emp.id,
                paymentMode: emp.isDaily ? 'daily' : 'monthly',
                ...(emp.isDaily ? { daysPaid: num(payDays), dailyRate: Number(emp.dailyRate) || 0 } : {}),
                createdByEmail: userEmail
            });
            // Un pago por días no liquida automáticamente fichajes históricos.
            for (const t of timeEntries.filter(t => !emp.isDaily && t.employeeId === emp.id && t.status === 'open' && t.clockOut != null)) {
                await updateDoc(doc(db, 'time_entries', t.id), { status: 'closed' });
            }
            setPayFor(null);
        } catch (err) { console.error(err); alert('Error al registrar el pago.'); }
        finally { setSavingPay(false); }
    };

    const payRider = async (r: RiderDebt) => {
        if (!window.confirm(`¿Registrar el pago de ${fmt(r.total)} a ${r.email}?`)) return;
        try {
            await addDoc(collection(db, 'expenses'), {
                description: `Delivery: ${r.email}`,
                totalAmount: r.total,
                date: Timestamp.now(),
                type: 'delivery',
                paymentMethod: 'Efectivo',
                createdByEmail: userEmail
            });
            for (const o of r.orders) await updateDoc(doc(db, 'orders', o.id), { paidToRider: true });
            for (const x of r.extras) await updateDoc(doc(db, 'rider_extras', x.id), { paidToRider: true });
        } catch (err) { console.error(err); alert('Error al registrar el pago.'); }
    };

    return (
        <>
            <div className="fin-card">
                <h3>Pagos a empleados</h3>
                <p className="fin-note">Por día: registrá los días realmente trabajados, sin generar un pendiente mensual. La modalidad mensual conserva el cálculo por horas acordadas. Podés elegir la modalidad con el lápiz de cada empleado.</p>
                <div className="fin-scroll">
                    <table className="fin-table">
                        <thead><tr><th>Persona</th><th>Modalidad</th><th className="r">Valor</th>{hasMonthlyEmployees && <><th className="r">Horas/mes</th><th className="r">Previsto mensual</th></>}<th className="r">Pagado + adel. ({monthKey})</th>{hasMonthlyEmployees && <th className="r">Pendiente mensual</th>}<th /></tr></thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id}>
                                    <td>{r.name}{r.oldDebt > 0 && <small> · {r.isDaily ? 'fichajes sin conciliar' : 'deuda anterior'} {fmt(r.oldDebt)}</small>}</td>
                                    <td>{r.isDaily ? 'Por día' : 'Mensual'}</td>
                                    <td className="r">{fmt(Number(r.isDaily ? r.dailyRate : r.hourlyRate) || 0)}<small> / {r.isDaily ? 'día' : 'hora'}</small></td>
                                    {hasMonthlyEmployees && <><td className="r">{r.isDaily ? '—' : r.monthlyHours || 0}</td><td className="r">{r.isDaily ? '—' : fmt(r.salary)}</td></>}
                                    <td className="r">{fmt(r.paid + r.advances)}</td>
                                    {hasMonthlyEmployees && <td className="r">{r.isDaily ? '—' : fmt(r.pending)}</td>}
                                    <td className="fin-actions">
                                        <button className="fin-mini" disabled={savingPay} onClick={() => startPay(r)}>Pagar</button>
                                        <button className="fin-mini" onClick={() => openForm(r)}><FaEdit /></button>
                                        <button className="fin-mini" onClick={() => removeEmployee(r.id)}><FaTrash /></button>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && <tr><td colSpan={hasMonthlyEmployees ? 8 : 5}>Todavía no hay integrantes cargados.</td></tr>}
                            <tr className="total"><td>Total</td><td /><td />{hasMonthlyEmployees && <><td /><td className="r">{fmt(rows.reduce((s, r) => s + r.salary, 0))}</td></>}<td className="r">{fmt(rows.reduce((s, r) => s + r.paid + r.advances, 0))}</td>{hasMonthlyEmployees && <td className="r">{fmt(rows.reduce((s, r) => s + r.pending, 0))}</td>}<td /></tr>
                        </tbody>
                    </table>
                </div>

                {payFor && (() => {
                    const emp = rows.find(r => r.id === payFor);
                    if (!emp) return null;
                    return (
                        <div className="fin-alert warn">
                            <b>Pagar sueldo a {emp.name}</b>
                            <div className="fin-form-grid" style={{ marginTop: 8 }}>
                                {emp.isDaily && <label className="fin-field">Días trabajados en este pago<input type="number" min="0.5" step="0.5" value={payDays} onChange={e => {
                                    setPayDays(e.target.value);
                                    if (emp.dailyRate) setPayAmount(String(Math.round(num(e.target.value) * emp.dailyRate * 100) / 100));
                                }} /></label>}
                                <label className="fin-field">Monto<input type="number" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} /></label>
                                <label className="fin-field">Sale de
                                    <select value={payMethod} onChange={e => setPayMethod(e.target.value as 'Efectivo' | 'Banco')}><option>Efectivo</option><option>Banco</option></select>
                                </label>
                                <button className="fin-primary" disabled={savingPay || num(payAmount) <= 0 || (emp.isDaily && num(payDays) <= 0)} onClick={() => confirmPay(emp)}>{savingPay ? 'Guardando…' : 'Confirmar pago'}</button>
                                <button className="fin-mini" disabled={savingPay} onClick={() => setPayFor(null)}>Cancelar</button>
                            </div>
                            {emp.isDaily && <p className="fin-note">El monto es editable. Si ya diste adelantos para estos días, descontalos del importe que estás pagando ahora.</p>}
                            <small>Se registra también como gasto, así entra al resultado y al cierre de caja.</small>
                        </div>
                    );
                })()}

                {!showForm && <button className="fin-primary" onClick={() => openForm()}>Agregar integrante</button>}
                {showForm && (
                    <form onSubmit={saveEmployee} className="fin-form-grid" style={{ marginTop: 10 }}>
                        <label className="fin-field">Nombre<input value={fName} onChange={e => setFName(e.target.value)} /></label>
                        <label className="fin-field">Modalidad de pago<select value={fMode} onChange={e => setFMode(e.target.value as PaymentMode)}><option value="daily">Por día (sin pendiente mensual)</option><option value="monthly">Mensual por horas acordadas</option></select></label>
                        {fMode === 'daily' ? <label className="fin-field">Valor por día (opcional)<input type="number" min="0" inputMode="decimal" value={fDailyRate} onChange={e => setFDailyRate(e.target.value)} /></label> : <>
                            <label className="fin-field">Valor por hora<input type="number" min="0" inputMode="decimal" value={fRate} onChange={e => setFRate(e.target.value)} /></label>
                            <label className="fin-field">Horas mensuales<input type="number" min="0" inputMode="decimal" value={fHours} onChange={e => setFHours(e.target.value)} /></label>
                        </>}
                        <button className="fin-primary" type="submit">{editing ? 'Guardar cambios' : 'Agregar'}</button>
                        <button type="button" className="fin-mini" onClick={() => setShowForm(false)}>Cancelar</button>
                    </form>
                )}
            </div>

            {riderDebts.length > 0 && (
                <div className="fin-card">
                    <h3>Repartidores</h3>
                    <table className="fin-table">
                        <tbody>
                            {riderDebts.map(r => (
                                <tr key={r.email}>
                                    <td>{r.email}<small> · {r.orders.length} envío(s), {r.extras.length} extra(s)</small></td>
                                    <td className="r">{fmt(r.total)}</td>
                                    <td className="fin-actions">{r.total > 0 && <button className="fin-mini" onClick={() => payRider(r)}>Pagar</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
