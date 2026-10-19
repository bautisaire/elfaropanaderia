import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, Timestamp
} from 'firebase/firestore';
import { FaTrash, FaEdit } from 'react-icons/fa';

export interface PanelEmployee { id: string; name: string; hourlyRate?: number; monthlyHours?: number; active?: boolean }
export interface PanelExpense { description?: string; totalAmount?: number; date?: unknown }
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
    const [payFor, setPayFor] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
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
        const salary = (Number(e.hourlyRate) || 0) * (Number(e.monthlyHours) || 0);
        const paid = expenses
            .filter(x => String(x.description || '') === `Pago Sueldo: ${e.name}` && (dayKeyOf(x.date) || '').startsWith(monthKey))
            .reduce((s, x) => s + (Number(x.totalAmount) || 0), 0);
        const advances = movs
            .filter(m => m.kind === 'adelanto' && m.person === e.name && m.dateKey.startsWith(monthKey))
            .reduce((s, m) => s + m.amount, 0);
        const oldDebt = timeEntries
            .filter(t => t.employeeId === e.id && t.status === 'open' && t.clockOut != null)
            .reduce((s, t) => s + (Number(t.amountDue) || 0), 0);
        return { ...e, salary, paid, advances, oldDebt, pending: Math.max(0, salary - paid - advances) };
    });

    const openForm = (emp?: PanelEmployee) => {
        setEditing(emp || null);
        setFName(emp?.name || '');
        setFRate(emp ? String(emp.hourlyRate ?? '') : '');
        setFHours(emp ? String(emp.monthlyHours ?? '') : '');
        setShowForm(true);
    };

    const saveEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fName.trim()) return;
        const data = { name: fName.trim(), hourlyRate: num(fRate), monthlyHours: num(fHours) };
        try {
            if (editing) await updateDoc(doc(db, 'employees', editing.id), data);
            else await addDoc(collection(db, 'employees'), { ...data, active: true });
            setShowForm(false);
        } catch (err) { console.error(err); alert('Error al guardar.'); }
    };

    const removeEmployee = async (id: string) => {
        if (window.confirm('¿Eliminar este integrante?')) await deleteDoc(doc(db, 'employees', id));
    };

    const startPay = (id: string, suggested: number) => {
        setPayFor(id);
        setPayAmount(String(Math.round(suggested)));
    };

    const confirmPay = async (emp: (typeof rows)[number]) => {
        const amount = num(payAmount);
        if (amount <= 0) return;
        try {
            await addDoc(collection(db, 'expenses'), {
                description: `Pago Sueldo: ${emp.name}`,
                totalAmount: amount,
                date: Timestamp.now(),
                type: 'servicio',
                paymentMethod: payMethod,
                createdByEmail: userEmail
            });
            // Si había deuda vieja por fichajes, se cierra para que no quede duplicada en el Resumen.
            for (const t of timeEntries.filter(t => t.employeeId === emp.id && t.status === 'open' && t.clockOut != null)) {
                await updateDoc(doc(db, 'time_entries', t.id), { status: 'closed' });
            }
            setPayFor(null);
        } catch (err) { console.error(err); alert('Error al registrar el pago.'); }
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
                <h3>Sueldos del mes</h3>
                <p className="fin-note">Cada integrante tiene un valor por hora y unas horas mensuales acordadas; el sueldo es valor × horas. Los adelantos del mes se descuentan del pendiente.</p>
                <div className="fin-scroll">
                    <table className="fin-table">
                        <thead><tr><th>Persona</th><th className="r">$/hora</th><th className="r">Horas</th><th className="r">Sueldo</th><th className="r">Pagado + adel.</th><th className="r">Pendiente</th><th /></tr></thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id}>
                                    <td>{r.name}{r.oldDebt > 0 && <small> · deuda anterior {fmt(r.oldDebt)}</small>}</td>
                                    <td className="r">{fmt(Number(r.hourlyRate) || 0)}</td>
                                    <td className="r">{r.monthlyHours || 0}</td>
                                    <td className="r">{fmt(r.salary)}</td>
                                    <td className="r">{fmt(r.paid + r.advances)}</td>
                                    <td className="r">{fmt(r.pending)}</td>
                                    <td className="fin-actions">
                                        <button className="fin-mini" onClick={() => startPay(r.id, r.pending + r.oldDebt)}>Pagar</button>
                                        <button className="fin-mini" onClick={() => openForm(r)}><FaEdit /></button>
                                        <button className="fin-mini" onClick={() => removeEmployee(r.id)}><FaTrash /></button>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && <tr><td colSpan={7}>Todavía no hay integrantes cargados.</td></tr>}
                            <tr className="total"><td>Total mensual</td><td /><td /><td className="r">{fmt(rows.reduce((s, r) => s + r.salary, 0))}</td><td /><td className="r">{fmt(rows.reduce((s, r) => s + r.pending, 0))}</td><td /></tr>
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
                                <label className="fin-field">Monto<input type="number" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} /></label>
                                <label className="fin-field">Sale de
                                    <select value={payMethod} onChange={e => setPayMethod(e.target.value as 'Efectivo' | 'Banco')}><option>Efectivo</option><option>Banco</option></select>
                                </label>
                                <button className="fin-primary" onClick={() => confirmPay(emp)}>Confirmar pago</button>
                                <button className="fin-mini" onClick={() => setPayFor(null)}>Cancelar</button>
                            </div>
                            <small>Se registra también como gasto, así entra al resultado y al cierre de caja.</small>
                        </div>
                    );
                })()}

                {!showForm && <button className="fin-primary" onClick={() => openForm()}>Agregar integrante</button>}
                {showForm && (
                    <form onSubmit={saveEmployee} className="fin-form-grid" style={{ marginTop: 10 }}>
                        <label className="fin-field">Nombre<input value={fName} onChange={e => setFName(e.target.value)} /></label>
                        <label className="fin-field">Valor por hora<input type="number" inputMode="decimal" value={fRate} onChange={e => setFRate(e.target.value)} /></label>
                        <label className="fin-field">Horas mensuales<input type="number" inputMode="decimal" value={fHours} onChange={e => setFHours(e.target.value)} /></label>
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
