import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaSave } from 'react-icons/fa';
import './PriceEditModal.css';

interface PriceEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newPrice: number) => void;
    itemName: string;
    currentPrice: number;
}

export default function PriceEditModal({ isOpen, onClose, onSave, itemName, currentPrice }: PriceEditModalProps) {
    const [priceInput, setPriceInput] = useState(currentPrice.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setPriceInput(currentPrice.toString());
            // Small delay to allow render before focusing
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, currentPrice]);

    const handleSave = () => {
        const parsed = parseFloat(priceInput);
        if (!isNaN(parsed) && parsed >= 0) {
            onSave(parsed);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="price-modal-overlay" onClick={onClose}>
            <div className="price-modal" onClick={e => e.stopPropagation()}>
                <div className="price-modal-header">
                    <h3>Editar Precio Base</h3>
                    <button className="price-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="price-modal-body">
                    <p className="price-modal-label">Nuevo precio para <strong>{itemName}</strong>:</p>
                    <div className="price-modal-input-group">
                        <span className="price-modal-currency">$</span>
                        <input
                            ref={inputRef}
                            type="number"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') onClose();
                            }}
                            min="0"
                            step="1"
                        />
                    </div>
                </div>
                <div className="price-modal-footer">
                    <button className="price-modal-btn-cancel" onClick={onClose}>Cancelar</button>
                    <button className="price-modal-btn-save" onClick={handleSave}>
                        <FaSave /> Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
