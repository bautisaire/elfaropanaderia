import { useState, useRef } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { FaTimes, FaCheckCircle, FaTrash, FaPlus } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { RawMaterial } from './CostManager';

interface VoiceAIPurchasesProps {
    rawMaterials: RawMaterial[];
}

export default function VoiceAIPurchases({ rawMaterials }: VoiceAIPurchasesProps) {
    const { user } = useAuth();
    const [ticketItems, setTicketItems] = useState<any[]>([]);
    
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
                precioEditado: 0
            }]);
            setTimeout(() => {
                const nextId = `${ticketItems.length}_name`;
                inputRefs.current[nextId]?.focus();
            }, 50);
            return;
        }

        const fields = ['name', 'qty', 'unit', 'price'];
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

        setTicketItems(newItems);
    };

    const confirmTicket = async () => {
        if (ticketItems.length === 0) return;

        const invalidItems = ticketItems.filter(i => !i.nombre.trim());
        if (invalidItems.length > 0) return alert("Hay filas con nombres vacíos.");

        try {
            const batch = writeBatch(db);

            // Create ticket
            const ticketRef = doc(collection(db, "expenses"));
            let totalAmount = 0;

            const itemsToSave = ticketItems.map(item => {
                totalAmount += item.precioEditado || 0;
                return {
                    name: item.nombre,
                    quantity: item.cantidad,
                    unit: item.unidad,
                    price: item.precioEditado,
                    materialId: item.rawMaterialId,
                    subtotal: item.precioEditado
                };
            });

            batch.set(ticketRef, {
                date: Timestamp.now(),
                type: "materia_prima",
                description: "Carga de Tickets",
                totalAmount: totalAmount,
                items: itemsToSave,
                createdByEmail: user?.email || "admin",
            });

            // Update or Create Raw Materials
            for (const item of ticketItems) {
                // Determine if we need to base convert exactly like the user edits manually
                const isNew = !item.rawMaterialId;
                
                if (isNew) {
                    const newMatRef = doc(collection(db, "raw_materials"));
                    batch.set(newMatRef, {
                        name: item.nombre.trim(),
                        unit: item.unidad,
                        baseQuantity: item.cantidad > 0 ? item.cantidad : 1000, 
                        price: item.precioEditado,
                        currentPrice: item.precioEditado,
                        stockQuantity: item.cantidad,
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
                        // Standard conversion
                        let qtyAddedToStock = item.cantidad;
                        if (item.unidad === 'kg' && matData.unit === 'g') qtyAddedToStock *= 1000;
                        else if (item.unidad === 'l' && matData.unit === 'ml') qtyAddedToStock *= 1000;
                        
                        const currentStock = (matData as any).stockQuantity || 0;
                        const newStock = currentStock + qtyAddedToStock;
                        let history = matData.priceHistory || [];
                        
                        batch.update(matRef, {
                            stockQuantity: newStock,
                            // we just overwrite currentPrice and base price logic for simplicity
                            currentPrice: item.precioEditado,
                            price: item.precioEditado,
                            priceHistory: history,
                            lastUpdated: Timestamp.now()
                        });
                    }
                }
            }

            await batch.commit();
            alert("¡Ticket guardado con éxito! Se han actualizado/creado los productos.");
            setTicketItems([]);
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
                            precioEditado: 0
                        }]);
                        setTimeout(() => inputRefs.current['0_name']?.focus(), 50);
                    }}
                >
                    <FaPlus style={{ marginRight: '8px' }} /> Cargar Ticket
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', color: '#334155', marginTop: '10px' }}>
                                    <span>FECHA: {new Date().toLocaleDateString()}</span>
                                    <span>USUARIO: {user?.email || 'Administrador'}</span>
                                </div>
                                <div style={{ fontSize: '1rem', color: '#16a34a', marginTop: '10px' }}>
                                    <em>Atajos:</em> <b>Tab / Flechas Der-Izq</b> para moverte entre campos, <b>Enter</b> crea otra fila hacia abajo.
                                </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontSize: '1.2rem' }}>
                                        <th style={{ padding: '12px' }}>Materia Prima</th>
                                        <th style={{ padding: '12px', width: '15%' }}>Cantidad</th>
                                        <th style={{ padding: '12px', width: '15%' }}>Unidad</th>
                                        <th style={{ padding: '12px', width: '20%' }}>Precio Total</th>
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
                                            precioEditado: 0
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
                                    ${ticketItems.reduce((sum, p) => sum + (p.precioEditado || 0), 0)}
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                                <button onClick={() => setTicketItems([])} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '15px 30px', fontSize: '1.2rem', fontWeight: 'bold', color: '#475569', borderRadius: '6px', cursor: 'pointer' }}>
                                    <FaTimes style={{ marginRight: '8px' }} /> Descartar
                                </button>
                                <button onClick={confirmTicket} style={{ background: '#0f172a', padding: '15px 40px', fontSize: '1.4rem', fontWeight: 'bold', borderRadius: '6px', border: 'none', color: 'white', cursor: 'pointer' }}>
                                    <FaCheckCircle style={{ marginRight: '8px' }} /> Confirmar y Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
