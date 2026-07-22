import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, updateDoc, addDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { syncChildProducts } from "../utils/stockUtils";
import {
    FaBoxes, FaHistory, FaEdit, FaPlus, FaFileExport, FaExchangeAlt,
    FaCashRegister, FaGlobe, FaTruck, FaIndustry, FaUndo, FaBalanceScale, FaBan, FaRedo, FaTrashAlt
} from 'react-icons/fa';
import ProductSearch from './ProductSearch';
import './StockManager.css';
import StockAdjustmentModal from './StockAdjustmentModal';

const REASON_META: Record<string, { icon: React.ComponentType }> = {
    'Venta POS': { icon: FaCashRegister },
    'Venta Local': { icon: FaCashRegister },
    'Venta Online': { icon: FaGlobe },
    'Compra a Proveedor': { icon: FaTruck },
    'Elaboración': { icon: FaIndustry },
    'Devolución': { icon: FaUndo },
    'Ajuste de Inventario': { icon: FaBalanceScale },
    'Carga Masiva': { icon: FaPlus },
    'Merma/Desperdicio': { icon: FaTrashAlt },
    'Consumo Interno': { icon: FaIndustry },
    'Vencimiento': { icon: FaTrashAlt },
    'Pedido Cancelado': { icon: FaBan },
    'Pedido Reactivado': { icon: FaRedo },
    'Edición Pedido (Devolución)': { icon: FaUndo },
    'Edición Pedido (Salida)': { icon: FaCashRegister },
};

const round = (n: number) => Math.round(n * 1000) / 1000;

