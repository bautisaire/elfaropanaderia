import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { FaBoxes, FaHistory, FaEdit, FaPlus, FaMinus } from 'react-icons/fa';
import './StockManager.css';

interface Product {
    id: string;
    nombre: string;
    stockQuantity?: number; // Numeric stock
}

interface StockMovement {
    id?: string;
    productId: string;
    productName: string;
    type: 'IN' | 'OUT';
    quantity: number;
    reason: string;
    observation: string;
    date: any; // Timestamp
}

export default function StockManager() {
    const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT'>('IN');
    const [amount, setAmount] = useState<string>('');
    const [reason, setReason] = useState<string>('Elaboración');
    const [observation, setObservation] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchProducts();
    }, []);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab]);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const prods = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Product[];
            setProducts(prods);
        } catch (error) {
            console.error("Error fetching products:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, "stock_movements"),
                orderBy("date", "desc"),
                limit(50)
            );
            const querySnapshot = await getDocs(q);
            const moves = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as StockMovement[];
            setMovements(moves);
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoading(false);
        }
    };

    const openAdjustmentModal = (product: Product) => {
        setSelectedProduct(product);
        setAdjustmentType('IN');
        setAmount('');
        setReason('Elaboración');
        setObservation('');
        setIsModalOpen(true);
    };

    const handleSaveAdjustment = async () => {
        if (!selectedProduct || !amount || Number(amount) <= 0) return;

        const qty = Number(amount);
        const currentStock = selectedProduct.stockQuantity || 0;
        const newStock = adjustmentType === 'IN' ? currentStock + qty : currentStock - qty;

        if (newStock < 0) {
            alert("El stock no puede ser negativo.");
            return;
        }

        try {
            // 1. Update Product Stock
            await updateDoc(doc(db, "products", selectedProduct.id), {
                stockQuantity: newStock
            });

            // 2. Log Movement
            await addDoc(collection(db, "stock_movements"), {
                productId: selectedProduct.id,
                productName: selectedProduct.nombre,
                type: adjustmentType,
                quantity: qty,
                reason: reason,
                observation: observation,
                date: new Date()
            });

            alert("Stock actualizado correctamente.");
            setIsModalOpen(false);
            fetchProducts(); // Refresh list
        } catch (error) {
            console.error("Error saving stock adjustment:", error);
            alert("Error al actualizar stock.");
        }
    };

    const reasonsIn = ["Elaboración", "Compra a Proveedor", "Devolución", "Ajuste de Inventario"];
    const reasonsOut = ["Venta Local", "Merma/Desperdicio", "Consumo Interno", "Ajuste de Inventario", "Vencimiento"];

    return (
        <div className="stock-manager">
            <h2>Gestión de Stock</h2>

            <div className="stock-tabs">
                <button
                    className={`stock-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inventory')}
                >
                    <FaBoxes /> Inventario
                </button>
                <button
                    className={`stock-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    <FaHistory /> Historial de Movimientos
                </button>
            </div>

            {loading && <p>Cargando...</p>}

            {activeTab === 'inventory' && !loading && (
                <div className="stock-table-container">
                    <table className="stock-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Stock Actual</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(p => (
                                <tr key={p.id}>
                                    <td>{p.nombre}</td>
                                    <td>
                                        <span className={`stock-number ${(p.stockQuantity || 0) < 5 ? 'low-stock' : 'good-stock'}`}>
                                            {p.stockQuantity || 0}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="btn-adjust" onClick={() => openAdjustmentModal(p)}>
                                            <FaEdit /> Ajustar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'history' && !loading && (
                <div className="history-list">
                    {movements.length === 0 && <p>No hay movimientos registrados.</p>}
                    {movements.map(m => (
                        <div key={m.id} className={`movement-item type-${m.type}`}>
                            <div>
                                <strong>{m.productName}</strong>
                                <div className="movement-meta">
                                    {new Date(m.date.seconds * 1000).toLocaleString()} - {m.reason}
                                </div>
                                {m.observation && <div className="movement-meta">"{m.observation}"</div>}
                            </div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                {m.type === 'IN' ? '+' : '-'}{m.quantity}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Adjustment Modal */}
            {isModalOpen && selectedProduct && (
                <div className="stock-modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="stock-modal" onClick={e => e.stopPropagation()}>
                        <h3>Ajustar Stock: {selectedProduct.nombre}</h3>

                        <div className="stock-modal-form">
                            <div className="stock-form-group">
                                <label>Tipo de movimiento</label>
                                <div className="stock-action-type">
                                    <button
                                        className={`action-btn add ${adjustmentType === 'IN' ? 'selected' : ''}`}
                                        onClick={() => setAdjustmentType('IN')}
                                    >
                                        <FaPlus /> Añadir (Entrada)
                                    </button>
                                    <button
                                        className={`action-btn subtract ${adjustmentType === 'OUT' ? 'selected' : ''}`}
                                        onClick={() => setAdjustmentType('OUT')}
                                    >
                                        <FaMinus /> Restar (Salida)
                                    </button>
                                </div>
                            </div>

                            <div className="stock-form-group">
                                <label>Cantidad</label>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0"
                                    min="1"
                                />
                            </div>

                            <div className="stock-form-group">
                                <label>Motivo</label>
                                <select value={reason} onChange={e => setReason(e.target.value)}>
                                    {(adjustmentType === 'IN' ? reasonsIn : reasonsOut).map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="stock-form-group">
                                <label>Observación (Opcional)</label>
                                <textarea
                                    value={observation}
                                    onChange={e => setObservation(e.target.value)}
                                    placeholder="Comentarios adicionales..."
                                    rows={3}
                                />
                            </div>

                            <div className="modal-actions">
                                <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button className="btn-save-stock" onClick={handleSaveAdjustment}>Guardar Movimiento</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
