import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useContext, useEffect } from "react";
import { CartContext } from "./context/CartContext";
import Home from "./pages/Home";
import Checkout from "./pages/Checkout";
import Header from "./components/HeaderTemp";
import Footer from "./components/Footer";
import Editor from "./pages/Editor";
import Proximamente from "./pages/Proximamente";
import DebugConsole from "./components/DebugConsole";
import MyAccount from "./pages/MyAccount";
import GlobalAdminNotifications from "./components/GlobalAdminNotifications";

import CartSidebar from "./components/CartSidebar";

function Layout() {
  const location = useLocation();
  const isEditor = location.pathname.toLowerCase().startsWith('/editor');

  const cartContext = useContext(CartContext);

  const isStoreOpen = cartContext?.isStoreOpen ?? true;
  const isStoreClosedDismissed = cartContext?.isStoreClosedDismissed ?? false;

  // Determinamos si es Admin revisando el context o la configuración local
  const isAdmin = cartContext?.isAdmin ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      {/* Lights Off Global Overlay (Only if not editor, store is closed, and NOT dismissed) */}
      {!isEditor && !isStoreOpen && !isStoreClosedDismissed && (
        <div className="lights-off-overlay"></div>
      )}

      {/* Admin Debug Console */}
      <DebugConsole />

      {/* Global Notifications for Admins (Active Anywhere) */}
      {isAdmin && <GlobalAdminNotifications />}

      {!isEditor && <Header />}

      {/* Cart Sidebar rendered globally */}
      {!isEditor && <CartSidebar />}

      <div style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/editor/*" element={<Editor />} />
          <Route path="/mi-cuenta" element={<MyAccount />} />
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
    const handleWheel = () => {
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