import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";

export default function BottomCartModal() {
  const { showBottomModal, setShowBottomModal, cartQuantity, cartTotal } = useCart();
  const navigate = useNavigate();

  return (
    <div
      aria-hidden={!showBottomModal}
      onClick={() => setShowBottomModal(false)}
      style={{
        position: "fixed",
        left: "50%",
        transform: `translate(-50%, ${showBottomModal ? "0" : "110%"})`,
        bottom: 20,
        transition: "transform 350ms ease, opacity 350ms ease",
        opacity: showBottomModal ? 1 : 0,
        zIndex: 9999,
        width: "min(720px, calc(100% - 32px))",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          padding: "12px 16px",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>{cartQuantity} producto(s) en el carrito</div>
          <div style={{ color: "#555" }}>Total: ${cartTotal.toFixed(2)}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              setShowBottomModal(false);
              navigate("/carrito");
            }}
            style={{
              background: "#ff9d0bff",
              color: "#fff",
              border: "none",
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Pagar
          </button>

          <button
            onClick={() => setShowBottomModal(false)}
            style={{
              background: "transparent",
              border: "1px solid #ddd",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}