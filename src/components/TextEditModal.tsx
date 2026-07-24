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
    multiline?: boolean;
    allowEmpty?: boolean;
}

export default function TextEditModal({ isOpen, onClose, onSave, title, label, currentText, multiline = false, allowEmpty = false }: TextEditModalProps) {
    const [textInput, setTextInput] = useState(currentText);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTextInput(currentText);
            // Small delay to allow render before focusing
            setTimeout(() => {
                inputRef.current?.focus();
                if (inputRef.current && 'select' in inputRef.current && typeof inputRef.current.select === 'function') {
                    inputRef.current.select();
                }
            }, 50);
        }
    }, [isOpen, currentText]);

    const handleSave = () => {
        if (allowEmpty || textInput.trim() !== '') {
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
                        {multiline ? (
                            <textarea
                                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
                                    if (e.key === 'Escape') onClose();
                                }}
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    fontSize: '0.95rem',
                                    resize: 'vertical',
                                    fontFamily: 'inherit'
                                }}
                            />
                        ) : (
                            <input
                                ref={inputRef as React.RefObject<HTMLInputElement>}
                                type="text"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSave();
                                    if (e.key === 'Escape') onClose();
                                }}
                                style={{ paddingLeft: '10px' }}
                            />
                        )}
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
