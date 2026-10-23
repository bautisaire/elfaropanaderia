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
  maxQuantity?: number;
}

export default function ComboSelectionModal({ product, isOpen, onClose, onAddToCart }: ComboSelectionModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const totalRequired = product.comboItemsCount || 0;
  // Combo de 1 ítem que permite sumar varias opciones/unidades (sin tope).
  const isFreeChoice = totalRequired === 1 && !!product.comboAllowMultiple;
  const isSingleChoice = totalRequired === 1 && !isFreeChoice;
  // Elección simple: una sola opción y una sola unidad por combo.
  const singleChoiceMax = 1;

  useEffect(() => {
    if (isOpen) {
      let initialQuantities: Record<string, number> = {};
      if (product.comboOptions && product.comboOptions.length > 0 && totalRequired > 0 && !isSingleChoice && !isFreeChoice) {
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
  }, [isOpen, product.comboOptions, totalRequired, isSingleChoice, isFreeChoice]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !product.isCombo) return null;

  const totalSelected = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const isComplete = (isSingleChoice || isFreeChoice) ? totalSelected > 0 : totalSelected === totalRequired;

  const handleIncrement = (optionName: string) => {
    if (isFreeChoice || totalSelected < totalRequired) {
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

  // Elección simple: una vez elegida una opción, el resto queda bloqueado
  // hasta que se quite la elegida.
  const handleSingleChoice = (optionName: string) => {
    setQuantities(prev => {
      const total = Object.values(prev).reduce((sum, q) => sum + q, 0);
      if (prev[optionName] || total >= singleChoiceMax) return prev;
      return { ...prev, [optionName]: 1 };
    });
  };

  const handleSingleChoiceDecrement = (optionName: string) => {
    setQuantities(prev => {
      const current = prev[optionName] || 0;
      if (current <= 1) {
        return Object.fromEntries(Object.entries(prev).filter(([name]) => name !== optionName));
      }
      return { ...prev, [optionName]: current - 1 };
    });
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
          <h2>{isSingleChoice ? 'Seleccioná' : 'Armá'} tu {product.name}</h2>
          <p className="combo-progress">
            {isFreeChoice ? (
              <>Elegí las que quieras: <strong>{totalSelected}</strong> seleccionadas</>
            ) : isSingleChoice ? (
              <>Elegí <strong>1</strong> opción</>
            ) : (
              <>Seleccionadas: <strong>{totalSelected}</strong> / {totalRequired}</>
            )}
          </p>
          <div className="combo-progress-bar">
            <div
              className="combo-progress-fill"
              style={{ width: `${isFreeChoice ? (totalSelected > 0 ? 100 : 0) : (totalSelected / (isSingleChoice ? singleChoiceMax : totalRequired)) * 100}%`, background: isComplete ? '#3EE8CB' : '#f59e0b' }}
            ></div>
          </div>
        </div>

        <div className="combo-options-list">
          {product.comboOptions?.map((opt, idx) => {
            const isOptionDisabled = (opt as any).disabled;
            const isSelected = isSingleChoice && (quantities[opt.name] || 0) > 0;
            const isBlockedBySelection = isSingleChoice && totalSelected >= singleChoiceMax && !isSelected;
            return (
              <div
                key={idx}
                className={`combo-option-item${isBlockedBySelection ? ' combo-option-item-blocked' : ''}`}
                style={{ opacity: isOptionDisabled ? 0.5 : 1 }}
              >
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
                {isSingleChoice ? (
                  isSelected ? (
                    <button
                      type="button"
                      className="combo-choose-btn"
                      onClick={() => handleSingleChoiceDecrement(opt.name)}
                    >
                      Quitar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="combo-choose-btn"
                      onClick={() => handleSingleChoice(opt.name)}
                      disabled={isOptionDisabled || isBlockedBySelection}
                    >
                      Elegir
                    </button>
                  )
                ) : (
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
                      disabled={(!isFreeChoice && totalSelected >= totalRequired) || isOptionDisabled}
                    >
                      <FaPlus />
                    </button>
                  </div>
                )}
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
            {isComplete
              ? 'Agregar al Carrito'
              : ((isSingleChoice || isFreeChoice) ? 'Seleccioná una opción' : `Faltan elegir ${totalRequired - totalSelected}`)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
