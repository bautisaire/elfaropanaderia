import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, updateDoc, addDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { syncChildProducts } from "../utils/stockUtils";
import {
    FaBoxes, FaHistory, FaEdit, FaPlus, FaFileExport, FaExchangeAlt,
    FaCashRegister, FaGlobe, FaTruck, FaIndustry, FaUndo, FaBalanceScale, FaBan, FaRedo, FaTrashAlt, FaBolt, FaTimes, FaSave, FaCheckCircle
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
    'Carga Rápida': { icon: FaBolt },
    'Merma/Desperdicio': { icon: FaTrashAlt },
    'Consumo Interno': { icon: FaIndustry },
    'Vencimiento': { icon: FaTrashAlt },
    'Pedido Cancelado': { icon: FaBan },
    'Pedido Reactivado': { icon: FaRedo },
    'Edición Pedido (Devolución)': { icon: FaUndo },
    'Edición Pedido (Salida)': { icon: FaCashRegister },
};

const round = (n: number) => Math.round(n * 100) / 100;

const formatStock = (n: number | undefined | null): string => {
    if (n === undefined || n === null || isNaN(n)) return '0';
    return (Math.round(Number(n) * 100) / 100).toString();
};

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
    isQuickStock?: boolean;
    quickStock?: boolean;
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
    const [activeTab, setActiveTab] = useState<'inventory' | 'history' | 'bulk'>('bulk');
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Modal State - Simplified for Component
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Carga Rápida State
    const [quickUpdates, setQuickUpdates] = useState<Record<string, number>>({});
    const [quickReason, setQuickReason] = useState<string>("Elaboración");
    const [savingQuick, setSavingQuick] = useState(false);
    const [isAddQuickModalOpen, setIsAddQuickModalOpen] = useState(false);
    const [addQuickSearch, setAddQuickSearch] = useState("");
    const [addingQuickId, setAddingQuickId] = useState<string | null>(null);

    // Custom Confirmation Modals State
    const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);
    const [resetTarget, setResetTarget] = useState<{ product: Product; variantIndex?: number; targetName: string; currentStock: number } | null>(null);
    const [isConfirmResetAllModalOpen, setIsConfirmResetAllModalOpen] = useState(false);
    const [resettingAll, setResettingAll] = useState(false);

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

    // Carga Rápida Logic
    const quickProducts = useMemo(() => {
        return products.filter(p => (p.isQuickStock || p.quickStock) && (
            !searchTerm ||
            p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.variants && p.variants.some(v => v.name.toLowerCase().includes(searchTerm.toLowerCase())))
        ));
    }, [products, searchTerm]);

    const availableForQuick = useMemo(() => {
        return products.filter(p => {
            if (p.isQuickStock || p.quickStock) return false;
            if (!addQuickSearch) return true;
            const term = addQuickSearch.toLowerCase();
            return p.nombre.toLowerCase().includes(term) ||
                (p.variants && p.variants.some(v => v.name.toLowerCase().includes(term)));
        });
    }, [products, addQuickSearch]);

    const handleToggleQuickStock = async (product: Product, enable: boolean) => {
        setAddingQuickId(product.id);
        try {
            await updateDoc(doc(db, "products", product.id), {
                isQuickStock: enable,
                quickStock: enable
            });
        } catch (error) {
            console.error("Error al actualizar Carga Rápida:", error);
            alert("Ocurrió un error al actualizar el producto.");
        } finally {
            setAddingQuickId(null);
        }
    };

    const handleQuickChange = (id: string, value: string) => {
        let val = Number(value);
        val = Math.round(val * 1000) / 1000;
        setQuickUpdates(prev => {
            if (isNaN(val) || val <= 0) {
                const copy = { ...prev };
                delete copy[id];
                return copy;
            }
            return { ...prev, [id]: val };
        });
    };

    const handleQuickInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            const inputs = document.querySelectorAll<HTMLInputElement>('.quick-input');
            const targetIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
            const targetInput = inputs[targetIndex];
            if (targetInput) {
                targetInput.focus();
                targetInput.select();
            }
        }
    };

    const handleOpenSaveConfirm = () => {
        const entries = Object.entries(quickUpdates);
        if (entries.length === 0) {
            alert("No has ingresado ninguna cantidad para sumar.");
            return;
        }
        setIsConfirmSaveModalOpen(true);
    };

    const executeQuickSave = async () => {
        const entries = Object.entries(quickUpdates);
        if (entries.length === 0) return;

        setSavingQuick(true);
        try {
            for (const [key, qty] of entries) {
                const [prodId, varIdxStr] = key.split('-');
                const product = products.find(p => p.id === prodId);
                if (!product) continue;

                if (varIdxStr !== undefined) {
                    const varIdx = Number(varIdxStr);
                    const variants = [...(product.variants || [])];
                    if (variants[varIdx]) {
                        const current = variants[varIdx].stockQuantity || 0;
                        const newStock = current + qty;
                        variants[varIdx].stockQuantity = newStock;
                        variants[varIdx].stock = newStock > 0;

                        await updateDoc(doc(db, "products", prodId), { variants });

                        await addDoc(collection(db, "stock_movements"), {
                            productId: prodId,
                            productName: `${product.nombre} (${variants[varIdx].name})`,
                            type: 'IN',
                            quantity: qty,
                            reason: quickReason,
                            observation: `Carga Rápida`,
                            date: new Date(),
                            stockAfter: newStock
                        });
                    }
                } else {
                    const current = product.stockQuantity || 0;
                    const newStock = current + qty;
                    await updateDoc(doc(db, "products", prodId), { stockQuantity: newStock });

                    await syncChildProducts(prodId, newStock);

                    await addDoc(collection(db, "stock_movements"), {
                        productId: prodId,
                        productName: product.nombre,
                        type: 'IN',
                        quantity: qty,
                        reason: quickReason,
                        observation: `Carga Rápida`,
                        date: new Date(),
                        stockAfter: newStock
                    });
                }
            }

            setQuickUpdates({});
            setIsConfirmSaveModalOpen(false);
        } catch (error) {
            console.error("Error al realizar Carga Rápida:", error);
            alert("Ocurrió un error al guardar la carga rápida.");
        } finally {
            setSavingQuick(false);
        }
    };

    const triggerResetStockModal = (product: Product, variantIndex?: number) => {
        const isVariant = variantIndex !== undefined && product.variants && product.variants[variantIndex] !== undefined;
        const targetName = isVariant
            ? `${product.nombre} (${product.variants![variantIndex].name})`
            : product.nombre;
        const currentStock = isVariant
            ? (product.variants![variantIndex].stockQuantity || 0)
            : (product.stockQuantity || 0);

        if (currentStock === 0) {
            alert(`El stock de "${targetName}" ya está en 0.`);
            return;
        }

        setResetTarget({ product, variantIndex, targetName, currentStock });
    };

    const executeResetStock = async () => {
        if (!resetTarget) return;
        const { product, variantIndex, targetName, currentStock } = resetTarget;

        try {
            if (variantIndex !== undefined && product.variants && product.variants[variantIndex] !== undefined) {
                const variants = [...(product.variants || [])];
                variants[variantIndex].stockQuantity = 0;
                variants[variantIndex].stock = false;

                await updateDoc(doc(db, "products", product.id), { variants });

                await addDoc(collection(db, "stock_movements"), {
                    productId: product.id,
                    productName: targetName,
                    type: currentStock > 0 ? 'OUT' : 'IN',
                    quantity: Math.abs(currentStock),
                    reason: 'Ajuste de Inventario',
                    observation: 'Reinicio de stock a 0',
                    date: new Date(),
                    stockAfter: 0
                });
            } else {
                await updateDoc(doc(db, "products", product.id), { stockQuantity: 0 });
                await syncChildProducts(product.id, 0);

                await addDoc(collection(db, "stock_movements"), {
                    productId: product.id,
                    productName: targetName,
                    type: currentStock > 0 ? 'OUT' : 'IN',
                    quantity: Math.abs(currentStock),
                    reason: 'Ajuste de Inventario',
                    observation: 'Reinicio de stock a 0',
                    date: new Date(),
                    stockAfter: 0
                });
            }

            const isVariant = variantIndex !== undefined;
            const key = isVariant ? `${product.id}-${variantIndex}` : product.id;
            setQuickUpdates(prev => {
                const copy = { ...prev };
                delete copy[key];
                return copy;
            });
            setResetTarget(null);
        } catch (error) {
            console.error("Error al reiniciar stock:", error);
            alert("Ocurrió un error al reiniciar el stock.");
        }
    };

    const handleOpenResetAllConfirm = () => {
        if (quickProducts.length === 0) return;
        setIsConfirmResetAllModalOpen(true);
    };

    const executeResetAllStock = async () => {
        if (quickProducts.length === 0) return;
        setResettingAll(true);

        try {
            let resetCount = 0;
            for (const product of quickProducts) {
                if (product.variants && product.variants.length > 0) {
                    let updatedVariants = false;
                    const variants = [...product.variants];

                    for (let idx = 0; idx < variants.length; idx++) {
                        const v = variants[idx];
                        const currentStock = v.stockQuantity || 0;
                        if (currentStock !== 0) {
                            variants[idx].stockQuantity = 0;
                            variants[idx].stock = false;
                            updatedVariants = true;
                            resetCount++;

                            await addDoc(collection(db, "stock_movements"), {
                                productId: product.id,
                                productName: `${product.nombre} (${v.name})`,
                                type: currentStock > 0 ? 'OUT' : 'IN',
                                quantity: Math.abs(currentStock),
                                reason: 'Ajuste de Inventario',
                                observation: 'Reinicio masivo de stock a 0',
                                date: new Date(),
                                stockAfter: 0
                            });
                        }
                    }

                    if (updatedVariants) {
                        await updateDoc(doc(db, "products", product.id), { variants });
                    }
                } else {
                    const currentStock = product.stockQuantity || 0;
                    if (currentStock !== 0) {
                        resetCount++;
                        await updateDoc(doc(db, "products", product.id), { stockQuantity: 0 });
                        await syncChildProducts(product.id, 0);

                        await addDoc(collection(db, "stock_movements"), {
                            productId: product.id,
                            productName: product.nombre,
                            type: currentStock > 0 ? 'OUT' : 'IN',
                            quantity: Math.abs(currentStock),
                            reason: 'Ajuste de Inventario',
                            observation: 'Reinicio masivo de stock a 0',
                            date: new Date(),
                            stockAfter: 0
                        });
                    }
                }
            }

            setQuickUpdates({});
            setIsConfirmResetAllModalOpen(false);
            alert(`¡Reinicio completado! Se restableció el stock a 0 en ${resetCount} ítem(s).`);
        } catch (error) {
            console.error("Error al reiniciar todo el stock:", error);
            alert("Ocurrió un error al reiniciar el stock.");
        } finally {
            setResettingAll(false);
        }
    };

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
                        className={`stock-tab-btn ${activeTab === 'bulk' ? 'active' : ''}`}
                        onClick={() => setActiveTab('bulk')}
                    >
                        <FaBolt /> Carga Rápida
                    </button>
                    <button
                        className={`stock-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <FaHistory /> Historial
                    </button>
                    <button
                        className={`stock-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                        onClick={() => setActiveTab('inventory')}
                    >
                        <FaBoxes /> Inventario
                    </button>
                </div>

                {(activeTab === 'inventory' || activeTab === 'bulk') && (
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <ProductSearch
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder={activeTab === 'bulk' ? "Buscar en carga rápida..." : "Buscar en inventario..."}
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

            {/* TAB CARGA RÁPIDA */}
            {activeTab === 'bulk' && !loading && (
                <div className="quick-stock-wrapper">
                    <div className="quick-stock-header">
                        <label>
                            <FaBolt style={{ color: '#16a34a' }} /> Motivo de la carga:
                        </label>
                        <select
                            value={quickReason}
                            onChange={e => setQuickReason(e.target.value)}
                            className="quick-reason-select"
                        >
                            <option value="Elaboración">Elaboración</option>
                            <option value="Compra a Proveedor">Compra a Proveedor</option>
                            <option value="Devolución">Devolución</option>
                            <option value="Ajuste de Inventario">Ajuste de Inventario</option>
                        </select>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                className="btn-save-quick"
                                onClick={handleOpenSaveConfirm}
                                disabled={savingQuick || Object.keys(quickUpdates).length === 0}
                            >
                                <FaBolt /> Guardar Stock ({Object.keys(quickUpdates).length})
                            </button>
                            <button
                                type="button"
                                className="btn-reset-all-quick"
                                onClick={handleOpenResetAllConfirm}
                                disabled={savingQuick || resettingAll || quickProducts.length === 0}
                            >
                                <FaUndo /> Reiniciar Todo
                            </button>
                        </div>
                    </div>

                    {quickProducts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                            <FaBolt style={{ fontSize: '40px', color: '#cbd5e1', marginBottom: '12px' }} />
                            <h4 style={{ color: '#334155', marginBottom: '6px' }}>No hay productos habilitados para Carga Rápida</h4>
                            <p style={{ fontSize: '13px', maxWidth: '420px', margin: '0 auto 20px auto' }}>
                                Puedes agregar productos haciendo clic en el botón de abajo.
                            </p>
                            <button
                                type="button"
                                className="btn-add-quick-product"
                                onClick={() => setIsAddQuickModalOpen(true)}
                            >
                                <FaPlus /> Agregar otro producto
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <table className="quick-table" style={{ maxWidth: '640px', margin: '0 auto' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'center', width: '45%' }}>Producto</th>
                                        <th style={{ textAlign: 'center', width: '30%' }}>Sumar Stock (+)</th>
                                        <th style={{ textAlign: 'center', width: '25%' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        let inputCount = 0;
                                        return quickProducts.map(p => {
                                            if (p.variants && p.variants.length > 0) {
                                                return p.variants.map((v, idx) => {
                                                    const key = `${p.id}-${idx}`;
                                                    const currentIndex = inputCount++;
                                                    return (
                                                        <tr key={key}>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <strong style={{ color: '#1e293b', fontSize: '15px' }}>{p.nombre}</strong>
                                                                <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>
                                                                    {v.name} (Stock: {formatStock(v.stockQuantity)})
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <input
                                                                    type="number"
                                                                    step="0.001"
                                                                    min="0"
                                                                    placeholder="0"
                                                                    className="quick-input"
                                                                    value={quickUpdates[key] || ''}
                                                                    onChange={e => handleQuickChange(key, e.target.value)}
                                                                    onKeyDown={e => handleQuickInputKeyDown(e, currentIndex)}
                                                                />
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn-reset-stock"
                                                                    title="Reiniciar stock a 0"
                                                                    tabIndex={-1}
                                                                    onClick={() => triggerResetStockModal(p, idx)}
                                                                >
                                                                    <FaUndo /> Reiniciar
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            }

                                            const currentIndex = inputCount++;
                                            return (
                                                <tr key={p.id}>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <strong style={{ color: '#1e293b', fontSize: '15px' }}>{p.nombre}</strong>
                                                        <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>
                                                            Stock actual: {formatStock(p.stockQuantity)}{p.unitType === 'weight' ? ' kg' : ''}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            placeholder="0"
                                                            className="quick-input"
                                                            value={quickUpdates[p.id] || ''}
                                                            onChange={e => handleQuickChange(p.id, e.target.value)}
                                                            onKeyDown={e => handleQuickInputKeyDown(e, currentIndex)}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                            <button
                                                                type="button"
                                                                className="btn-reset-stock"
                                                                title="Reiniciar stock a 0"
                                                                tabIndex={-1}
                                                                onClick={() => triggerResetStockModal(p)}
                                                            >
                                                                <FaUndo /> Reiniciar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-remove-quick"
                                                                title="Quitar de Carga Rápida"
                                                                tabIndex={-1}
                                                                onClick={() => handleToggleQuickStock(p, false)}
                                                            >
                                                                <FaTrashAlt />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>

                            <div style={{ width: '100%', maxWidth: '640px', marginTop: '16px' }}>
                                <button
                                    type="button"
                                    className="btn-add-quick-product"
                                    onClick={() => setIsAddQuickModalOpen(true)}
                                >
                                    <FaPlus /> Agregar otro producto
                                </button>
                            </div>
                        </div>
                    )}
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

            {/* Quick Add Product Modal */}
            {isAddQuickModalOpen && (
                <div className="stock-modal-overlay" onClick={() => setIsAddQuickModalOpen(false)}>
                    <div className="stock-modal" onClick={e => e.stopPropagation()} style={{ width: '520px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                                <FaBolt style={{ color: '#16a34a' }} /> Agregar Productos a Carga Rápida
                            </h3>
                            <button
                                onClick={() => setIsAddQuickModalOpen(false)}
                                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <ProductSearch
                                value={addQuickSearch}
                                onChange={setAddQuickSearch}
                                placeholder="Buscar producto por nombre..."
                            />
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px' }}>
                            {availableForQuick.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>No se encontraron productos.</p>
                            ) : (
                                availableForQuick.map(p => {
                                    const isAdded = !!(p.isQuickStock || p.quickStock);
                                    return (
                                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: isAdded ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isAdded ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '8px' }}>
                                            <div>
                                                <strong style={{ display: 'block', color: '#1e293b', fontSize: '0.95rem' }}>{p.nombre}</strong>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    Stock actual: {formatStock(p.stockQuantity)}{p.unitType === 'weight' ? ' kg' : ''}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleQuickStock(p, !isAdded)}
                                                disabled={addingQuickId === p.id}
                                                style={{
                                                    background: isAdded ? '#dcfce7' : '#16a34a',
                                                    color: isAdded ? '#166534' : '#ffffff',
                                                    border: isAdded ? '1px solid #86efac' : 'none',
                                                    padding: '6px 14px',
                                                    borderRadius: '6px',
                                                    fontWeight: 600,
                                                    fontSize: '0.85rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {isAdded ? (
                                                    <>✓ En Carga Rápida</>
                                                ) : (
                                                    <><FaPlus /> Agregar</>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
                            <button className="btn-cancel" onClick={() => setIsAddQuickModalOpen(false)}>
                                Listo / Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal: Guardar Cambios de Stock */}
            {isConfirmSaveModalOpen && (
                <div className="stock-modal-overlay" onClick={() => setIsConfirmSaveModalOpen(false)}>
                    <div className="stock-modal" onClick={e => e.stopPropagation()} style={{ width: '460px', maxWidth: '95vw' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaSave /> ¿Guardar Cambios de Stock?
                            </h3>
                            <button onClick={() => setIsConfirmSaveModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>
                                <FaTimes />
                            </button>
                        </div>

                        <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '12px' }}>
                            Se aplicará la carga de stock para <strong>{Object.keys(quickUpdates).length} producto(s)</strong>.
                        </p>

                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '8px', marginBottom: '15px' }}>
                            <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>Motivo seleccionado: </span>
                            <strong style={{ color: '#14532d' }}>{quickReason}</strong>
                        </div>

                        <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {Object.entries(quickUpdates).map(([key, qty]) => {
                                const [prodId, varIdxStr] = key.split('-');
                                const product = products.find(p => p.id === prodId);
                                if (!product) return null;
                                const varName = varIdxStr !== undefined && product.variants ? product.variants[Number(varIdxStr)]?.name : null;
                                const name = varName ? `${product.nombre} (${varName})` : product.nombre;
                                return (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#1e293b' }}>
                                        <span>{name}</span>
                                        <strong style={{ color: '#16a34a' }}>+{qty}</strong>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn-cancel" onClick={() => setIsConfirmSaveModalOpen(false)} disabled={savingQuick}>
                                Cancelar
                            </button>
                            <button
                                className="btn-save-stock"
                                style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                onClick={executeQuickSave}
                                disabled={savingQuick}
                            >
                                <FaCheckCircle /> {savingQuick ? 'Guardando...' : 'Confirmar y Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal: Reiniciar Stock */}
            {resetTarget && (
                <div className="stock-modal-overlay" onClick={() => setResetTarget(null)}>
                    <div className="stock-modal" onClick={e => e.stopPropagation()} style={{ width: '420px', maxWidth: '95vw' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaUndo /> ¿Reiniciar Stock?
                            </h3>
                            <button onClick={() => setResetTarget(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>
                                <FaTimes />
                            </button>
                        </div>

                        <p style={{ color: '#1e293b', fontSize: '0.98rem', marginBottom: '15px' }}>
                            ¿Estás seguro de reiniciar el stock de <strong>"{resetTarget.targetName}"</strong>?
                        </p>

                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 14px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>Stock actual: <strong>{formatStock(resetTarget.currentStock)}</strong></span>
                            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.95rem' }}>Nuevo stock: 0</span>
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn-cancel" onClick={() => setResetTarget(null)}>
                                Cancelar
                            </button>
                            <button
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                onClick={executeResetStock}
                            >
                                <FaCheckCircle /> Sí, Reiniciar a 0
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isConfirmResetAllModalOpen && (
                <div className="stock-modal-overlay" onClick={() => setIsConfirmResetAllModalOpen(false)}>
                    <div className="stock-modal" onClick={e => e.stopPropagation()} style={{ width: '450px', maxWidth: '95vw' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaUndo /> ¿Reiniciar Todo el Stock a 0?
                            </h3>
                            <button onClick={() => setIsConfirmResetAllModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>
                                <FaTimes />
                            </button>
                        </div>

                        <p style={{ color: '#1e293b', fontSize: '0.98rem', marginBottom: '15px' }}>
                            Se restablecerá a <strong>0</strong> el stock de los <strong>{quickProducts.length} producto(s)</strong> cargados en Carga Rápida.
                        </p>

                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px 14px', borderRadius: '8px', marginBottom: '20px', color: '#991b1b', fontSize: '0.88rem' }}>
                            ⚠️ Esta acción creará un registro de <strong>'Ajuste de Inventario'</strong> en el historial para cada producto.
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn-cancel" onClick={() => setIsConfirmResetAllModalOpen(false)} disabled={resettingAll}>
                                Cancelar
                            </button>
                            <button
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                onClick={executeResetAllStock}
                                disabled={resettingAll}
                            >
                                <FaCheckCircle /> {resettingAll ? 'Reiniciando...' : 'Sí, Reiniciar Todo a 0'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Floating Action Button (Save Stock) */}
            {activeTab === 'bulk' && (
                <button
                    type="button"
                    className="btn-save-quick-fab"
                    onClick={handleOpenSaveConfirm}
                    disabled={savingQuick || Object.keys(quickUpdates).length === 0}
                    title="Guardar Cambios de Stock"
                >
                    <FaSave />
                    {Object.keys(quickUpdates).length > 0 && (
                        <span className="fab-badge">{Object.keys(quickUpdates).length}</span>
                    )}
                </button>
            )}
        </div>
    );
}
