import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product } from '../context/CartContext';
import { FaTimes, FaMinus, FaPlus } from 'react-icons/fa';
import './ComboSelectionModal.css';

interface ComboSelectionModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, comboItems: { name: string; quantity: number }[]) => void;
}

export default function ComboSelectionModal({ product, isOpen, onClose, onAddToCart }: ComboSelectionModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const totalRequired = product.comboItemsCount || 0;

  useEffect(() => {
    if (isOpen) {
      let initialQuantities: Record<string, number> = {};
      if (product.comboOptions && product.comboOptions.length > 0 && totalRequired > 0) {
        const availableOptions = product.comboOptions.filter(opt => !(opt as any).disabled);
        const optionsCount = availableOptions.length;
        
        if (optionsCount > 0) {
          const baseQty = Math.floor(totalRequired / optionsCount);
          let remainder = totalRequired % optionsCount;
          
          availableOptions.forEach(opt => {
            initialQuantities[opt.name] = baseQty + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
          });
        }
      }
      setQuantities(initialQuantities);
    }
  }, [isOpen, product.comboOptions, totalRequired]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  if (!isOpen || !product.isCombo) return null;

  const totalSelected = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const isComplete = totalSelected === totalRequired;

  const handleIncrement = (optionName: string) => {
    if (totalSelected < totalRequired) {
      setQuantities(prev => ({
        ...prev,
        [optionName]: (prev[optionName] || 0) + 1
      }));
    }
  };

  const handleDecrement = (optionName: string) => {
    if (quantities[optionName] > 0) {
      setQuantities(prev => ({
        ...prev,
        [optionName]: prev[optionName] - 1
      }));
    }
  };

  const handleAdd = () => {
    if (isComplete) {
      const selectedItems = Object.entries(quantities)
        .filter(([_, qty]) => qty > 0)
        .map(([name, quantity]) => ({ name, quantity }));
      
      onAddToCart(product, selectedItems);
      onClose();
    }
  };

  return createPortal(
    <div className="combo-modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="combo-modal-content" onClick={e => e.stopPropagation()}>
        <button type="button" className="combo-close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <FaTimes />
        </button>

        <div className="combo-modal-header">
          <h2>Armá tu {product.name}</h2>
          <p className="combo-progress">
            Seleccionadas: <strong>{totalSelected}</strong> / {totalRequired}
          </p>
          <div className="combo-progress-bar">
            <div 
              className="combo-progress-fill" 
              style={{ width: `${(totalSelected / totalRequired) * 100}%`, background: isComplete ? '#10b981' : '#f59e0b' }}
            ></div>
          </div>
        </div>

        <div className="combo-options-list">
          {product.comboOptions?.map((opt, idx) => {
            const isOptionDisabled = (opt as any).disabled;
            return (
              <div key={idx} className="combo-option-item" style={{ opacity: isOptionDisabled ? 0.5 : 1 }}>
                <div className="combo-option-img-wrapper">
                  {opt.image ? (
                    <img src={opt.image} alt={opt.name} />
                  ) : (
                    <div className="combo-option-placeholder">🥐</div>
                  )}
                </div>
                <div className="combo-option-info">
                  <h3 style={{ textDecoration: isOptionDisabled ? 'line-through' : 'none' }}>
                    {opt.name} {isOptionDisabled && <span style={{ fontSize: '0.8em', color: '#ef4444', fontWeight: 'bold', marginLeft: '5px' }}>(Agotado)</span>}
                  </h3>
                </div>
                <div className="combo-option-controls">
                  <button 
                    type="button"
                    className="combo-ctrl-btn" 
                    onClick={() => handleDecrement(opt.name)}
                    disabled={!quantities[opt.name] || isOptionDisabled}
                  >
                    <FaMinus />
                  </button>
                  <span className="combo-qty">{quantities[opt.name] || 0}</span>
                  <button 
                    type="button"
                    className="combo-ctrl-btn" 
                    onClick={() => handleIncrement(opt.name)}
                    disabled={totalSelected >= totalRequired || isOptionDisabled}
                  >
                    <FaPlus />
                  </button>
                </div>
              </div>
            );
          })}
          {(!product.comboOptions || product.comboOptions.length === 0) && (
            <div className="combo-empty-state">No hay opciones configuradas para este combo.</div>
          )}
        </div>

        <div className="combo-modal-footer">
          <button 
            type="button"
            className="combo-add-btn" 
            disabled={!isComplete}
            onClick={handleAdd}
          >
            {isComplete ? 'Agregar al Carrito' : `Faltan elegir ${totalRequired - totalSelected}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
