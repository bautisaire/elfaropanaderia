import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { syncChildProducts } from "../utils/stockUtils";
import { FaPlus, FaMinus } from 'react-icons/fa';
import './StockAdjustmentModal.css';

interface Product {
    id: string;
    nombre: string;
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
}

export default function StockAdjustmentModal({ isOpen, onClose, product, onSuccess }: StockAdjustmentModalProps) {
    const [selectedVariantIdx, setSelectedVariantIdx] = useState<number | null>(null);
    const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT'>('IN');
    const [amount, setAmount] = useState<string>('');
    const [reason, setReason] = useState<string>('Elaboración');
    const [observation, setObservation] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const reasonsIn = ["Elaboración", "Compra a Proveedor", "Devolución", "Ajuste de Inventario"];
    const reasonsOut = ["Venta Local", "Merma/Desperdicio", "Consumo Interno", "Ajuste de Inventario", "Vencimiento"];

    // Reset state when modal opens or product changes
    useEffect(() => {
        if (isOpen) {
            setSelectedVariantIdx(null);
            setAdjustmentType('IN');
            setAmount('');
            setReason('Elaboración');
            setObservation('');
            setIsSubmitting(false);
        }
    }, [isOpen, product]);

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
            alert("El stock no puede ser negativo.");
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
                date: new Date()
            });

            alert("Stock actualizado correctamente.");
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error("Error saving stock adjustment:", error);
            alert("Error al actualizar stock.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !product) return null;

    return (
        <div className="stock-modal-overlay" onClick={onClose}>
            <div className="stock-modal" onClick={e => e.stopPropagation()}>
                <h3>Ajustar Stock: {product.nombre}</h3>

                <div className="stock-modal-form">
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
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
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
                                    onClick={() => {
                                        // Calcular stock actual
                                        let currentStock = 0;
                                        if (product?.variants && selectedVariantIdx !== null) {
                                            currentStock = product.variants[selectedVariantIdx].stockQuantity || 0;
                                        } else {
                                            currentStock = product?.stockQuantity || 0;
                                        }
                                        setAmount(currentStock.toString());
                                    }}
                                    title="Quitar todo el stock"
                                >
                                    Todo
                                </button>
                            )}
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
                        <label>Observación (Opcional)</label>
                        <textarea
                            value={observation}
                            onChange={e => setObservation(e.target.value)}
                            placeholder="Comentarios adicionales..."
                            rows={3}
                        />
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
