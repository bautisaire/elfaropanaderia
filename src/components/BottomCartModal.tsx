import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import "./BottomCartModal.css";
import { useState } from "react";
import { validateCartStock } from "../utils/stockValidation";
import StockErrorModal from "./StockErrorModal";

export default function BottomCartModal() {
  const { showBottomModal, setShowBottomModal, cartQuantity, cartTotal, cart, removeFromCart } = useCart();
  const navigate = useNavigate();
  const [stockError, setStockError] = useState<{ isOpen: boolean, items: any[] }>({ isOpen: false, items: [] });
  const [validating, setValidating] = useState(false);

  const handleStockFix = () => {
    stockError.items.forEach(item => removeFromCart(item.id));
    setStockError({ ...stockError, isOpen: false });
  };

  const handlePay = async () => {
    setValidating(true);
    const result = await validateCartStock(cart);
    setValidating(false);

    if (!result.isValid) {
      setStockError({ isOpen: true, items: result.outOfStockItems });
    } else {
      setShowBottomModal(false);
      navigate("/carrito");
    }
  };

  return (
    <>
      <StockErrorModal
        isOpen={stockError.isOpen}
        onClose={() => setStockError({ ...stockError, isOpen: false })}
        onConfirm={handleStockFix}
        outOfStockItems={stockError.items}
      />

      <div className={`bottom-modal-container ${showBottomModal && cartQuantity > 0 ? "visible" : ""}`}>
        <div className="bottom-modal-content">
          <div className="modal-info">
            <div className="modal-quantity">
              <span className="badge">{cartQuantity}</span>
              <span>Pedidos</span>
            </div>
            <div className="modal-total">
              Total: <span>${Math.floor(cartTotal)}</span>
            </div>
          </div>

          <div className="modal-actions">
            <button
              className="btn-pay"
              onClick={handlePay}
              disabled={validating}
            >
              {validating ? "Verificando..." : "Ir a pagar"}
              {!validating && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '8px' }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              )}
            </button>
          </div>
        </div>
        {/* Overlay to close when clicking outside (optional, but good UX) */}
        {showBottomModal && (
          <div className="modal-overlay" onClick={() => setShowBottomModal(false)} />
        )}
      </div>
    </>
  );
}