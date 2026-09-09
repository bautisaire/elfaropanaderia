import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product, useCart } from '../context/CartContext';
import { FaTimes, FaMinus, FaPlus } from 'react-icons/fa';
import './ComboSelectionModal.css';

interface VariantSelectionModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (selections: { variantName: string; quantity: number }[]) => void;
}

export default function VariantSelectionModal({ product, isOpen, onClose, onAddToCart }: VariantSelectionModalProps) {
  const { getStockForProduct, cart } = useCart();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) setQuantities({});
  }, [isOpen, product.id]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  if (!isOpen || !product.variants || product.variants.length === 0) return null;

  const getVariantMax = (variantName: string) => {
    const rawMax = getStockForProduct(product.id, variantName);
    const inCart = cart.find((item) => item.id === `${product.id}-${variantName}`)?.quantity || 0;
    return Math.max(0, rawMax - inCart);
  };

  const totalSelected = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  const handleIncrement = (variantName: string) => {
    const current = quantities[variantName] || 0;
    if (current < getVariantMax(variantName)) {
      setQuantities(prev => ({ ...prev, [variantName]: current + 1 }));
    }
  };

  const handleDecrement = (variantName: string) => {
    if (quantities[variantName] > 0) {
      setQuantities(prev => ({ ...prev, [variantName]: prev[variantName] - 1 }));
    }
  };

  const handleAdd = () => {
    if (totalSelected === 0) return;
    const selections = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([variantName, quantity]) => ({ variantName, quantity }));

    onAddToCart(selections);
    onClose();
  };

  return createPortal(
    <div className="combo-modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="combo-modal-content" onClick={e => e.stopPropagation()}>
        <button type="button" className="combo-close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <FaTimes />
        </button>

        <div className="combo-modal-header">
          <h2>Elegí tu {product.name}</h2>
          <p className="combo-progress">
            Cantidad: <strong>{totalSelected}</strong>
          </p>
        </div>

        <div className="combo-options-list">
          {product.variants.map((variant, idx) => {
            const max = getVariantMax(variant.name);
            const isOptionDisabled = max <= 0;
            const qty = quantities[variant.name] || 0;
            return (
              <div key={idx} className="combo-option-item" style={{ opacity: isOptionDisabled ? 0.5 : 1 }}>
                <div className="combo-option-img-wrapper">
                  {variant.image ? (
                    <img src={variant.image} alt={variant.name} />
                  ) : (
                    <div className="combo-option-placeholder">🥐</div>
                  )}
                </div>
                <div className="combo-option-info">
                  <h3 style={{ textDecoration: isOptionDisabled ? 'line-through' : 'none' }}>
                    {variant.name} {isOptionDisabled && <span style={{ fontSize: '0.8em', color: '#ef4444', fontWeight: 'bold', marginLeft: '5px' }}>(Agotado)</span>}
                  </h3>
                </div>
                <div className="combo-option-controls">
                  <button
                    type="button"
                    className="combo-ctrl-btn"
                    onClick={() => handleDecrement(variant.name)}
                    disabled={!qty}
                  >
                    <FaMinus />
                  </button>
                  <span className="combo-qty">{qty}</span>
                  <button
                    type="button"
                    className="combo-ctrl-btn"
                    onClick={() => handleIncrement(variant.name)}
                    disabled={isOptionDisabled || qty >= max}
                  >
                    <FaPlus />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="combo-modal-footer">
          <button
            type="button"
            className="combo-add-btn"
            disabled={totalSelected === 0}
            onClick={handleAdd}
          >
            {totalSelected > 0 ? `Agregar ${totalSelected} al Carrito` : 'Seleccioná una opción'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
