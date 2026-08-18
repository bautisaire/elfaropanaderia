import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useContext, useEffect, lazy, Suspense } from "react";
import { CartContext } from "./context/CartContext";
import Home from "./pages/Home";
import Checkout from "./pages/Checkout";
import Header from "./components/HeaderTemp";
import Footer from "./components/Footer";
import Proximamente from "./pages/Proximamente";
import DebugConsole from "./components/DebugConsole";
import GlobalAdminNotifications from "./components/GlobalAdminNotifications";
import BottomNav from "./components/BottomNav";

import CartSidebar from "./components/CartSidebar";

// Rutas que el cliente normal no visita: se descargan solo al entrar en ellas.
const Editor = lazy(() => import("./pages/Editor"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
const MisPedidos = lazy(() => import("./pages/MisPedidos"));
const RuletaPage = lazy(() => import("./pages/RuletaPage"));

function Layout() {
  const location = useLocation();
  const isEditor = location.pathname.toLowerCase().startsWith('/editor');
  const isRuleta = location.pathname.toLowerCase().startsWith('/ruleta');

  const cartContext = useContext(CartContext);

  const isStoreOpen = cartContext?.isStoreOpen ?? true;
  const isStoreClosedDismissed = cartContext?.isStoreClosedDismissed ?? false;

  // Determinamos si es Admin revisando el context o la configuración local
  const isAdmin = cartContext?.isAdmin ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      {/* Lights Off Global Overlay (Only if not editor, not ruleta, store is closed, and NOT dismissed) */}
      {!isEditor && !isRuleta && !isStoreOpen && !isStoreClosedDismissed && (
        <div className="lights-off-overlay"></div>
      )}

      {/* Admin Debug Console */}
      <DebugConsole />

      {/* Global Notifications for Admins (Active Anywhere) */}
      {isAdmin && cartContext?.adminPermissions?.is_rider !== true && <GlobalAdminNotifications />}

      {!isEditor && !isRuleta && <Header />}

      {/* Cart Sidebar rendered globally */}
      {!isEditor && !isRuleta && <CartSidebar />}

      {/* Mobile Bottom Navigation (storefront only, not the admin panel itself) */}
      {!isEditor && !isRuleta && <BottomNav />}

      <div style={{ flex: 1 }}>
        <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/editor/*" element={<Editor />} />
            <Route path="/mi-cuenta/*" element={<MyAccount />} />
            <Route path="/mis-pedidos" element={<MisPedidos />} />
            <Route path="/Proximamente" element={<Proximamente />} />
            <Route path="/ruleta" element={<RuletaPage />} />
          </Routes>
        </Suspense>
      </div>
      {!isEditor && !isRuleta && <Footer />}
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

  // Silenciar AbortError "Uncaught (in promise)" que dispara el SDK de Firestore
  // cuando desuscribe listeners internos (long-polling / fetch streams).
  // No afecta la funcionalidad: es ruido en consola únicamente.
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      const isAbort =
        reason &&
        (reason.name === 'AbortError' ||
          reason.code === 20 ||
          (typeof reason.message === 'string' && reason.message.includes('aborted')));
      if (isAbort) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  return (
    <Router>
      <Layout />
    </Router>
  );
}