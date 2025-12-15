import React from 'react';
import { FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import './POSModal.css';

interface POSModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'success' | 'error';
    title: string;
    message?: string;
    children?: React.ReactNode;
}

export default function POSModal({ isOpen, onClose, type, title, message, children }: POSModalProps) {
    if (!isOpen) return null;

    return (
        <div className="pos-modal-overlay">
            <div className="pos-modal">
                <div className={`pos-modal-icon ${type}`}>
                    {type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
                </div>
                <h3>{title}</h3>
                {message && <p className="pos-modal-content">{message}</p>}
                {children}
                <button
                    className={`pos-modal-btn ${type === 'error' ? 'error' : ''}`}
                    onClick={onClose}
                >
                    {type === 'success' ? 'Nueva Venta' : 'Cerrar'}
                </button>
            </div>
        </div>
    );
}
