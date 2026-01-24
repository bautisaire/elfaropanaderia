import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useContext, useEffect } from "react";
import { CartContext } from "./context/CartContext";
import Home from "./pages/Home";
import Carrito from "./pages/Carrito";
import Checkout from "./pages/Checkout";
import Header from "./components/HeaderTemp";
import Footer from "./components/Footer";
import Editor from "./pages/Editor";
import Proximamente from "./pages/Proximamente";
import MyOrders from "./pages/MyOrders";

function Layout() {
  const location = useLocation();
  const isEditor = location.pathname.toLowerCase().startsWith('/editor');

  const { isStoreOpen, isStoreClosedDismissed } = useContext(CartContext);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      {/* Lights Off Global Overlay (Only if not editor, store is closed, and NOT dismissed) */}
      {!isEditor && !isStoreOpen && !isStoreClosedDismissed && (
        <div className="lights-off-overlay"></div>
      )}

      {!isEditor && <Header />}
      <div style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/carrito" element={<Carrito />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/mis-pedidos" element={<MyOrders />} />
          <Route path="/Proximamente" element={<Proximamente />} />
        </Routes>
      </div>
      {!isEditor && <Footer />}
    </div>
  );
}

export default function App() {
  // Global Listener to prevent scroll changing number inputs
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // @ts-ignore
      if (document.activeElement?.type === "number") {
        // @ts-ignore
        document.activeElement.blur();
      }
    };

    document.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      document.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return (
    <Router>
      <Layout />
    </Router>
  );
}