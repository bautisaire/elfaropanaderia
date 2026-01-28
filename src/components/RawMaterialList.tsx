import { useState, useEffect } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy } from "firebase/firestore";
import { FaTrash, FaEdit, FaHistory, FaPlus, FaSave } from "react-icons/fa";
import "./ProductManager.css"; // Reusing existing styles for consistency

export default function RawMaterialList() {
    const [materials, setMaterials] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
    const [editingMaterial, setEditingMaterial] = useState<any>(null); // For Add/Edit form
    const [priceHistory, setPriceHistory] = useState<any[]>([]);

    // Fetch Materials
    useEffect(() => {
        const q = query(collection(db, "raw_materials"), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMaterials(data);
        });
        return () => unsubscribe();
    }, []);

    const handleSave = async () => {
        try {
            if (editingMaterial.id) {
                // Update
                const ref = doc(db, "raw_materials", editingMaterial.id);

                // Check if price changed to record history
                const oldMaterial = materials.find(m => m.id === editingMaterial.id);
                let history = oldMaterial.priceHistory || [];

                if (oldMaterial.currentPrice !== editingMaterial.currentPrice) {
                    history.push({
                        date: Timestamp.now(),
                        price: Number(oldMaterial.currentPrice)
                    });
                }

                await updateDoc(ref, {
                    name: editingMaterial.name,
                    unit: editingMaterial.unit,
                    currentPrice: Number(editingMaterial.currentPrice),
                    stockQuantity: Number(editingMaterial.stockQuantity),
                    priceHistory: history
                });
            } else {
                // Create
                await addDoc(collection(db, "raw_materials"), {
                    name: editingMaterial.name,
                    unit: editingMaterial.unit,
                    currentPrice: Number(editingMaterial.currentPrice),
                    stockQuantity: Number(editingMaterial.stockQuantity) || 0,
                    priceHistory: []
                });
            }
            setIsModalOpen(false);
            setEditingMaterial(null);
        } catch (error) {
            console.error("Error saving material:", error);
            alert("Error al guardar materia prima");
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta materia prima?")) return;
        try {
            await deleteDoc(doc(db, "raw_materials", id));
        } catch (error) {
            console.error("Error deleting material:", error);
        }
    };

    const openHistory = (material: any) => {
        setSelectedMaterial(material);
        // Sort history by date descending
        const history = material.priceHistory ? [...material.priceHistory].sort((a: any, b: any) => b.date.seconds - a.date.seconds) : [];
        setPriceHistory(history);
        setIsHistoryModalOpen(true);
    };

    return (
        <div className="product-manager-container">
            <div className="pm-header">
                <h2>Gestión de Materia Prima</h2>
                <button className="add-btn" onClick={() => { setEditingMaterial({ unit: 'kg', currentPrice: 0, stockQuantity: 0 }); setIsModalOpen(true); }}>
                    <FaPlus /> Nueva Materia Prima
                </button>
            </div>

            <div className="pm-table-container">
                <table className="pm-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Unidad</th>
                            <th>Stock</th>
                            <th>Precio Actual</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {materials.map((m) => (
                            <tr key={m.id}>
                                <td>{m.name}</td>
                                <td>{m.unit}</td>
                                <td>{m.stockQuantity}</td>
                                <td>${m.currentPrice}</td>
                                <td>
                                    <button className="action-btn edit" onClick={() => { setEditingMaterial(m); setIsModalOpen(true); }}>
                                        <FaEdit />
                                    </button>
                                    <button className="action-btn history" onClick={() => openHistory(m)} title="Ver Historial">
                                        <FaHistory />
                                    </button>
                                    <button className="action-btn delete" onClick={() => handleDelete(m.id)}>
                                        <FaTrash />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>{editingMaterial.id ? 'Editar' : 'Nueva'} Materia Prima</h3>
                        <div className="form-group">
                            <label>Nombre:</label>
                            <input
                                type="text"
                                value={editingMaterial.name || ''}
                                onChange={e => setEditingMaterial({ ...editingMaterial, name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Unidad:</label>
                            <select
                                value={editingMaterial.unit || 'kg'}
                                onChange={e => setEditingMaterial({ ...editingMaterial, unit: e.target.value })}
                            >
                                <option value="kg">Kilogramos (kg)</option>
                                <option value="g">Gramos (g)</option>
                                <option value="l">Litros (l)</option>
                                <option value="ml">Mililitros (ml)</option>
                                <option value="u">Unidades (u)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Stock Inicial:</label>
                            <input
                                type="number"
                                value={editingMaterial.stockQuantity}
                                onChange={e => setEditingMaterial({ ...editingMaterial, stockQuantity: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Precio Actual (por unidad):</label>
                            <input
                                type="number"
                                value={editingMaterial.currentPrice}
                                onChange={e => setEditingMaterial({ ...editingMaterial, currentPrice: e.target.value })}
                            />
                        </div>

                        <div className="modal-actions">
                            <button className="cancel-btn" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                            <button className="save-btn" onClick={handleSave}><FaSave /> Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {isHistoryModalOpen && selectedMaterial && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Historial de Precios: {selectedMaterial.name}</h3>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            <table className="pm-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Precio Anterior</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {priceHistory.length === 0 ? (
                                        <tr><td colSpan={2}>No hay historial disponible.</td></tr>
                                    ) : (
                                        priceHistory.map((h: any, idx: number) => (
                                            <tr key={idx}>
                                                <td>{h.date?.seconds ? new Date(h.date.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                                                <td>${h.price}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <button className="close-btn" style={{ marginTop: '20px' }} onClick={() => setIsHistoryModalOpen(false)}>Cerrar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
