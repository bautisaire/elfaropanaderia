import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { FaPlus, FaTrash, FaSave, FaChartPie, FaEdit, FaTimes } from 'react-icons/fa';
import './CostManager.css'; // Reusing styles

interface CifItem {
    id?: string;
    name: string;
    price: number;
    lifeYears: number | null; 
    isSalary?: boolean;
}

export default function CifManager() {
    const [cifItems, setCifItems] = useState<CifItem[]>([]);
    const [monthlyUnits, setMonthlyUnits] = useState<number>(0);
    const [cifUnitCost, setCifUnitCost] = useState<number>(0);

    const [newItem, setNewItem] = useState<Partial<CifItem>>({ name: '', price: 0, lifeYears: null, isSalary: false });
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editItemData, setEditItemData] = useState<Partial<CifItem>>({ name: '', price: 0, lifeYears: null, isSalary: false });

    useEffect(() => {
        const unsubItems = onSnapshot(collection(db, 'cif_items'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CifItem));
            setCifItems(data);
        });

        const unsubConfig = onSnapshot(doc(db, 'config', 'cif_settings'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setMonthlyUnits(data.monthlyUnits || 0);
                setCifUnitCost(data.cifUnitCost || 0);
            }
        });

        return () => {
            unsubItems();
            unsubConfig();
        };
    }, []);

    // Calculate aggregated metrics
    const totalMonthlyCost = cifItems.reduce((acc, item) => {
        if (item.lifeYears && item.lifeYears > 0) {
            // Depreciación: (Precio / Años) / 12 meses
            return acc + ((item.price / item.lifeYears) / 12);
        } else {
            // Es un pago directo mensual
            return acc + item.price;
        }
    }, 0);

    const currentCalculatedCifUnitCost = monthlyUnits > 0 ? (totalMonthlyCost / monthlyUnits) : 0;

    // Actualiza y guarda en Firestore si detecta cambios entre el total calculado y el guardado.
    useEffect(() => {
        const saveUpdatedCif = async () => {
            if (Math.abs(currentCalculatedCifUnitCost - cifUnitCost) > 0.01) {
                try {
                    await setDoc(doc(db, 'config', 'cif_settings'), {
                        monthlyUnits,
                        cifUnitCost: currentCalculatedCifUnitCost
                    }, { merge: true });
                } catch (err) {
                    console.error("Error saving CIF settings auto", err);
                }
            }
        };

        const timeout = setTimeout(saveUpdatedCif, 1000); // debounce of 1s
        return () => clearTimeout(timeout);
    }, [totalMonthlyCost, monthlyUnits, cifUnitCost, currentCalculatedCifUnitCost]);

    const handleSaveConfig = async () => {
        setIsSavingConfig(true);
        try {
            await setDoc(doc(db, 'config', 'cif_settings'), {
                monthlyUnits,
                cifUnitCost: currentCalculatedCifUnitCost
            }, { merge: true });
            alert("Configuración de unidades guardada exitosamente.");
        } catch (error) {
            console.error("Error al guardar cif_settings:", error);
            alert("Error al guardar configuración.");
        } finally {
            setIsSavingConfig(false);
        }
    };


    const handleAddItem = async () => {
        if (!newItem.name || (newItem.price || 0) <= 0) {
            return alert("El nombre y precio son requeridos.");
        }
        try {
            await addDoc(collection(db, 'cif_items'), {
                name: newItem.name,
                price: newItem.price,
                lifeYears: newItem.lifeYears && newItem.lifeYears > 0 ? newItem.lifeYears : null,
                isSalary: !!newItem.isSalary
            });
            setNewItem({ name: '', price: 0, lifeYears: null, isSalary: false });
        } catch (error) {
            console.error(error);
            alert("Error al añadir ítem CIF.");
        }
    };

    const handleUpdateItem = async () => {
        if (!editingItemId || !editItemData.name || (editItemData.price || 0) <= 0) return alert("Nombre y Precio requerido.");
        try {
            await updateDoc(doc(db, 'cif_items', editingItemId), {
                name: editItemData.name,
                price: editItemData.price,
                lifeYears: editItemData.lifeYears && editItemData.lifeYears > 0 ? editItemData.lifeYears : null,
                isSalary: !!editItemData.isSalary
            });
            setEditingItemId(null);
            setEditItemData({ name: '', price: 0, lifeYears: null, isSalary: false });
        } catch (error) {
            console.error(error);
            alert("Error al actualizar ítem CIF.");
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (confirm("¿Estás seguro de eliminar este ítem? Esto alterará el costo CIF actual.")) {
            await deleteDoc(doc(db, 'cif_items', id));
        }
    };

    return (
        <div className="cm-tab-content">
            <h3>Gastos Fijos y Maquinarias (CIF)</h3>
            <p style={{ color: '#64748b', marginBottom: '20px' }}>
                Añade recursos que contribuyen a la producción de manera indirecta. Las máquinas se depreciarán automáticamente, mientras que gastos como "Alquiler" se tomarán como un costo mensual directo si lo dejas sin años de vida.
            </p>

            <div className="cm-add-bar" style={{ background: '#f8fafc', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Ej. Sobadora / Alquiler"
                    style={{ flex: '1 1 200px' }}
                    value={newItem.name || ''}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
                
                <div className="cm-input-group">
                    <span className="currency-symbol" style={{background: '#fff', borderRight: 'none'}}>$</span>
                    <input
                        type="number"
                        placeholder="Precio/Costo"
                        style={{ width: '130px', borderLeft: 'none', paddingLeft: '5px' }}
                        value={newItem.price || ''}
                        onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                    />
                </div>
                
                <input
                    type="number"
                    placeholder="Años de vida (vacío si es mensual)"
                    style={{ flex: '1 1 200px' }}
                    value={newItem.lifeYears || ''}
                    onChange={(e) => setNewItem({ ...newItem, lifeYears: Number(e.target.value) })}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', color: '#475569', minWidth: '150px' }}>
                    <input 
                        type="checkbox" 
                        checked={!!newItem.isSalary}
                        onChange={(e) => setNewItem({ ...newItem, isSalary: e.target.checked })}
                    />
                    Es Sueldo (Excluir del fondo neto CIF)
                </label>

                <button className="cm-btn-primary" onClick={handleAddItem}>
                    <FaPlus /> Añadir
                </button>
            </div>

            <div className="cm-table-container">
                <table className="cm-table">
                    <thead>
                        <tr>
                            <th>Concepto</th>
                            <th>Es Sueldo</th>
                            <th>Precio Total</th>
                            <th>Vida Útil</th>
                            <th>Cost. Mensual</th>
                            <th>Cost. Diario</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cifItems.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>No hay gastos fijos registrados.</td></tr>
                        ) : cifItems.sort((a, b) => b.price - a.price).map(item => {
                            let monthly = item.price;
                            let daily = item.price / 30; // Promedio 30 dias
                            
                            if (item.lifeYears && item.lifeYears > 0) {
                                monthly = (item.price / item.lifeYears) / 12;
                                daily = monthly / 30;
                            }

                            if (editingItemId === item.id) {
                                return (
                                    <tr key={item.id} style={{ background: '#f0f9ff' }}>
                                        <td>
                                            <input type="text" value={editItemData.name || ''} onChange={e => setEditItemData({...editItemData, name: e.target.value})} style={{width: '100%', padding: '5px'}}/>
                                        </td>
                                        <td>
                                            <input type="checkbox" checked={!!editItemData.isSalary} onChange={e => setEditItemData({...editItemData, isSalary: e.target.checked})}/>
                                        </td>
                                        <td>
                                            <input type="number" value={editItemData.price || ''} onChange={e => setEditItemData({...editItemData, price: Number(e.target.value)})} style={{width: '80px', padding: '5px'}}/>
                                        </td>
                                        <td>
                                            <input type="number" placeholder="n/a si es mensual" value={editItemData.lifeYears || ''} onChange={e => setEditItemData({...editItemData, lifeYears: Number(e.target.value)})} style={{width: '80px', padding: '5px'}}/>
                                        </td>
                                        <td colSpan={2} style={{ color: '#059669', fontSize: '0.85rem' }}>
                                            Editando...
                                        </td>
                                        <td style={{ display: 'flex', gap: '5px' }}>
                                            <button className="cm-icon-btn edit" style={{ color: '#059669' }} onClick={handleUpdateItem}><FaSave /></button>
                                            <button className="cm-icon-btn delete" onClick={() => setEditingItemId(null)}><FaTimes /></button>
                                        </td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={item.id}>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.isSalary ? 'Sí' : 'No'}</td>
                                    <td>${item.price.toLocaleString('es-AR')}</td>
                                    <td>
                                        {item.lifeYears ? `${item.lifeYears} años` : <span style={{color: '#64748b'}}>Gasto Mensual</span>}
                                    </td>
                                    <td style={{ color: '#059669', fontWeight: 'bold' }}>
                                        ${Math.round(monthly).toLocaleString('es-AR')}
                                    </td>
                                    <td>${Math.round(daily).toLocaleString('es-AR')}</td>
                                    <td style={{ display: 'flex', gap: '5px' }}>
                                        <button className="cm-icon-btn edit" onClick={() => { setEditingItemId(item.id!); setEditItemData(item); }}><FaEdit /></button>
                                        <button className="cm-icon-btn delete" onClick={() => handleDeleteItem(item.id!)}><FaTrash /></button>
                                    </td>
                                </tr>
                            );
                        })}
                        <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                                    <td colSpan={4} style={{ textAlign: 'right' }}>Total de Gastos Mensuales Calculados:</td>
                                    <td colSpan={3} style={{ color: '#0f172a', fontSize: '1.2rem' }}>
                                        ${Math.round(totalMonthlyCost).toLocaleString('es-AR')}
                                    </td>
                                </tr>
                    </tbody>
                </table>
            </div>

            {/* PANEL DE CÁLCULO DE UNIDADES CIF */}
            <div style={{ marginTop: '30px', background: '#ecfdf5', padding: '20px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <FaChartPie color="#059669" size={24} />
                    <h3 style={{ margin: 0, color: '#065f46' }}>Asignación de Costo CIF por Producto</h3>
                </div>
                <p style={{ color: '#064e3b', fontSize: '0.9rem', marginBottom: '20px' }}>
                    Indica cuántas "unidades" de productos equivalentes a 100 gramos planeas o promedias vender en el mes. 
                    El sistema tomará todos tus gastos fijos (alquiler, depreciación, etc.) y los dividirá por esta cantidad para saber cuánto agregar como "micro-costo fijo" a tus futuras recetas.
                </p>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#065f46' }}>Productos mensuales (unidades de 100g)</label>
                        <input
                            type="number"
                            value={monthlyUnits}
                            onChange={e => setMonthlyUnits(Number(e.target.value))}
                            style={{ padding: '10px', width: '100%', border: '1px solid #6ee7b7', borderRadius: '4px', fontSize: '1.1rem' }}
                        />
                    </div>
                    
                    <button className="cm-btn-primary" onClick={handleSaveConfig} disabled={isSavingConfig} style={{ background: '#059669', padding: '10px 20px', height: 'fit-content' }}>
                        <FaSave /> {isSavingConfig ? 'Guardando...' : 'Fijar Unidades'}
                    </button>
                </div>

                <div style={{ marginTop: '20px', background: '#fff', padding: '15px', borderRadius: '6px', textAlign: 'center', border: '1px solid #d1fae5' }}>
                    <span style={{ fontSize: '1rem', color: '#64748b' }}>Costo CIF estimado por cada 100 gramos:</span>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#047857' }}>
                        ${currentCalculatedCifUnitCost.toFixed(2)}
                    </div>
                </div>

            </div>
        </div>
    );
}
