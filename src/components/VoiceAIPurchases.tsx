import { useState, useRef } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, Timestamp, writeBatch, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { FaTimes, FaCheckCircle, FaTrash, FaPlus, FaList } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { RawMaterial } from './CostManager';

interface VoiceAIPurchasesProps {
    rawMaterials: RawMaterial[];
}

export default function VoiceAIPurchases({ rawMaterials }: VoiceAIPurchasesProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [ticketItems, setTicketItems] = useState<any[]>([]);
    const [ticketName, setTicketName] = useState<string>("");
    const [ticketDate, setTicketDate] = useState<string>(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().split('T')[0];
    });
    const [ticketType, setTicketType] = useState<string>("materia_prima");
    const [viewMode, setViewMode] = useState<"completo" | "simple">("completo");
    const [priceConflicts, setPriceConflicts] = useState<any[]>([]);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    
    // Generador de Refs para mover foco
    const inputRefs = useRef<{ [key: string]: HTMLInputElement | HTMLSelectElement }>({});

    const handleKeyDown = (e: React.KeyboardEvent, idx: number, field: string) => {
        if (e.key === "Enter") {
            e.preventDefault();
            // Añadir fila nueva y hacer foco
            setTicketItems([...ticketItems, {
                id: crypto.randomUUID(),
                nombre: "",
                cantidad: 0,
                unidad: "unidad",
                rawMaterialId: null,
                precioEditado: 0,
                multiplicador: 1
            }]);
            setTimeout(() => {
                const nextId = `${ticketItems.length}_name`;
                inputRefs.current[nextId]?.focus();
            }, 50);
            return;
        }

        const fields = ['name', 'qty', 'unit', 'multiplier', 'price'];
        const currentFieldIndex = fields.indexOf(field);

        if (e.key === "ArrowRight") {
            const currentEl = e.target as HTMLInputElement;
            // Only move right if caret is at the end of text
            if (currentEl.selectionEnd === currentEl.value.length || field === 'unit') {
                e.preventDefault();
                if (currentFieldIndex < fields.length - 1) {
                    inputRefs.current[`${idx}_${fields[currentFieldIndex + 1]}`]?.focus();
                }
            }
        } else if (e.key === "ArrowLeft") {
            const currentEl = e.target as HTMLInputElement;
            // Only move left if caret is at start
            if (currentEl.selectionStart === 0 || field === 'unit') {
                e.preventDefault();
                if (currentFieldIndex > 0) {
                    inputRefs.current[`${idx}_${fields[currentFieldIndex - 1]}`]?.focus();
                }
            }
        }
    };

    const handleNameChange = (idx: number, newName: string) => {
        const newItems = [...ticketItems];
        newItems[idx].nombre = newName;
        
        if (ticketType === "materia_prima") {
            // Exact match to auto-populate
            const exactMatch = rawMaterials.find(m => m.name.toLowerCase().trim() === newName.toLowerCase().trim());
            
            if (exactMatch) {
                newItems[idx].rawMaterialId = exactMatch.id;
                newItems[idx].unidad = exactMatch.unit || 'unidad';
                newItems[idx].cantidad = exactMatch.baseQuantity || 0;
                newItems[idx].precioEditado = exactMatch.price || 0;
            } else {
                newItems[idx].rawMaterialId = null;
            }
        } else {
            newItems[idx].rawMaterialId = null;
        }

        setTicketItems(newItems);
    };

    const handleConfirmClick = () => {
        if (ticketItems.length === 0) return;

        const invalidItems = ticketItems.filter(i => !i.nombre.trim());
        if (invalidItems.length > 0) return alert("Hay filas con nombres vacíos.");

        if (ticketType !== "materia_prima") {
            proceedWithCommit([]);
            return;
        }

        const conflicts: any[] = [];
        for (const item of ticketItems) {
            if (item.rawMaterialId) {
                const matData = rawMaterials.find(m => m.id === item.rawMaterialId);
                if (matData && item.cantidad === matData.baseQuantity && item.unidad === matData.unit && item.precioEditado !== matData.price) {
                    conflicts.push({
                        id: item.rawMaterialId,
                        name: item.nombre,
                        oldPrice: matData.price,
                        newPrice: item.precioEditado,
                        updatePrice: true
                    });
                }
            }
        }

        if (conflicts.length > 0) {
            setPriceConflicts(conflicts);
        } else {
            proceedWithCommit([]);
        }
    };

    const proceedWithCommit = async (resolvedConflicts: any[]) => {
        try {
            const batch = writeBatch(db);

            // Create ticket
            const ticketRef = doc(collection(db, "expenses"));
            let totalAmount = 0;

            const itemsToSave = ticketItems.map(item => {
                const mult = item.multiplicador || 1;
                const subtotal = (item.precioEditado || 0) * mult;
                totalAmount += subtotal;
                return {
                    name: item.nombre,
                    quantity: item.cantidad,
                    unit: item.unidad,
                    price: item.precioEditado,
                    materialId: item.rawMaterialId,
                    multiplier: mult,
                    subtotal: subtotal
                };
            });

            // Logica auto-incremental de ID de ticket
            const expensesRef = collection(db, "expenses");
            const q = query(expensesRef, orderBy("ticketNumber", "desc"), limit(1));
            const snap = await getDocs(q);
            let nextTicketNumber = 1;
            if (!snap.empty) {
                nextTicketNumber = (snap.docs[0].data().ticketNumber || 0) + 1;
            }
            const formattedTicketId = nextTicketNumber.toString().padStart(5, '0');

            const [y, m, d] = ticketDate.split('-');
            const orderDate = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);

            batch.set(ticketRef, {
                date: Timestamp.fromDate(orderDate),
                type: ticketType,
                description: ticketName.trim() ? ticketName.trim() : "Sin titulo",
                totalAmount: totalAmount,
                items: itemsToSave,
                createdByEmail: user?.email || "admin",
                ticketNumber: nextTicketNumber,
                formattedTicketId: formattedTicketId

            });

            // Update or Create Raw Materials
            if (ticketType === "materia_prima") {
                for (const item of ticketItems) {
                    const isNew = !item.rawMaterialId;
                
                if (isNew) {
                    const newMatRef = doc(collection(db, "raw_materials"));
                    batch.set(newMatRef, {
                        name: item.nombre.trim(),
                        unit: item.unidad,
                        baseQuantity: item.cantidad > 0 ? item.cantidad : 1000, 
                        price: item.precioEditado,
                        currentPrice: item.precioEditado,
                        stockQuantity: item.cantidad * (item.multiplicador || 1),
                        category: "materia prima",
                        lastUpdated: Timestamp.now(),
                        priceHistory: [{ 
                            date: new Date().toISOString(), 
                            price: item.precioEditado, 
                            baseQuantity: item.cantidad > 0 ? item.cantidad : 1000, 
                            unit: item.unidad 
                        }]
                    });
                } else {
                    const matRef = doc(db, "raw_materials", item.rawMaterialId);
                    const matData = rawMaterials.find(m => m.id === item.rawMaterialId);
                    
                    if (matData) {
                        let qtyAddedToStock = item.cantidad * (item.multiplicador || 1);
                        if (item.unidad === 'kg' && matData.unit === 'g') qtyAddedToStock *= 1000;
                        else if (item.unidad === 'l' && matData.unit === 'ml') qtyAddedToStock *= 1000;
                        
                        const currentStock = (matData as any).stockQuantity || 0;
                        const newStock = currentStock + qtyAddedToStock;
                        let history = matData.priceHistory || [];
                        
                        const updates: any = {
                            stockQuantity: newStock,
                            lastUpdated: Timestamp.now()
                        };

                        const conflict = resolvedConflicts.find(c => c.id === item.rawMaterialId);
                        
                        if (conflict && conflict.updatePrice) {
                            updates.currentPrice = item.precioEditado;
                            updates.price = item.precioEditado;
                            
                            // Si el historial está vacío (producto creado antes de añadir soporte), 
                            // inyectamos el precio antiguo como "base" inicial.
                            if (history.length === 0) {
                                history.push({
                                    price: matData.price || 0,
                                    baseQuantity: matData.baseQuantity || 1000,
                                    unit: matData.unit || 'g',
                                    date: (matData as any).lastUpdated?.seconds ? new Date((matData as any).lastUpdated.seconds * 1000).toISOString() : new Date().toISOString()
                                });
                            }

                            history = [ ...history, { date: new Date().toISOString(), price: item.precioEditado, baseQuantity: item.cantidad, unit: item.unidad } ];
                            if(history.length > 10) history.shift();
                            updates.priceHistory = history;
                        }
                        
                        batch.update(matRef, updates);
                    }
                }
            }
            } // end if materia_prima

            await batch.commit();
            setShowSuccessModal(true);
            setTicketItems([]);
            setPriceConflicts([]);
            setTicketName("");

            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            setTicketDate(now.toISOString().split('T')[0]);
            setTicketType("materia_prima");

        } catch (error) {
            console.error(error);
            alert("Error al guardar el ticket.");
        }
    };

    const bigInputStyle = {
        padding: '12px',
        fontSize: '18px',
        borderRadius: '6px',
        border: '1px solid #94a3b8',
        width: '100%',
        boxSizing: 'border-box' as const,
        fontFamily: 'inherit'
    };

    return (
        <div className="cm-tab-content">
            <h3>Gestión de Tickets de Compra</h3>
            <p style={{ color: '#64748b', marginBottom: '20px' }}>
                Ingresa los datos de los tickets de compras manualmente.
            </p>

            <div className="cm-ai-voice-container">
                <button
                    className="cm-btn-primary"
                    style={{ background: '#3b82f6', padding: '15px 30px', fontSize: '1.2rem', marginBottom: '20px', width: 'fit-content' }}
                    onClick={() => {
                        setTicketItems([{
                            id: crypto.randomUUID(),
                            nombre: "",
                            cantidad: 0,
                            unidad: "unidad",
                            rawMaterialId: null,
                            precioEditado: 0,
                            multiplicador: 1
                        }]);
                        setTimeout(() => inputRefs.current['0_name']?.focus(), 50);
                    }}
                >
                    <FaPlus style={{ marginRight: '8px' }} /> Cargar Ticket
                </button>

                <button
                    className="cm-btn-secondary"
                    style={{ background: '#f8fafc', padding: '15px 30px', fontSize: '1.2rem', marginBottom: '20px', width: 'fit-content', marginLeft: '10px', color: '#475569', border: '1px solid #cbd5e1' }}
                    onClick={() => navigate('/editor/orders/expenses')}
                >
                    <FaList style={{ marginRight: '8px' }} /> Ver Historial de Gastos
                </button>

                {ticketItems.length > 0 && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
                        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '20px', fontFamily: '"Courier New", Courier, monospace'
                    }}>
                        <div style={{
                            background: '#fff', width: '80%', maxWidth: '1200px', maxHeight: '90vh',
                            overflowY: 'auto', padding: '40px', borderRadius: '8px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            borderTop: '20px solid #cbd5e1'
                        }}>
                            <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px dashed #94a3b8', paddingBottom: '15px' }}>
                                <h2 style={{ margin: 0, color: '#0f172a', fontWeight: 'bold', fontSize: '2rem' }}>TICKET MULTIPLE</h2>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', color: '#334155', marginTop: '10px', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <label style={{ fontWeight: 'bold' }}>FECHA:</label>
                                        <input 
                                            type="date" 
                                            value={ticketDate} 
                                            onChange={(e) => setTicketDate(e.target.value)} 
                                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '1rem', fontFamily: 'inherit' }} 
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <label style={{ fontWeight: 'bold' }}>TIPO:</label>
                                        <select 
                                            value={ticketType} 
                                            onChange={(e) => setTicketType(e.target.value)} 
                                            style={{ padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '1rem', fontFamily: 'inherit', background: '#fff' }}
                                        >
                                            <option value="materia_prima">Materia Prima</option>
                                            <option value="servicio">Servicio (Luz, agua...)</option>
                                            <option value="otro">Otro (Limpieza, resurtido...)</option>
                                        </select>
                                    </div>
                                    <span style={{ fontWeight: 'bold' }}>USUARIO: {user?.email || 'Administrador'}</span>
                                </div>
                                <div style={{ marginTop: '15px' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Nombre del proveedor o Ticket Opcional (ej. Distribuidora Ecoherederos)" 
                                        value={ticketName} 
                                        onChange={(e) => setTicketName(e.target.value)} 
                                        style={{ width: '100%', padding: '10px', fontSize: '1.2rem', borderRadius: '6px', border: '1px solid #94a3b8', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ fontSize: '1rem', color: '#16a34a', marginTop: '10px' }}>
                                    <em>Atajos:</em> <b>Tab / Flechas Der-Izq</b> para moverte entre campos, <b>Enter</b> crea otra fila hacia abajo.
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', gap: '10px' }}>
                                    <button 
                                        onClick={() => setViewMode('completo')}
                                        style={{
                                            padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', border: '1px solid #cbd5e1',
                                            background: viewMode === 'completo' ? '#3b82f6' : '#f8fafc',
                                            color: viewMode === 'completo' ? 'white' : '#475569', cursor: 'pointer'
                                        }}
                                    >
                                        Modo Completo
                                    </button>
                                    <button 
                                        onClick={() => setViewMode('simple')}
                                        style={{
                                            padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', border: '1px solid #cbd5e1',
                                            background: viewMode === 'simple' ? '#10b981' : '#f8fafc',
                                            color: viewMode === 'simple' ? 'white' : '#475569', cursor: 'pointer'
                                        }}
                                    >
                                        Modo Simple
                                    </button>
                                </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontSize: '1.2rem' }}>
                                        <th style={{ padding: '12px' }}>{ticketType === 'materia_prima' ? 'Materia Prima' : 'Concepto / Ítem'}</th>
                                        {viewMode === 'completo' && (
                                            <>
                                                <th style={{ padding: '12px', width: '12%' }}>Cantidad</th>
                                                <th style={{ padding: '12px', width: '12%' }}>Unidad</th>
                                                <th style={{ padding: '12px', width: '12%' }}>Multipl.</th>
                                            </>
                                        )}
                                        <th style={{ padding: '12px', width: '15%' }}>Precio Costo</th>
                                        <th style={{ padding: '12px', width: '15%' }}>Subtotal</th>
                                        <th style={{ padding: '12px', width: '5%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ticketItems.map((prod, idx) => (
                                        <tr key={prod.id} style={{ borderBottom: '1px dashed #e2e8f0', background: prod.rawMaterialId ? '#f8fafc' : '#f0fdf4' }}>
                                            <td style={{ padding: '12px' }}>
                                                <input 
                                                    list="all-raw-materials"
                                                    value={prod.nombre}
                                                    onChange={e => handleNameChange(idx, e.target.value)}
                                                    onKeyDown={e => handleKeyDown(e, idx, 'name')}
                                                    ref={el => { if (el) inputRefs.current[`${idx}_name`] = el }}
                                                    placeholder="Escribí el nombre..."
                                                    style={{ ...bigInputStyle, borderColor: prod.rawMaterialId ? '#cbd5e1' : '#22c55e' }}
                                                    title={prod.rawMaterialId ? "Material Existente" : "Nuevo Material (Será creado)"}
                                                />
                                            </td>
                                            {viewMode === 'completo' && (
                                                <>
                                                    <td style={{ padding: '12px' }}>
                                                        <input
                                                            type="number"
                                                            value={prod.cantidad}
                                                            onChange={e => {
                                                                const newItems = [...ticketItems];
                                                                newItems[idx].cantidad = Number(e.target.value);
                                                                setTicketItems(newItems);
                                                            }}
                                                            onKeyDown={e => handleKeyDown(e, idx, 'qty')}
                                                            ref={el => { if (el) inputRefs.current[`${idx}_qty`] = el }}
                                                            style={bigInputStyle}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        <select
                                                            value={prod.unidad}
                                                            onChange={e => {
                                                                const newItems = [...ticketItems];
                                                                newItems[idx].unidad = e.target.value;
                                                                setTicketItems(newItems);
                                                            }}
                                                            onKeyDown={e => handleKeyDown(e, idx, 'unit')}
                                                            ref={el => { if (el) inputRefs.current[`${idx}_unit`] = el }}
                                                            style={bigInputStyle}
                                                        >
                                                            <option value="g">g</option>
                                                            <option value="kg">kg</option>
                                                            <option value="ml">ml</option>
                                                            <option value="l">l</option>
                                                            <option value="unidad">un</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <span style={{ color: '#64748b', fontSize: '1.2rem', fontWeight: 'bold' }}>x</span>
                                                            <input
                                                                type="number"
                                                                value={prod.multiplicador || 1}
                                                                onChange={e => {
                                                                    const newItems = [...ticketItems];
                                                                    newItems[idx].multiplicador = Number(e.target.value);
                                                                    setTicketItems(newItems);
                                                                }}
                                                                onKeyDown={e => handleKeyDown(e, idx, 'multiplier')}
                                                                ref={el => { if (el) inputRefs.current[`${idx}_multiplier`] = el }}
                                                                style={bigInputStyle}
                                                                min="1"
                                                            />
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                            <td style={{ padding: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <span style={{ marginRight: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>$</span>
                                                    <input
                                                        type="number"
                                                        value={prod.precioEditado}
                                                        onChange={e => {
                                                            const newItems = [...ticketItems];
                                                            newItems[idx].precioEditado = Number(e.target.value);
                                                            setTicketItems(newItems);
                                                        }}
                                                        onKeyDown={e => handleKeyDown(e, idx, 'price')}
                                                        ref={el => { if (el) inputRefs.current[`${idx}_price`] = el }}
                                                        style={{ ...bigInputStyle, fontWeight: 'bold' }}
                                                    />
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>
                                                    ${((prod.precioEditado || 0) * (prod.multiplicador || 1))}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => setTicketItems(ticketItems.filter((_, i) => i !== idx))}
                                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.5rem', padding: '10px' }}
                                                    title="Eliminar fila"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <datalist id="all-raw-materials">
                                {rawMaterials.map(m => (
                                    <option key={m.id} value={m.name} />
                                ))}
                            </datalist>

                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px' }}>
                                <button
                                    onClick={() => {
                                        setTicketItems([...ticketItems, {
                                            id: crypto.randomUUID(),
                                            nombre: "",
                                            cantidad: 0,
                                            unidad: "unidad",
                                            rawMaterialId: null,
                                            precioEditado: 0,
                                            multiplicador: 1
                                        }]);
                                        setTimeout(() => inputRefs.current[`${ticketItems.length}_name`]?.focus(), 50);
                                    }}
                                    style={{
                                        background: '#f8fafc', border: '2px dashed #cbd5e1', color: '#3b82f6',
                                        padding: '15px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
                                        fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                >
                                    <FaPlus /> Añadir Fila Manual
                                </button>
                            </div>

                            {/* TOTAL TICKET */}
                            <div style={{ borderTop: '2px dashed #94a3b8', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '1.8rem', color: '#0f172a' }}>TOTAL TICKET:</span>
                                <span style={{ fontWeight: 'bold', fontSize: '2.5rem', color: '#166534' }}>
                                    ${ticketItems.reduce((sum, p) => sum + ((p.precioEditado || 0) * (p.multiplicador || 1)), 0)}
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                                <button onClick={() => { setTicketItems([]); setTicketName(""); }} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '15px 30px', fontSize: '1.2rem', fontWeight: 'bold', color: '#475569', borderRadius: '6px', cursor: 'pointer' }}>
                                    <FaTimes style={{ marginRight: '8px' }} /> Descartar
                                </button>
                                <button onClick={handleConfirmClick} style={{ background: '#0f172a', padding: '15px 40px', fontSize: '1.4rem', fontWeight: 'bold', borderRadius: '6px', border: 'none', color: 'white', cursor: 'pointer' }}>
                                    <FaCheckCircle style={{ marginRight: '8px' }} /> Confirmar y Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            {/* Price Conflicts Modal */}
            {priceConflicts.length > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
                    zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#fff', width: '90%', maxWidth: '600px',
                        padding: '30px', borderRadius: '8px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        borderTop: '5px solid #f59e0b'
                    }}>
                        <h3 style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FaList /> ¡Actualizaciones de Precio Detectadas!
                        </h3>
                        <p style={{ color: '#4b5563', marginBottom: '20px' }}>
                            Algunos productos del ticket tienen un precio diferente al costo base guardado para la misma cantidad.
                            ¿Deseas actualizar el precio de estos productos en tu inventario general?
                        </p>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
                            {priceConflicts.map((c, idx) => {
                                const cambioPct = (((c.newPrice - c.oldPrice) / c.oldPrice) * 100).toFixed(1);
                                const isSubida = c.newPrice > c.oldPrice;
                                return (
                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderBottom: '1px solid #e2e8f0', background: isSubida ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', marginBottom: '10px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={c.updatePrice}
                                            onChange={(e) => {
                                                const nw = [...priceConflicts];
                                                nw[idx].updatePrice = e.target.checked;
                                                setPriceConflicts(nw);
                                            }}
                                            style={{ width: '20px', height: '20px' }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <strong style={{ display: 'block', fontSize: '1.1rem' }}>{c.name}</strong>
                                            <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                                                Anterior: <span style={{ textDecoration: 'line-through' }}>${c.oldPrice}</span> 👉 Nuevo: <strong>${c.newPrice}</strong>
                                            </div>
                                        </div>
                                        <div style={{ color: isSubida ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                                            {isSubida ? '🔺' : '🔻'} {Math.abs(Number(cambioPct))}%
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="cm-btn-secondary" onClick={() => setPriceConflicts([])}>Volver a Editar Ticket</button>
                            <button className="cm-btn-primary" onClick={() => proceedWithCommit(priceConflicts)} style={{ background: '#10b981' }}>
                                Continuar y Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
                    zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#fff', width: '90%', maxWidth: '400px',
                        padding: '40px 30px', borderRadius: '12px', textAlign: 'center',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    }}>
                        <FaCheckCircle style={{ color: '#10b981', fontSize: '64px', marginBottom: '20px' }} />
                        <h2 style={{ color: '#0f172a', marginBottom: '10px' }}>¡Ticket Creado Exitosamente!</h2>
                        <p style={{ color: '#475569', marginBottom: '30px' }}>Los productos y el inventario han sido actualizados.</p>
                        <button className="cm-btn-primary" onClick={() => setShowSuccessModal(false)} style={{ width: '100%', padding: '12px' }}>
                            Aceptar y Continuar
                        </button>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
