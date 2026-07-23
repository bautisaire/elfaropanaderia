import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/firebaseConfig';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { syncChildProducts } from "../utils/stockUtils";
import { FaPlus, FaMinus, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import './StockAdjustmentModal.css';

interface Product {
    id: string;
    nombre: string;
    shortId?: string;
    stockQuantity?: number;
    stockDependency?: any;
    unitType?: 'unit' | 'weight';
    variants?: {
        name: string;
        stock?: boolean;
        stockQuantity?: number;
        [key: string]: any;
    }[];
    [key: string]: any;
}

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onSuccess?: () => void;
    initialVariantName?: string;
    initialValue?: number;
}

export default function StockAdjustmentModal({ isOpen, onClose, product, onSuccess, initialVariantName, initialValue }: StockAdjustmentModalProps) {
    const [selectedVariantIdx, setSelectedVariantIdx] = useState<number | null>(null);
    const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT'>('IN');
    const [amount, setAmount] = useState<string>('');
    const [reason, setReason] = useState<string>('Elaboración');
    const [observation, setObservation] = useState<string>('');
    const [showObservation, setShowObservation] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const reasonsIn = ["Elaboración", "Compra a Proveedor", "Devolución", "Ajuste de Inventario"];
    const reasonsOut = ["Ajuste de Inventario", "Venta Local", "Merma/Desperdicio", "Consumo Interno", "Vencimiento"];

    const inputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens or product changes
    useEffect(() => {
        if (isOpen) {
            if (initialVariantName && product?.variants) {
                const idx = product.variants.findIndex(v => v.name === initialVariantName);
                setSelectedVariantIdx(idx >= 0 ? idx : null);
            } else {
                setSelectedVariantIdx(null);
            }
            setAdjustmentType('IN');
            setAmount(initialValue ? parseFloat(initialValue.toFixed(2)).toString() : '');
            setReason('Elaboración');
            setObservation('');
            setShowObservation(false);
            setIsSubmitting(false);
            setShowSuccess(false);
            setErrorMessage(null);

            // Auto-focus input after a short delay to ensure modal is rendered
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                }
            }, 100);
        }
    }, [isOpen, product, initialVariantName]);

    // Handle Keyboard Shortcuts
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
            if (e.key === 'Enter') {
                // If it's a textarea (observation), don't submit on Enter (require Ctrl+Enter or just click)
                // But for the main flow (amount input), Enter should submit.
                // Let's safe check if we are in the textarea
                const target = e.target as HTMLElement;
                if (target.tagName.toLowerCase() === 'textarea') return;

                e.preventDefault();
                handleSaveAdjustment();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, amount, selectedVariantIdx, adjustmentType, reason, observation, product]); // Deps needed for handleSaveAdjustment context logic if it wasn't stable, but it uses state variables so we need them in deps OR better: use a ref for the handler or ensure handleSaveAdjustment is fresh.
    // Actually handleSaveAdjustment is defined inside component and closes over state.
    // So we need to reconstruct the listener when state changes, OR use a ref to current state.
    // Re-adding listener on state change is easiest for now.


    const handleSaveAdjustment = async () => {
        if (!product || !amount || Number(amount) <= 0) return;

        setIsSubmitting(true);
        const qty = Number(amount);
        let newStock = 0;
        let variants = product.variants ? [...product.variants] : [];
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
            const currentStock = product.stockQuantity || 0;
            newStock = adjustmentType === 'IN' ? currentStock + qty : currentStock - qty;
            newStock = Math.round(newStock * 1000) / 1000;
        }

        /* Allow negative stock for adjustments? Usually we warn but let's prevent full block if user insists.
           However, user prompt said "El stock no puede ser negativo" in original logic. */

        if (newStock < 0) {
            setErrorMessage("El stock no puede ser negativo.");
            setIsSubmitting(false);
            return;
        }

        try {
            // 1. Update Product
            if (selectedVariantIdx !== null && variants.length > 0) {
                await updateDoc(doc(db, "products", product.id), { variants });
            } else {
                await updateDoc(doc(db, "products", product.id), { stockQuantity: newStock });
                // Sync Children
                await syncChildProducts(product.id, newStock);
            }

            // 2. Log Movement
            await addDoc(collection(db, "stock_movements"), {
                productId: product.id,
                productName: product.nombre,
                type: adjustmentType,
                quantity: qty,
                reason: reason,
                observation: observation + (variantName ? ` (Var: ${variantName})` : ''),
                date: new Date(),
                stockAfter: newStock
            });



            setShowSuccess(true);
            if (onSuccess) onSuccess();

            // Auto close after 1.5s
            setTimeout(() => {
                onClose();
            }, 1500);

        } catch (error) {
            console.error("Error saving stock adjustment:", error);
            setErrorMessage("Error al actualizar stock.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !product) return null;

    if (showSuccess) {
        return (
            <div className="stock-modal-overlay">
                <div className="stock-modal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'auto', minHeight: '300px', padding: '20px' }}>
                    <div style={{ color: '#10b981', marginBottom: '20px' }}>
                        <FaCheckCircle size={60} />
                    </div>
                    <h3 style={{ border: 'none', marginBottom: '10px' }}>¡Stock Actualizado!</h3>
                    <p style={{ color: '#6b7280', textAlign: 'center' }}>El movimiento se ha registrado correctamente.</p>
                </div>
            </div>
        );
    }

    const currentStock = (selectedVariantIdx !== null && product.variants && product.variants[selectedVariantIdx])
        ? (product.variants[selectedVariantIdx].stockQuantity || 0)
        : (product.stockQuantity || 0);

    const parsedAmount = Number(amount) || 0;
    const resultingStock = adjustmentType === 'IN'
        ? currentStock + parsedAmount
        : currentStock - parsedAmount;
    const roundedResultingStock = Math.round(resultingStock * 100) / 100;

    return (
        <div className="stock-modal-overlay" onClick={onClose}>
            <div className="stock-modal" onClick={e => e.stopPropagation()}>
                <h3>Ajustar Stock: {product.nombre}</h3>

                <div className="stock-modal-form">
                    {errorMessage && (
                        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '6px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FaExclamationTriangle />
                            {errorMessage}
                        </div>
                    )}

                    {product.variants && product.variants.length > 0 && (
                        <div className="stock-form-group">
                            <label>Seleccionar Variante</label>
                            <select
                                value={selectedVariantIdx ?? ''}
                                onChange={e => setSelectedVariantIdx(Number(e.target.value))}
                                className="stock-select"
                            >
                                <option value="" disabled>-- Elige una variante --</option>
                                {product.variants.map((v, idx) => (
                                    <option key={idx} value={idx}>
                                        {v.name} (Stock: {Math.round((v.stockQuantity || 0) * 100) / 100})
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
                                onClick={() => { setAdjustmentType('IN'); setReason(reasonsIn[0]); }}
                            >
                                <FaPlus /> Añadir (Entrada)
                            </button>
                            <button
                                className={`action-btn subtract ${adjustmentType === 'OUT' ? 'selected' : ''}`}
                                onClick={() => { setAdjustmentType('OUT'); setReason(reasonsOut[0]); }}
                            >
                                <FaMinus /> Restar (Salida)
                            </button>
                        </div>
                    </div>

                    <div className="stock-form-group">
                        <label>Cantidad</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                ref={inputRef}
                                type="number"
                                step="0.001"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="0.000"
                                min="0.001"
                                style={{ flex: 1 }}
                            />
                            {adjustmentType === 'OUT' && (
                                <button
                                    className="btn-remove-all"
                                    onClick={() => setAmount(currentStock.toString())}
                                    title="Quitar todo el stock"
                                >
                                    Todo
                                </button>
                            )}
                        </div>

                        {/* Real-time Resulting Stock Box */}
                        <div style={{
                            marginTop: '10px',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: adjustmentType === 'OUT' ? '#fef2f2' : '#f0fdf4',
                            border: `1px solid ${adjustmentType === 'OUT' ? '#fca5a5' : '#bbf7d0'}`,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            fontSize: '0.95rem'
                        }}>
                            <span style={{ color: adjustmentType === 'OUT' ? '#dc2626' : '#166534', fontWeight: 600 }}>
                                Stock resultante: <strong style={{ fontSize: '1.1rem', color: adjustmentType === 'OUT' ? '#dc2626' : '#15803d' }}>{roundedResultingStock}</strong>
                            </span>
                        </div>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                            <label style={{ margin: 0 }}>Observación (Opcional)</label>
                            <input
                                type="checkbox"
                                checked={showObservation}
                                onChange={(e) => setShowObservation(e.target.checked)}
                                style={{ width: 'auto', margin: 0 }}
                            />
                        </div>
                        {showObservation && (
                            <textarea
                                value={observation}
                                onChange={e => setObservation(e.target.value)}
                                placeholder="Comentarios adicionales..."
                                rows={3}
                            />
                        )}
                    </div>

                    <div className="modal-actions">
                        <button className="btn-cancel" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
                        <button className="btn-save-stock" onClick={handleSaveAdjustment} disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : 'Guardar Movimiento'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
