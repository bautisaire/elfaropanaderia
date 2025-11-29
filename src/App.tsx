import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Carrito from "./pages/Carrito";
import Checkout from "./pages/Checkout";
import Header from "./components/HeaderTemp";
import LoginModal from "./components/LoginModal";
import { useCart } from "./context/CartContext";
import Editor from "./pages/Editor";
import Proximamente from "./pages/Proximamente";

export default function App() {
  const { showLoginModal, setShowLoginModal } = useCart();

  return (
    <Router>
      <Header />

      {/* 🔥 Modal global */}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}

      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/carrito" element={<Carrito />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/" element={<Proximamente />} />
      </Routes>
    </Router>
  );
}