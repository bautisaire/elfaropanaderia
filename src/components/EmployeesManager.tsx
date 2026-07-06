import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where } from 'firebase/firestore';
import { FaUserPlus, FaEdit, FaTrash, FaClock, FaCheckCircle, FaMoneyBillWave, FaHistory } from 'react-icons/fa';
import { useCart } from '../context/CartContext';
import './EmployeesManager.css';

export interface Employee {
    id?: string;
    name: string;
    hourlyRate: number;
    active: boolean;
}

export interface TimeEntry {
    id?: string;
    employeeId: string;
    employeeName: string;
    clockIn: any;
    clockOut: any | null;
    durationHours: number;
    amountDue: number;
    status: 'open' | 'closed'; // closed = paid
    note?: string;
    hourlyRateAtTime?: number;
}

export default function EmployeesManager() {
    const { user } = useCart();
    const isSuperAdmin = user?.email === 'sairebautista@gmail.com';

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
    const [cifItems, setCifItems] = useState<any[]>([]);
    const [riders, setRiders] = useState<any[]>([]);
    const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
    const [unpaidExtras, setUnpaidExtras] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'fichaje' | 'empleados' | 'pagos' | 'historial'>('fichaje');

    // UI state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [formData, setFormData] = useState({ name: '', hourlyRate: 0 });
    const [selectedEmployeeForPayment, setSelectedEmployeeForPayment] = useState<{ id: string, name: string, totalDebt: number, isRider?: boolean, extrasDebt?: number } | null>(null);
    const [paymentAmount, setPaymentAmount] = useState(0);

    // Nuevos estados para ajustes manuales
    const [isAdjustDebtModalOpen, setIsAdjustDebtModalOpen] = useState(false);
    const [isManualShiftModalOpen, setIsManualShiftModalOpen] = useState(false);
    const [isCustomClockOutModalOpen, setIsCustomClockOutModalOpen] = useState(false);
    const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState<string>('all');

    const [selectedEmployeeBase, setSelectedEmployeeBase] = useState<Employee | null>(null);
    const [selectedActiveEntry, setSelectedActiveEntry] = useState<TimeEntry | null>(null);

    const [adjustDebtData, setAdjustDebtData] = useState({ type: 'add', amount: 0, note: '' });
    const [manualShiftData, setManualShiftData] = useState({ hours: 0, note: '' });
    const [customClockOutData, setCustomClockOutData] = useState({ hours: 0 });

    useEffect(() => {
        const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
            setEmployees(data);
        });

        const unsubEntries = onSnapshot(collection(db, 'time_entries'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeEntry));
            setTimeEntries(data);
        });

        const unsubCif = onSnapshot(collection(db, 'cif_items'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCifItems(data);
        });

        const unsubRiders = onSnapshot(query(collection(db, 'admin_roles'), where("is_rider", "==", true)), (snap) => {
            const data = snap.docs.map(doc => ({ email: doc.id, ...doc.data() }));
            setRiders(data);
        });

        const unsubOrders = onSnapshot(query(collection(db, 'orders'), where("status", "==", "entregado"), where("paidToRider", "==", false)), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUnpaidOrders(data);
        });

        const unsubExtras = onSnapshot(query(collection(db, 'rider_extras'), where("paidToRider", "==", false)), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUnpaidExtras(data);
        });

        return () => {
            unsubEmployees();
            unsubEntries();
            unsubCif();
            unsubRiders();
            unsubOrders();
            unsubExtras();
        };
    }, []);

    // --- EMPLOYEES TAB ---
    const handleSaveEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingEmployee && editingEmployee.id) {
                await updateDoc(doc(db, 'employees', editingEmployee.id), {
                    name: formData.name,
                    hourlyRate: formData.hourlyRate,
                });
            } else {
                await addDoc(collection(db, 'employees'), {
                    name: formData.name,
                    hourlyRate: formData.hourlyRate,
                    active: true
                });
            }
            setIsModalOpen(false);
            setEditingEmployee(null);
            setFormData({ name: '', hourlyRate: 0 });
        } catch (error) {
            console.error("Error saving employee", error);
            alert("Error al guardar empleado");
        }
    };

    const handleDeleteEmployee = async (id: string) => {
        if (confirm("¿Estás seguro de eliminar este empleado?")) {
            await deleteDoc(doc(db, 'employees', id));
        }
    };

    // --- FICHAJE TAB ---
    const getActiveEntry = (empId: string) => {
        return timeEntries.find(e => e.employeeId === empId && e.clockOut === null);
    };

    const handleClockIn = async (employee: Employee) => {
        try {
            await addDoc(collection(db, 'time_entries'), {
                employeeId: employee.id,
                employeeName: employee.name,
                clockIn: serverTimestamp(),
                clockOut: null,
                durationHours: 0,
                amountDue: 0,
                status: 'open',
                hourlyRateAtTime: employee.hourlyRate // store rate in case it changes later
            });
        } catch (error) {
            console.error("Error clock in", error);
        }
    };

    const handleClockOut = async (employee: Employee, entryId: string, clockInTimestamp: any) => {
        try {
            const clockOutTime = new Date();
            let start = new Date();

            // Handle Firestore Timestamp
            if (clockInTimestamp && typeof clockInTimestamp.toDate === 'function') {
                start = clockInTimestamp.toDate();
            } else if (clockInTimestamp) {
                start = new Date(clockInTimestamp);
            }

            const diffMs = clockOutTime.getTime() - start.getTime();
            const hours = diffMs / (1000 * 60 * 60); // Total fractional hours
            const roundedHours = Math.round(hours * 100) / 100;
            const amountDue = Math.round(roundedHours * employee.hourlyRate);

            await updateDoc(doc(db, 'time_entries', entryId), {
                clockOut: clockOutTime,
                durationHours: roundedHours,
                amountDue: amountDue
            });
        } catch (error) {
            console.error("Error clock out", error);
        }
    };

    // --- PAGOS TAB ---
    // Agrupar deuda por empleado
    const debtsByEmployee = employees.map(emp => {
        const unpaidEntries = timeEntries.filter(e => e.employeeId === emp.id && e.status === 'open' && e.clockOut !== null);
        const totalDebt = unpaidEntries.reduce((sum, e) => sum + (e.amountDue || 0), 0);
        return { ...emp, totalDebt, unpaidEntries };
    });

    const debtsByRider = riders.map(rider => {
        const riderOrders = unpaidOrders.filter(o => o.assignedRider === rider.email);
        const riderExtras = unpaidExtras.filter(e => e.riderEmail === rider.email);

        const ordersDebt = riderOrders.reduce((sum, o) => {
            let orderShipping = Number(o.shippingCost) || 0;
            if (orderShipping === 0 && o.items) {
                const envioItem = o.items.find((item: any) =>
                    String(item.nombre || item.name || "").toLowerCase().includes('envío') ||
                    String(item.nombre || item.name || "").toLowerCase().includes('envio')
                );
                if (envioItem) {
                    orderShipping = Number(envioItem.precio || envioItem.price || 0) * (Number(envioItem.cantidad || envioItem.quantity || 1));
                }
            }
            return sum + orderShipping;
        }, 0);

        const extrasDebt = riderExtras.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        
        return {
            email: rider.email,
            name: rider.email,
            isRider: true,
            totalDebt: ordersDebt + extrasDebt,
            ordersDebt,
            extrasDebt,
            riderOrders,
            riderExtras
        };
    });

    const netCifMonthly = cifItems.reduce((acc, item) => {
        if (item.isSalary) return acc;
        let monthly = item.price;
        if (item.lifeYears && item.lifeYears > 0) {
            monthly = (item.price / item.lifeYears) / 12;
        }
        return acc + monthly;
    }, 0);

    const handleProcessPayment = async () => {
        if (!selectedEmployeeForPayment) return;

        try {
            if (selectedEmployeeForPayment.isRider) {
                const extrasToLog = selectedEmployeeForPayment.extrasDebt || 0;
                
                if (extrasToLog > 0) {
                    await addDoc(collection(db, 'expenses'), {
                        title: `Pago Extras a Repartidor: ${selectedEmployeeForPayment.name}`,
                        amount: extrasToLog,
                        totalAmount: extrasToLog,
                        date: serverTimestamp(),
                        dateLabel: new Intl.DateTimeFormat('en-CA').format(new Date()),
                        category: 'Sueldos'
                    });
                }

                const rData = debtsByRider.find(r => r.email === selectedEmployeeForPayment.id);
                if (rData) {
                    for (let o of rData.riderOrders) {
                        await updateDoc(doc(db, 'orders', o.id), { paidToRider: true });
                    }
                    for (let e of rData.riderExtras) {
                        await updateDoc(doc(db, 'rider_extras', e.id), { paidToRider: true });
                    }
                }

                // Add record in time_entries history for the rider too
                await addDoc(collection(db, 'time_entries'), {
                    employeeId: selectedEmployeeForPayment.id,
                    employeeName: selectedEmployeeForPayment.name,
                    clockIn: serverTimestamp(),
                    clockOut: serverTimestamp(),
                    durationHours: 0,
                    amountDue: -selectedEmployeeForPayment.totalDebt,
                    status: 'closed',
                    note: 'Pago a repartidor'
                });

                setIsPaymentModalOpen(false);
                setPaymentAmount(0);
                alert("Pago al repartidor procesado exitosamente. (Se registraron en egresos solo los extras)");
                return;
            }

            // We'll mark their open entries as 'closed' until the payment amount is covered.
            // Simplified logic: the user usually pays the exact total pending, or an advance.
            // We just create an Expense ticket. However, to keep it simple, we'll mark ALL their pending entries as closed,
            // OR if partial payment, reduce amount inside. To avoid complexity, we'll assume paying the FULL debt.
            // If they pay partial, we could create an adjusting time_entry with negative amountDue. 
            // For this version, we will just mark all currently unpaid entries as closed if they pay.

            // Record the expense
            await addDoc(collection(db, 'expenses'), {
                title: `Pago Sueldo: ${selectedEmployeeForPayment.name}`,
                amount: paymentAmount,
                totalAmount: paymentAmount,
                date: serverTimestamp(),
                dateLabel: new Intl.DateTimeFormat('en-CA').format(new Date()),
                category: 'Sueldos'
            });

            // Mark entries as closed
            const empData = debtsByEmployee.find(e => e.id === selectedEmployeeForPayment.id);
            if (empData && empData.unpaidEntries) {
                for (let entry of empData.unpaidEntries) {
                    await updateDoc(doc(db, 'time_entries', entry.id!), {
                        status: 'closed'
                    });
                }
            }

            // Create a payment record in time_entries for the history
            await addDoc(collection(db, 'time_entries'), {
                employeeId: selectedEmployeeForPayment.id,
                employeeName: selectedEmployeeForPayment.name,
                clockIn: serverTimestamp(),
                clockOut: serverTimestamp(),
                durationHours: 0,
                amountDue: -paymentAmount,
                status: 'closed',
                note: 'Pago de sueldo'
            });

            // If payment isn't exactly the totalDebt (partial payment), we create a remaining debt entry
            if (paymentAmount < selectedEmployeeForPayment.totalDebt) {
                const diff = selectedEmployeeForPayment.totalDebt - paymentAmount;
                await addDoc(collection(db, 'time_entries'), {
                    employeeId: selectedEmployeeForPayment.id,
                    employeeName: selectedEmployeeForPayment.name,
                    clockIn: serverTimestamp(),
                    clockOut: serverTimestamp(),
                    durationHours: 0,
                    amountDue: diff,
                    status: 'open',
                    note: 'Saldo restante de pago parcial'
                });
            }

            setIsPaymentModalOpen(false);
            setPaymentAmount(0);
            alert("Pago procesado y registrado en Egresos exitosamente.");
        } catch (error) {
            console.error("Error al procesar pago", error);
            alert("Error al registrar pago");
        }
    };

    // --- MANUAL ADJUSTMENTS ---
    const handleAdjustDebt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployeeBase) return;

        try {
            const amount = adjustDebtData.type === 'add' ? adjustDebtData.amount : -adjustDebtData.amount;
            await addDoc(collection(db, 'time_entries'), {
                employeeId: selectedEmployeeBase.id,
                employeeName: selectedEmployeeBase.name,
                clockIn: serverTimestamp(),
                clockOut: serverTimestamp(),
                durationHours: 0,
                amountDue: amount,
                status: 'open',
                note: adjustDebtData.note || 'Ajuste manual de saldo',
                hourlyRateAtTime: selectedEmployeeBase.hourlyRate
            });
            setIsAdjustDebtModalOpen(false);
            setAdjustDebtData({ type: 'add', amount: 0, note: '' });
            alert("Saldo ajustado correctamente.");
        } catch (error) {
            console.error(error);
            alert("Error al ajustar saldo.");
        }
    };

    const handleAddManualShift = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployeeBase) return;

        try {
            const amountDue = Math.round(manualShiftData.hours * selectedEmployeeBase.hourlyRate);
            await addDoc(collection(db, 'time_entries'), {
                employeeId: selectedEmployeeBase.id,
                employeeName: selectedEmployeeBase.name,
                clockIn: serverTimestamp(),
                clockOut: serverTimestamp(),
                durationHours: manualShiftData.hours,
                amountDue: amountDue,
                status: 'open',
                note: manualShiftData.note || 'Jornada cargada manualmente',
                hourlyRateAtTime: selectedEmployeeBase.hourlyRate
            });
            setIsManualShiftModalOpen(false);
            setManualShiftData({ hours: 0, note: '' });
            alert("Jornada agregada.");
        } catch (error) {
            console.error(error);
            alert("Error al cargar jornada.");
        }
    };

    const handleCustomClockOut = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployeeBase || !selectedActiveEntry) return;

        try {
            const amountDue = Math.round(customClockOutData.hours * selectedEmployeeBase.hourlyRate);
            await updateDoc(doc(db, 'time_entries', selectedActiveEntry.id!), {
                clockOut: serverTimestamp(),
                durationHours: customClockOutData.hours,
                amountDue: amountDue,
                note: 'Cierre de turno con horas editadas manualmente'
            });
            setIsCustomClockOutModalOpen(false);
            setCustomClockOutData({ hours: 0 });
            alert("Turno cerrado y fijado.");
        } catch (error) {
            console.error(error);
            alert("Error al cerrar turno.");
        }
    };


    return (
        <div className="employees-manager">
            <div className="em-header">
                <div>
                    <h2>Personal y Fichajes</h2>
                    <p>Gestiona a tus empleados, registra horarios y calcula sueldos.</p>
                </div>
            </div>

            <div className="em-tabs">
                <button className={`em-tab-btn ${activeTab === 'fichaje' ? 'active' : ''}`} onClick={() => setActiveTab('fichaje')}>
                    <FaClock /> Fichaje Diario
                </button>
                <button className={`em-tab-btn ${activeTab === 'pagos' ? 'active' : ''}`} onClick={() => setActiveTab('pagos')}>
                    <FaMoneyBillWave /> Pagos y Deudas
                </button>
                {isSuperAdmin && (
                    <>
                        <button className={`em-tab-btn ${activeTab === 'empleados' ? 'active' : ''}`} onClick={() => setActiveTab('empleados')}>
                            <FaUserPlus /> Gestión de Equipo
                        </button>
                        <button className={`em-tab-btn ${activeTab === 'historial' ? 'active' : ''}`} onClick={() => setActiveTab('historial')}>
                            <FaHistory /> Historial
                        </button>
                    </>
                )}
            </div>

            {/* TAB EMPLEADOS */}
            {isSuperAdmin && activeTab === 'empleados' && (
                <div>
                    <button className="btn-primary" style={{ marginBottom: '20px' }} onClick={() => {
                        setEditingEmployee(null);
                        setFormData({ name: '', hourlyRate: 0 });
                        setIsModalOpen(true);
                    }}>
                        + Nuevo Empleado
                    </button>

                    <div className="em-grid">
                        {employees.map(emp => (
                            <div key={emp.id} className="em-card">
                                <div className="em-card-header">
                                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                        <div className="em-avatar">{emp.name.charAt(0).toUpperCase()}</div>
                                        <div className="em-info">
                                            <h3>{emp.name}</h3>
                                            <p>{emp.active ? 'Activo' : 'Inactivo'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="em-rate">
                                    Valor Hora: ${emp.hourlyRate.toLocaleString()}
                                </div>
                                <div className="em-actions">
                                    <button className="em-btn-edit" onClick={() => {
                                        setEditingEmployee(emp);
                                        setFormData({ name: emp.name, hourlyRate: emp.hourlyRate });
                                        setIsModalOpen(true);
                                    }}><FaEdit /> Editar</button>
                                    <button className="em-btn-delete" onClick={() => emp.id && handleDeleteEmployee(emp.id)}><FaTrash /> Borrar</button>
                                </div>
                            </div>
                        ))}

                        {riders.map(rider => (
                            <div key={rider.email} className="em-card" style={{ borderLeft: '4px solid #10b981' }}>
                                <div className="em-card-header">
                                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                        <div className="em-avatar" style={{ background: '#dcfce7', color: '#16a34a' }}>{rider.email.charAt(0).toUpperCase()}</div>
                                        <div className="em-info" style={{ overflow: 'hidden' }}>
                                            <h3 style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{rider.email}</h3>
                                            <p>Activo</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="em-rate" style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.9rem' }}>
                                    Rol: Repartidor (Gana por entrega)
                                </div>
                                <div className="em-actions" style={{ justifyContent: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                        Se edita desde Control de Acceso
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB FICHAJE */}
            {activeTab === 'fichaje' && (
                <div>
                    {employees.filter(e => e.active).map(emp => {
                        const activeEntry = getActiveEntry(emp.id!);
                        return (
                            <div key={emp.id} className="fichaje-card">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div className="em-avatar" style={{ background: activeEntry ? '#d1fae5' : '#f1f5f9', color: activeEntry ? '#059669' : '#64748b' }}>
                                        {emp.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{emp.name}</h3>
                                        <div className="fichaje-status">
                                            <div className={`status-dot ${activeEntry ? 'active' : 'inactive'}`}></div>
                                            {activeEntry ? 'Trabajando actualmente' : 'Fuera de turno'}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    {activeEntry ? (
                                        <div style={{ display: 'flex', gap: '5px', flexDirection: 'column' }}>
                                            <button className="fichaje-btn out" onClick={() => handleClockOut(emp, activeEntry.id!, activeEntry.clockIn)}>
                                                <FaClock /> Marcar Salida
                                            </button>
                                            {isSuperAdmin && (
                                                <button className="btn-secondary btn-sm" onClick={() => {
                                                    setSelectedEmployeeBase(emp);
                                                    setSelectedActiveEntry(activeEntry);
                                                    setCustomClockOutData({ hours: 0 });
                                                    setIsCustomClockOutModalOpen(true);
                                                }}>Fijar horas manualmente</button>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '5px', flexDirection: 'column' }}>
                                            <button className="fichaje-btn in" onClick={() => handleClockIn(emp)}>
                                                <FaCheckCircle /> Marcar Ingreso
                                            </button>
                                            {isSuperAdmin && (
                                                <button className="btn-secondary btn-sm" onClick={() => {
                                                    setSelectedEmployeeBase(emp);
                                                    setManualShiftData({ hours: 0, note: '' });
                                                    setIsManualShiftModalOpen(true);
                                                }}>Cargar turno</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* TAB PAGOS & DEUDAS */}
            {activeTab === 'pagos' && (
                <div>
                    <div className="debt-card" style={{ background: '#f8fafc', borderLeft: '4px solid #3b82f6', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 5px 0', color: '#1e3a8a' }}>Fondo CIF Operativo (Alquiler, Servicios, etc.)</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Dinero que mes a mes debes acumular y apartar para gastos fijos (Excluye sueldos).</p>
                            <div className="debt-amount" style={{ color: '#2563eb' }}>${Math.round(netCifMonthly).toLocaleString('es-AR')} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>/ mes</span></div>
                            <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>Meta diaria de reserva: <strong>${Math.round(netCifMonthly / 30).toLocaleString('es-AR')}</strong></p>
                        </div>
                    </div>

                    {debtsByEmployee.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            No hay empleados listados.
                        </div>
                    ) : (
                        debtsByEmployee.map(emp => (
                            <div key={emp.id} className="debt-card">
                                <div>
                                    <h3 style={{ margin: '0 0 5px 0', color: '#1e293b' }}>{emp.name}</h3>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Deuda acumulada por turnos trabajados</p>
                                    <div className="debt-amount">${emp.totalDebt.toLocaleString()}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    {isSuperAdmin && (
                                        <button className="btn-secondary" style={{ backgroundColor: '#f1f5f9' }} onClick={() => {
                                            setSelectedEmployeeBase(emp);
                                            setAdjustDebtData({ type: 'add', amount: 0, note: '' });
                                            setIsAdjustDebtModalOpen(true);
                                        }}>
                                            Ajustar Saldo
                                        </button>
                                    )}
                                    {emp.totalDebt > 0 && (
                                        <button className="btn-pay" onClick={() => {
                                            setSelectedEmployeeForPayment({ id: emp.id!, name: emp.name, totalDebt: emp.totalDebt });
                                            setPaymentAmount(emp.totalDebt);
                                            setIsPaymentModalOpen(true);
                                        }}>
                                            Cargar Pago
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}

                    {debtsByRider.length > 0 && debtsByRider.map(rider => (
                        <div key={rider.email} className="debt-card" style={{ borderLeft: '4px solid #10b981' }}>
                            <div>
                                <h3 style={{ margin: '0 0 5px 0', color: '#1e293b' }}>{rider.email} <span style={{fontSize: '0.8rem', background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', marginLeft: '5px'}}>Repartidor</span></h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Deuda por entregas (${rider.ordersDebt.toLocaleString()}) y extras (${rider.extrasDebt.toLocaleString()})</p>
                                <div className="debt-amount">${rider.totalDebt.toLocaleString()}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {rider.totalDebt > 0 && (
                                    <button className="btn-pay" onClick={() => {
                                        setSelectedEmployeeForPayment({ id: rider.email, name: rider.email, totalDebt: rider.totalDebt, isRider: true, extrasDebt: rider.extrasDebt });
                                        setPaymentAmount(rider.totalDebt);
                                        setIsPaymentModalOpen(true);
                                    }}>
                                        Cargar Pago
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* TAB HISTORIAL */}
            {isSuperAdmin && activeTab === 'historial' && (
                <div>
                    <div className="em-form-group" style={{ marginBottom: '20px', maxWidth: '300px' }}>
                        <label>Seleccionar Empleado</label>
                        <select 
                            value={selectedEmployeeForHistory} 
                            onChange={e => setSelectedEmployeeForHistory(e.target.value)}
                        >
                            <option value="all">Todos los empleados</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="history-list">
                        {timeEntries
                            .filter(entry => selectedEmployeeForHistory === 'all' || entry.employeeId === selectedEmployeeForHistory)
                            .filter(entry => entry.clockOut !== null) // only show completed entries
                            .sort((a, b) => {
                                const dateA = a.clockOut?.toDate ? a.clockOut.toDate() : new Date(a.clockOut);
                                const dateB = b.clockOut?.toDate ? b.clockOut.toDate() : new Date(b.clockOut);
                                return dateB.getTime() - dateA.getTime();
                            })
                            .map(entry => {
                                const isPositive = entry.amountDue >= 0;
                                return (
                                    <div key={entry.id} className="history-item">
                                        <div className="history-info">
                                            <strong>{entry.employeeName}</strong>
                                            <span>
                                                {new Date(entry.clockOut?.toDate ? entry.clockOut.toDate() : entry.clockOut).toLocaleString('es-AR')}
                                            </span>
                                            <span>
                                                {entry.note ? entry.note : (entry.durationHours > 0 ? `Turno de ${entry.durationHours}hs` : 'Movimiento')}
                                            </span>
                                        </div>
                                        <div className={`history-amount ${isPositive ? 'positive' : 'negative'}`}>
                                            {isPositive ? '+' : '-'}${Math.abs(entry.amountDue).toLocaleString()}
                                        </div>
                                    </div>
                                );
                            })
                        }
                        {timeEntries.filter(entry => entry.clockOut !== null && (selectedEmployeeForHistory === 'all' || entry.employeeId === selectedEmployeeForHistory)).length === 0 && (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                No hay movimientos registrados.
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* MODALS */}
            {isModalOpen && (
                <div className="em-modal-overlay">
                    <div className="em-modal">
                        <h3>{editingEmployee ? 'Editar Empleado' : 'Nuevo Empleado'}</h3>
                        <form onSubmit={handleSaveEmployee}>
                            <div className="em-form-group">
                                <label>Nombre del Empleado</label>
                                <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ej. Juan Pérez" />
                            </div>
                            <div className="em-form-group">
                                <label>Valor por Hora ($)</label>
                                <input type="number" required min="0" value={formData.hourlyRate} onChange={e => setFormData({ ...formData, hourlyRate: Number(e.target.value) })} placeholder="Ej. 2500" />
                            </div>
                            <div className="em-modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isPaymentModalOpen && selectedEmployeeForPayment && (
                <div className="em-modal-overlay">
                    <div className="em-modal">
                        <h3>Pago a {selectedEmployeeForPayment.name}</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '20px' }}>
                            Deuda actual: <strong>${selectedEmployeeForPayment.totalDebt.toLocaleString()}</strong><br />
                            Al guardar, esto se anotará automáticamente como "Egreso".
                        </p>
                        <form onSubmit={(e) => { e.preventDefault(); handleProcessPayment(); }}>
                            <div className="em-form-group">
                                <label>Monto a Pagar ($)</label>
                                <input type="number" required min="1" max={selectedEmployeeForPayment.totalDebt} value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
                            </div>
                            <div className="em-modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsPaymentModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary" style={{ background: '#059669' }}>Procesar Pago</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isAdjustDebtModalOpen && selectedEmployeeBase && (
                <div className="em-modal-overlay">
                    <div className="em-modal">
                        <h3>Ajustar Saldo de {selectedEmployeeBase.name}</h3>
                        <form onSubmit={handleAdjustDebt}>
                            <div className="em-form-group">
                                <label>Tipo de Ajuste</label>
                                <select value={adjustDebtData.type} onChange={e => setAdjustDebtData({ ...adjustDebtData, type: e.target.value })}>
                                    <option value="add">Sumar a la deuda (A favor del empleado)</option>
                                    <option value="subtract">Restar a la deuda (A favor del local)</option>
                                </select>
                            </div>
                            <div className="em-form-group">
                                <label>Monto ($)</label>
                                <input type="number" required min="1" value={adjustDebtData.amount} onChange={e => setAdjustDebtData({ ...adjustDebtData, amount: Number(e.target.value) })} />
                            </div>
                            <div className="em-form-group">
                                <label>Motivo o Nota</label>
                                <input type="text" value={adjustDebtData.note} onChange={e => setAdjustDebtData({ ...adjustDebtData, note: e.target.value })} placeholder="Ej. Adelanto de sueldo, Premio, etc." />
                            </div>
                            <div className="em-modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsAdjustDebtModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar Ajuste</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isManualShiftModalOpen && selectedEmployeeBase && (
                <div className="em-modal-overlay">
                    <div className="em-modal">
                        <h3>Cargar Turno a {selectedEmployeeBase.name}</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '10px' }}>Ingresa la cantidad de horas para generar un turno completado directamente.</p>
                        <form onSubmit={handleAddManualShift}>
                            <div className="em-form-group">
                                <label>Horas Trabajadas</label>
                                <input type="number" required min="0.1" step="0.1" value={manualShiftData.hours} onChange={e => setManualShiftData({ ...manualShiftData, hours: Number(e.target.value) })} />
                            </div>
                            <div className="em-form-group">
                                <label>Nota (Opcional)</label>
                                <input type="text" value={manualShiftData.note} onChange={e => setManualShiftData({ ...manualShiftData, note: e.target.value })} placeholder="Ej. Turno mañana" />
                            </div>
                            <div className="em-modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsManualShiftModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Generar Turno</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isCustomClockOutModalOpen && selectedEmployeeBase && selectedActiveEntry && (
                <div className="em-modal-overlay">
                    <div className="em-modal">
                        <h3>Cerrar Turno Editado</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '10px' }}>Fija las horas finales de este turno ignorando a qué hora comenzó.</p>
                        <form onSubmit={handleCustomClockOut}>
                            <div className="em-form-group">
                                <label>Total Horas Trabajadas</label>
                                <input type="number" required min="0" step="0.1" value={customClockOutData.hours} onChange={e => setCustomClockOutData({ ...customClockOutData, hours: Number(e.target.value) })} />
                            </div>
                            <div className="em-modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsCustomClockOutModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary" style={{ background: '#ef4444' }}>Cerrar Turno</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
