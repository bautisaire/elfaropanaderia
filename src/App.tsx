import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useContext } from "react";
import { CartContext } from "./context/CartContext";
import Home from "./pages/Home";
import Carrito from "./pages/Carrito";
import Checkout from "./pages/Checkout";
import Header from "./components/HeaderTemp";
import Footer from "./components/Footer";
import Editor from "./pages/Editor";
import Proximamente from "./pages/Proximamente";

function Layout() {
  const location = useLocation();
  const isEditor = location.pathname.startsWith('/editor');

  const { isStoreOpen } = useContext(CartContext);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      {/* Lights Off Global Overlay (Only if not editor and store is closed) */}
      {!isEditor && !isStoreOpen && (
        <div className="lights-off-overlay"></div>
      )}

      {!isEditor && <Header />}
      <div style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/carrito" element={<Carrito />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/Proximamente" element={<Proximamente />} />
        </Routes>
      </div>
      {!isEditor && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Layout />
    </Router>
  );
}