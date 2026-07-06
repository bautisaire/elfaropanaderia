import { useState, useEffect, useRef } from 'react';
import { FaTimes, FaSave } from 'react-icons/fa';
import './PriceEditModal.css';

interface TextEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newText: string) => void;
    title: string;
    label: string;
    currentText: string;
}

export default function TextEditModal({ isOpen, onClose, onSave, title, label, currentText }: TextEditModalProps) {
    const [textInput, setTextInput] = useState(currentText);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTextInput(currentText);
            // Small delay to allow render before focusing
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, currentText]);

    const handleSave = () => {
        if (textInput.trim() !== '') {
            onSave(textInput.trim());
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="price-modal-overlay" onClick={onClose}>
            <div className="price-modal" onClick={e => e.stopPropagation()}>
                <div className="price-modal-header">
                    <h3>{title}</h3>
                    <button className="price-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="price-modal-body">
                    <p className="price-modal-label">{label}</p>
                    <div className="price-modal-input-group" style={{ paddingLeft: '10px' }}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') onClose();
                            }}
                            style={{ paddingLeft: '10px' }}
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
