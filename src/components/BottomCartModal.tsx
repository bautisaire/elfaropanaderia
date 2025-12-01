import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import "./BottomCartModal.css"; // We will create this file

export default function BottomCartModal() {
  const { showBottomModal, setShowBottomModal, cartQuantity, cartTotal } = useCart();
  const navigate = useNavigate();

  return (
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
            onClick={() => {
              setShowBottomModal(false);
              navigate("/carrito");
            }}
          >
            Ir a pagar
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '8px' }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      {/* Overlay to close when clicking outside (optional, but good UX) */}
      {showBottomModal && (
        <div className="modal-overlay" onClick={() => setShowBottomModal(false)} />
      )}
    </div>
  );
}