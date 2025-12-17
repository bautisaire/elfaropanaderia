import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { syncChildProducts } from "../utils/stockUtils";
import { FaBoxes, FaHistory, FaEdit, FaPlus, FaMinus } from 'react-icons/fa';
import ProductSearch from './ProductSearch';
import './StockManager.css';

interface Product {
    id: string;
    nombre: string;
    stockQuantity?: number;
    stockDependency?: any;
    unitType?: 'unit' | 'weight';
    variants?: {
        name: string;
        stock: boolean;
        stockQuantity?: number;
    }[];
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
    const [activeTab, setActiveTab] = useState<'inventory' | 'history' | 'bulk'>('inventory');
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Modal State
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedVariantIdx, setSelectedVariantIdx] = useState<number | null>(null);
    const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT'>('IN');
    const [amount, setAmount] = useState<string>('');
    const [reason, setReason] = useState<string>('Elaboración');
    const [observation, setObservation] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [bulkUpdates, setBulkUpdates] = useState<Record<string, number>>({});
    const [bulkReason, setBulkReason] = useState<string>("Compra a Proveedor");

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
        if (product.stockDependency) return; // Prevent opening for derived products
        setSelectedProduct(product);
        setSelectedVariantIdx(null);
        setAdjustmentType('IN');
        setAmount('');
        setReason('Elaboración');
        setObservation('');
        setIsModalOpen(true);
    };

    const handleSaveAdjustment = async () => {
        if (!selectedProduct || !amount || Number(amount) <= 0) return;

        const qty = Number(amount);
        let newStock = 0;
        let variants = selectedProduct.variants ? [...selectedProduct.variants] : [];
        let variantName = "";

        if (selectedVariantIdx !== null && variants.length > 0) {
            const currentStock = variants[selectedVariantIdx].stockQuantity || 0;
            newStock = adjustmentType === 'IN' ? currentStock + qty : currentStock - qty;
            newStock = Math.round(newStock * 1000) / 1000;
            variants[selectedVariantIdx].stockQuantity = newStock;
            // Ensure stock bool matches
            variants[selectedVariantIdx].stock = newStock > 0;
            variantName = variants[selectedVariantIdx].name;
        } else {
            const currentStock = selectedProduct.stockQuantity || 0;
            newStock = adjustmentType === 'IN' ? currentStock + qty : currentStock - qty;
            newStock = Math.round(newStock * 1000) / 1000;
        }

        if (newStock < 0) {
            alert("El stock no puede ser negativo.");
            return;
        }

        try {
            // 1. Update Product
            if (selectedVariantIdx !== null && variants.length > 0) {
                await updateDoc(doc(db, "products", selectedProduct.id), { variants });
            } else {
                await updateDoc(doc(db, "products", selectedProduct.id), { stockQuantity: newStock });
                // Sync Children
                await syncChildProducts(selectedProduct.id, newStock);
            }

            // 2. Log Movement
            await addDoc(collection(db, "stock_movements"), {
                productId: selectedProduct.id,
                productName: selectedProduct.nombre,
                type: adjustmentType,
                quantity: qty,
                reason: reason,
                observation: observation + (variantName ? ` (Var: ${variantName})` : ''),
                date: new Date()
            });

            alert("Stock actualizado correctamente.");
            setIsModalOpen(false);
            fetchProducts();
        } catch (error) {
            console.error("Error saving stock adjustment:", error);
            alert("Error al actualizar stock.");
        }
    };

    // Bulk Update Logic
    const handleBulkChange = (id: string, value: string) => {
        let val = Number(value);
        val = Math.round(val * 1000) / 1000;
        setBulkUpdates(prev => {
            if (val <= 0) {
                const copy = { ...prev };
                delete copy[id];
                return copy;
            }
            return { ...prev, [id]: val };
        });
    };

    const handleBulkSave = async () => {
        const entries = Object.entries(bulkUpdates);
        if (entries.length === 0) return alert("No hay cambios para guardar.");
        if (!window.confirm(`¿Confirmar carga masiva de ${entries.length} items?`)) return;

        setLoading(true);
        try {
            for (const [key, qty] of entries) {
                // Key format: "productId" or "productId-variantIndex"
                const [prodId, varIdxStr] = key.split('-');
                const product = products.find(p => p.id === prodId);
                if (!product) continue;

                if (varIdxStr !== undefined) {
                    // Variant Update
                    const varIdx = Number(varIdxStr);
                    const variants = [...(product.variants || [])];
                    if (variants[varIdx]) {
                        const current = variants[varIdx].stockQuantity || 0;
                        variants[varIdx].stockQuantity = current + qty;
                        variants[varIdx].stock = (current + qty) > 0;

                        await updateDoc(doc(db, "products", prodId), { variants });

                        await addDoc(collection(db, "stock_movements"), {
                            productId: prodId,
                            productName: product.nombre,
                            type: 'IN',
                            quantity: qty,
                            reason: bulkReason,
                            observation: `Carga Masiva (Var: ${variants[varIdx].name})`,
                            date: new Date()
                        });
                    }
                } else {
                    // Simple Product Update
                    const current = product.stockQuantity || 0;
                    const newStock = current + qty;
                    await updateDoc(doc(db, "products", prodId), { stockQuantity: newStock });

                    // Sync Children
                    await syncChildProducts(prodId, newStock);

                    await addDoc(collection(db, "stock_movements"), {
                        productId: prodId,
                        productName: product.nombre,
                        type: 'IN',
                        quantity: qty,
                        reason: bulkReason,
                        observation: `Carga Masiva`,
                        date: new Date()
                    });
                }
            }

            setBulkUpdates({});
            alert("Carga masiva completada exitosamente.");
            fetchProducts();
        } catch (error) {
            console.error("Error in bulk update:", error);
            alert("Error durante la carga masiva. Revise la consola.");
        } finally {
            setLoading(false);
        }
    };

    const reasonsIn = ["Elaboración", "Compra a Proveedor", "Devolución", "Ajuste de Inventario"];
    const reasonsOut = ["Venta Local", "Merma/Desperdicio", "Consumo Interno", "Ajuste de Inventario", "Vencimiento"];

    // Filter Logic
    const filteredProducts = products.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.variants && p.variants.some(v => v.name.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    return (
        <div className="stock-manager">
            <h2>Gestión de Stock</h2>

            <div className="stock-controls-row" style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div className="stock-tabs" style={{ marginBottom: 0 }}>
                    <button
                        className={`stock-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                        onClick={() => setActiveTab('inventory')}
                    >
                        <FaBoxes /> Inventario
                    </button>
                    <button
                        className={`stock-tab-btn ${activeTab === 'bulk' ? 'active' : ''}`}
                        onClick={() => setActiveTab('bulk')}
                    >
                        <FaPlus /> Carga Masiva
                    </button>
                    <button
                        className={`stock-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <FaHistory /> Historial
                    </button>
                </div>

                {(activeTab === 'inventory' || activeTab === 'bulk') && (
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <ProductSearch
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder={activeTab === 'bulk' ? "Buscar para carga masiva..." : "Buscar en inventario..."}
                        />
                    </div>
                )}
            </div>

            {loading && <p>Cargando...</p>}

            {/* TAB INVENTARIO */}
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
                            {filteredProducts.map(p => {
                                const totalStock = (p.variants && p.variants.length > 0)
                                    ? Math.round(p.variants.reduce((acc, v) => acc + (v.stockQuantity || 0), 0) * 1000) / 1000
                                    : (p.stockQuantity || 0);

                                const isWeight = p.unitType === 'weight';
                                const stockLabel = totalStock + (isWeight ? ' kg' : '');
                                const isLowStock = isWeight ? totalStock < 1 : totalStock < 5;

                                return (
                                    <tr key={p.id}>
                                        <td data-label="Producto">
                                            {p.nombre}
                                            {p.stockDependency && <span className="pill-derived"> (Derivado)</span>}
                                        </td>
                                        <td data-label="Stock Actual">
                                            <span className={`stock-number ${isLowStock ? 'low-stock' : 'good-stock'}`}>
                                                {stockLabel}
                                                {(p.variants && p.variants.length > 0) && <span style={{ fontSize: '0.8em', color: '#666' }}> (Total Vars)</span>}
                                            </span>
                                        </td>
                                        <td data-label="Acciones">
                                            {p.stockDependency ? (
                                                <button className="btn-adjust disabled" disabled title="Stock automático">
                                                    <FaEdit /> Auto
                                                </button>
                                            ) : (
                                                <button className="btn-adjust" onClick={() => openAdjustmentModal(p)}>
                                                    <FaEdit /> Ajustar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                        No se encontraron productos.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB CARGA MASIVA */}
            {activeTab === 'bulk' && !loading && (
                <div className="stock-bulk-container">
                    <div className="bulk-header">
                        <label>Motivo de la carga:</label>
                        <select value={bulkReason} onChange={e => setBulkReason(e.target.value)} className="bulk-reason-select">
                            {reasonsIn.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button className="btn-save-bulk" onClick={handleBulkSave}>
                            Guardar Carga ({Object.keys(bulkUpdates).length})
                        </button>
                    </div>

                    <div className="stock-table-container">
                        <table className="stock-table">
                            <thead>
                                <tr>
                                    <th>Producto / Variante</th>
                                    <th>Stock Actual</th>
                                    <th>Agregar Cantidad (+)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map(p => {
                                    // If product has variants, render a row for each variant
                                    if (p.variants && p.variants.length > 0) {
                                        return p.variants.map((v, idx) => (
                                            <tr key={`${p.id}-${idx}`}>
                                                <td data-label="Producto">
                                                    <strong>{p.nombre}</strong> <br />
                                                    <span className="text-sm text-gray">{v.name}</span>
                                                </td>
                                                <td data-label="Stock Actual">{v.stockQuantity || 0}</td>
                                                <td data-label="Agregar">
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        min="0"
                                                        placeholder="0"
                                                        className="bulk-input"
                                                        value={bulkUpdates[`${p.id}-${idx}`] || ''}
                                                        onChange={e => handleBulkChange(`${p.id}-${idx}`, e.target.value)}
                                                    />
                                                </td>
                                            </tr>
                                        ));
                                    } else {
                                        // Simple product row
                                        return (
                                            <tr key={p.id}>
                                                <td data-label="Producto">
                                                    <strong>{p.nombre}</strong>
                                                    {p.stockDependency && <span className="text-xs-gray"> (Calc. Auto)</span>}
                                                </td>
                                                <td data-label="Stock Actual">{p.stockQuantity || 0}</td>
                                                <td data-label="Agregar">
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        min="0"
                                                        placeholder={p.stockDependency ? "Auto" : "0"}
                                                        className="bulk-input"
                                                        value={bulkUpdates[p.id] || ''}
                                                        onChange={e => handleBulkChange(p.id, e.target.value)}
                                                        disabled={!!p.stockDependency}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    }
                                })}
                                {filteredProducts.length === 0 && (
                                    <tr>
                                        <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                            No se encontraron productos.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB HISTORIAL */}
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
                            {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                                <div className="stock-form-group">
                                    <label>Seleccionar Variante</label>
                                    <select
                                        value={selectedVariantIdx ?? ''}
                                        onChange={e => setSelectedVariantIdx(Number(e.target.value))}
                                        className="stock-select"
                                    >
                                        <option value="" disabled>-- Elige una variante --</option>
                                        {selectedProduct.variants.map((v, idx) => (
                                            <option key={idx} value={idx}>
                                                {v.name} (Stock: {v.stockQuantity || 0})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

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
                                    step="0.001"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0.000"
                                    min="0.001"
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
