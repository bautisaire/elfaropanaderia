import { useState, useEffect, useRef } from 'react';
import './WeightEntryModal.css';

interface WeightEntryModalProps {
    isOpen: boolean;
    productName: string;
    variantName?: string;
    /** Raw stock currently in inventory, shown in the header (not reduced by what's already in the cart). */
    stockActual: number;
    /** Stock still available to add on top of what's already reserved in the cart, used for the progress meter. */
    maxStock: number;
    /** Effective $/kg to use for the weight<->price conversion. */
    unitPrice: number;
    onConfirm: (weight: number) => void;
    onCancel: () => void;
}

export default function WeightEntryModal({
    isOpen,
    productName,
    variantName,
    stockActual,
    maxStock,
    unitPrice,
    onConfirm,
    onCancel
}: WeightEntryModalProps) {
    const [weightInput, setWeightInput] = useState('');
    const [priceInput, setPriceInput] = useState('');
    const [smartInputUsed, setSmartInputUsed] = useState(false);
    const [inputMode, setInputMode] = useState<'weight' | 'price'>('weight');
    const weightInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setWeightInput('');
            setPriceInput('');
            setSmartInputUsed(false);
            setInputMode('weight');
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && inputMode === 'weight' && weightInputRef.current) {
            weightInputRef.current.focus();
        }
    }, [inputMode, isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                setInputMode(prev => prev === 'weight' ? 'price' : 'weight');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const confirmWeight = () => {
        if (!weightInput) return;
        const qty = parseFloat(weightInput);
        if (isNaN(qty) || qty <= 0) return;
        onConfirm(Math.round(qty * 1000) / 1000);
    };

    if (!isOpen) return null;

    const currentWeight = parseFloat(weightInput) || 0;
    const percentage = maxStock > 0 ? Math.min(100, (currentWeight / maxStock) * 100) : 0;

    return (
        <div className="wem-overlay">
            <div className="wem-modal">
                <h3 className="wem-title">
                    {productName} {variantName ? `(${variantName})` : ''}
                    <span className="wem-stock-actual">(Stock Actual: {stockActual}kg)</span>
                </h3>

                <div className="wem-body">
                    <div className="wem-weight-row">
                        <input
                            ref={weightInputRef}
                            type="number"
                            autoFocus
                            value={weightInput}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (inputMode === 'price') return;

                                if (!smartInputUsed && val.length === 1 && /^[1-9]$/.test(val)) {
                                    setWeightInput("0." + val);
                                    setSmartInputUsed(true);
                                } else {
                                    setWeightInput(val);
                                    setSmartInputUsed(true);
                                }
                            }}
                            onFocus={() => setInputMode('weight')}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmWeight();
                                if (e.key === 'Escape') onCancel();
                                if (e.key === 'Tab') {
                                    e.preventDefault();
                                    setInputMode('price');
                                }
                            }}
                            placeholder="0.000"
                            step="0.005"
                            min="0"
                            className="wem-weight-input"
                            style={{ opacity: inputMode === 'price' ? 0.5 : 1 }}
                        />
                        <span className="wem-weight-unit">Kg</span>
                    </div>

                    <div
                        className="wem-price-row"
                        onClick={() => {
                            if (inputMode === 'price') return;
                            setInputMode('price');
                            if (weightInput && !isNaN(parseFloat(weightInput))) {
                                const currentPrice = parseFloat(weightInput) * unitPrice;
                                setPriceInput(Math.round(currentPrice).toString());
                            } else {
                                setPriceInput('');
                            }
                        }}
                    >
                        <span>$</span>
                        {inputMode === 'weight' ? (
                            <span>
                                {(weightInput && !isNaN(parseFloat(weightInput)))
                                    ? Math.round(parseFloat(weightInput) * unitPrice).toString()
                                    : "0"}
                            </span>
                        ) : (
                            <input
                                type="number"
                                autoFocus
                                value={priceInput}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setPriceInput(val);

                                    if (val === "") {
                                        setWeightInput("");
                                        return;
                                    }

                                    const priceVal = parseFloat(val);
                                    if (!isNaN(priceVal) && unitPrice > 0) {
                                        setWeightInput((priceVal / unitPrice).toFixed(3));
                                    }
                                }}
                                placeholder="0"
                                step="1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmWeight();
                                    if (e.key === 'Escape') onCancel();
                                }}
                                className="wem-price-input"
                            />
                        )}
                    </div>

                    <div className="wem-meter-wrapper">
                        <div className="wem-stock-meter">
                            <div
                                className="wem-stock-fill"
                                style={{
                                    width: `${percentage}%`,
                                    backgroundColor: percentage > 90 ? '#ef4444' : percentage > 70 ? '#f59e0b' : '#10b981'
                                }}
                            />
                        </div>
                        <div className="wem-meter-labels">
                            <span>0kg</span>
                            <span className="wem-meter-current">{currentWeight.toFixed(3)}kg seleccionados</span>
                            <span>{maxStock.toFixed(2)}kg (Max)</span>
                        </div>
                    </div>
                </div>

                <div className="wem-actions">
                    <button className="wem-btn wem-btn-cancel" onClick={onCancel}>Cancelar</button>
                    <button className="wem-btn wem-btn-confirm" onClick={confirmWeight}>Confirmar</button>
                </div>
            </div>
        </div>
    );
}