function formatDateGroup(dateStr: string) {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

interface Product {
    id: string;
    nombre: string;
    shortId?: string;
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
    stockAfter?: number;
}

export default function StockManager() {
    const [activeTab, setActiveTab] = useState<'inventory' | 'history' | 'bulk'>('history');
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Modal State - Simplified for Component
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [bulkUpdates, setBulkUpdates] = useState<Record<string, number>>({});
    const [bulkReason, setBulkReason] = useState<string>("Compra a Proveedor");

    // History Tab State
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyLimitCount, setHistoryLimitCount] = useState(50);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    const [historySearch, setHistorySearch] = useState("");
    const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'IN' | 'OUT'>('all');
    const [historyReasonFilter, setHistoryReasonFilter] = useState<string>('all');
    const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');

    useEffect(() => {
        let unsubscribe: () => void;
        setLoading(true);

        const setupListener = () => {
            unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
                const prods = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Product[];
                setProducts(prods);
                setLoading(false);
            }, (error) => {
                console.error("Error listening to products:", error);
                setLoading(false);
            });
        };

        setupListener();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const fetchProducts = async () => {
        // Obsolete manually called fetchProducts - handled by onSnapshot now
        // Keeping the signature so it doesn't break onSuccess callbacks
    };

    useEffect(() => {
        if (activeTab !== 'history') return;

        setHistoryLoading(true);
        const q = query(
            collection(db, "stock_movements"),
            orderBy("date", "desc"),
            limit(historyLimitCount)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const moves = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as StockMovement[];
            setMovements(moves);
            setHasMoreHistory(moves.length === historyLimitCount);
            setHistoryLoading(false);
        }, (error) => {
            console.error("Error fetching history:", error);
            setHistoryLoading(false);
        });

        return () => unsubscribe();
    }, [activeTab, historyLimitCount]);

    const uniqueReasons = useMemo(
        () => Array.from(new Set(movements.map(m => m.reason))).sort(),
        [movements]
    );

    const filteredMovements = useMemo(() => movements.filter(m => {
        if (historyTypeFilter !== 'all' && m.type !== historyTypeFilter) return false;
        if (historyReasonFilter !== 'all' && m.reason !== historyReasonFilter) return false;
        if (historySearch) {
            const term = historySearch.toLowerCase();
            const matches = m.productName?.toLowerCase().includes(term) || m.observation?.toLowerCase().includes(term);
            if (!matches) return false;
        }
        if (historyDateFilter !== 'all' && m.date?.seconds) {
            const d = new Date(m.date.seconds * 1000);
            const now = new Date();
            const diffDays = (now.getTime() - d.getTime()) / 86400000;
            if (historyDateFilter === 'today' && d.toDateString() !== now.toDateString()) return false;
            if (historyDateFilter === '7d' && diffDays > 7) return false;
            if (historyDateFilter === '30d' && diffDays > 30) return false;
        }
        return true;
    }), [movements, historyTypeFilter, historyReasonFilter, historySearch, historyDateFilter]);

    const historySummary = useMemo(() => filteredMovements.reduce((acc, m) => {
        if (m.type === 'IN') acc.in += m.quantity; else acc.out += m.quantity;
        return acc;
    }, { in: 0, out: 0 }), [filteredMovements]);

    const groupedMovements = useMemo(() => {
        const groups: Record<string, StockMovement[]> = {};
        filteredMovements.forEach(m => {
            const key = m.date?.seconds ? new Date(m.date.seconds * 1000).toDateString() : 'Sin fecha';
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });
        return groups;
    }, [filteredMovements]);

    const exportHistoryCSV = () => {
        const header = ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Motivo', 'Observacion'];
        const rows = filteredMovements.map(m => [
            m.date?.seconds ? new Date(m.date.seconds * 1000).toLocaleString('es-AR') : '',
            m.productName,
            m.type === 'IN' ? 'Entrada' : 'Salida',
            String(m.quantity),
            m.reason,
            m.observation || ''
        ]);
        const csv = [header, ...rows]
            .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob(["﻿" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historial_stock_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const openAdjustmentModal = (product: Product) => {
        if (product.stockDependency) return; // Prevent opening for derived products
        setSelectedProduct(product);
        setIsModalOpen(true);
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
                            date: new Date(),
                            stockAfter: variants[varIdx].stockQuantity
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
                        date: new Date(),
                        stockAfter: newStock
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

    // Filter Logic
    const filteredProducts = products.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.variants && p.variants.some(v => v.name.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    return (
        <div className="stock-manager">
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
                                    ? Math.round(p.variants.reduce((acc, v) => acc + (v.stockQuantity || 0), 0) * 100) / 100
                                    : Math.round((p.stockQuantity || 0) * 100) / 100;

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
            {activeTab === 'history' && (
                <div className="history-container">
                    <div className="history-summary">
                        <div className="summary-card in">
                            <span className="summary-label">Entradas</span>
                            <span className="summary-value">+{round(historySummary.in)}</span>
                        </div>
                        <div className="summary-card out">
                            <span className="summary-label">Salidas</span>
                            <span className="summary-value">-{round(historySummary.out)}</span>
                        </div>
                        <div className={`summary-card net ${(historySummary.in - historySummary.out) >= 0 ? 'positive' : 'negative'}`}>
                            <span className="summary-label">Neto</span>
                            <span className="summary-value">{(historySummary.in - historySummary.out) >= 0 ? '+' : ''}{round(historySummary.in - historySummary.out)}</span>
                        </div>
                        <div className="summary-card count">
                            <span className="summary-label">Movimientos</span>
                            <span className="summary-value">{filteredMovements.length}</span>
                        </div>
                    </div>

                    <div className="history-filters">
                        <ProductSearch
                            value={historySearch}
                            onChange={setHistorySearch}
                            placeholder="Buscar producto u observación..."
                            className="history-search"
                        />
                        <select value={historyTypeFilter} onChange={e => setHistoryTypeFilter(e.target.value as 'all' | 'IN' | 'OUT')} className="history-filter-select">
                            <option value="all">Todos los tipos</option>
                            <option value="IN">Entradas</option>
                            <option value="OUT">Salidas</option>
                        </select>
                        <select value={historyReasonFilter} onChange={e => setHistoryReasonFilter(e.target.value)} className="history-filter-select">
                            <option value="all">Todos los motivos</option>
                            {uniqueReasons.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <select value={historyDateFilter} onChange={e => setHistoryDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d')} className="history-filter-select">
                            <option value="all">Todo el período</option>
                            <option value="today">Hoy</option>
                            <option value="7d">Últimos 7 días</option>
                            <option value="30d">Últimos 30 días</option>
                        </select>
                        <button className="btn-export" onClick={exportHistoryCSV} title="Exportar a CSV">
                            <FaFileExport /> Exportar
                        </button>
                    </div>

                    {historyLoading && <p>Cargando...</p>}

                    {!historyLoading && Object.keys(groupedMovements).length === 0 && (
                        <p className="history-empty">No se encontraron movimientos con estos filtros.</p>
                    )}

                    {!historyLoading && Object.entries(groupedMovements).map(([dateKey, items]) => (
                        <div key={dateKey} className="history-day-group">
                            <div className="history-day-header">{formatDateGroup(dateKey)}</div>
                            <div className="history-list">
                                {items.map(m => {
                                    const Icon = REASON_META[m.reason]?.icon || FaExchangeAlt;
                                    return (
                                        <div key={m.id} className={`movement-item type-${m.type}`}>
                                            <div className={`movement-icon type-${m.type}`}>
                                                <Icon />
                                            </div>
                                            <div className={`movement-qty type-${m.type}`}>
                                                {m.type === 'IN' ? '+' : '-'}{m.quantity}
                                            </div>
                                            <div className="movement-info">
                                                <strong>{m.productName}</strong>
                                                <span className="movement-meta">
                                                    {m.date?.seconds ? new Date(m.date.seconds * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''} · {m.reason}
                                                </span>
                                                {m.observation && <span className="movement-meta observation">"{m.observation}"</span>}
                                            </div>
                                            {m.stockAfter !== undefined && (
                                                <div className="movement-stock-after">Stock: {round(m.stockAfter)}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {!historyLoading && hasMoreHistory && Object.keys(groupedMovements).length > 0 && (
                        <button className="btn-load-more" onClick={() => setHistoryLimitCount(c => c + 50)}>
                            Cargar más movimientos
                        </button>
                    )}
                </div>
            )}

            {/* Adjustment Modal Component */}
            <StockAdjustmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                product={selectedProduct}
                onSuccess={fetchProducts}
            />
        </div>
    );
}
