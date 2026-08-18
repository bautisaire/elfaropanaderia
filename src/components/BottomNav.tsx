import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CartContext } from "../context/CartContext";
import { db } from "../firebase/firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";
import { FaHome, FaHeart, FaShoppingCart, FaUser, FaClipboardList } from "react-icons/fa";
import "./BottomNav.css";

export default function BottomNav() {
    const navigate = useNavigate();
    const location = useLocation();
    const { cart, setIsSidebarOpen } = useContext(CartContext);

    const [activeOrdersCount, setActiveOrdersCount] = useState(0);
    const [isCartBumping, setIsCartBumping] = useState(false);
    const previousTotalRef = useRef(0);
    const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bumpFrameRef = useRef<number | null>(null);

    const totalItems = cart.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);

    useEffect(() => {
        if (totalItems > previousTotalRef.current) {
            setIsCartBumping(false);
            if (bumpFrameRef.current !== null) cancelAnimationFrame(bumpFrameRef.current);
            if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);

            bumpFrameRef.current = requestAnimationFrame(() => {
                setIsCartBumping(true);
                bumpTimerRef.current = setTimeout(() => setIsCartBumping(false), 550);
            });
        }

        previousTotalRef.current = totalItems;

        return () => {
            if (bumpFrameRef.current !== null) cancelAnimationFrame(bumpFrameRef.current);
            if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
        };
    }, [totalItems]);

    const isHome = location.pathname === "/";
    const isFavoritos = location.pathname.startsWith("/favoritos");
    const isCuenta = location.pathname.startsWith("/mi-cuenta");
    const isPedidos = location.pathname.startsWith("/mis-pedidos");

    const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

    const navigateAndScroll = (path: string) => {
        if (location.pathname !== path) navigate(path);
        scrollToTop();
    };

    const goHome = () => navigateAndScroll("/");

    // Watch the most recent locally-tracked order for an active status badge
    useEffect(() => {
        const unsubscribers: (() => void)[] = [];
        const activeOrderMaps = new Map<string, boolean>();

        const fetchOrders = () => {
            unsubscribers.forEach(unsub => unsub());
            unsubscribers.length = 0;
            activeOrderMaps.clear();

            const storedIds = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
            const validIds: string[] = storedIds
                .map((item: any) => String(typeof item === 'object' ? (item.id || item.orderId) : item))
                .filter((id: string) => id && id !== 'undefined' && id !== 'null');

            if (validIds.length === 0) {
                setActiveOrdersCount(0);
                return;
            }

            // Only track the most recent order to avoid evaluating old history
            const activeIds = [validIds[validIds.length - 1]];

            activeIds.forEach(id => {
                const unsub = onSnapshot(doc(db, "orders", id), (snapshot) => {
                    if (snapshot.exists()) {
                        const status = snapshot.data().status;
                        activeOrderMaps.set(id, status !== 'entregado' && status !== 'cancelado');
                    } else {
                        activeOrderMaps.set(id, false);
                    }

                    let count = 0;
                    activeOrderMaps.forEach(isActive => { if (isActive) count++; });
                    setActiveOrdersCount(count);
                });
                unsubscribers.push(unsub);
            });
        };

        fetchOrders();

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'mis_pedidos') fetchOrders();
        };
        const handleLocalChange = () => fetchOrders();

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('mis_pedidos_updated', handleLocalChange);

        return () => {
            unsubscribers.forEach(unsub => unsub());
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('mis_pedidos_updated', handleLocalChange);
        };
    }, []);

    return (
        <nav className="bottom-nav">
            <button
                className={`bottom-nav-item ${isHome ? "active" : ""}`}
                onClick={goHome}
                aria-label="Inicio"
            >
                <FaHome />
                <span>Inicio</span>
            </button>

            <button
                className={`bottom-nav-item ${isFavoritos ? "active" : ""}`}
                onClick={() => navigateAndScroll("/favoritos")}
                aria-label="Favoritos"
            >
                <FaHeart />
                <span>Favoritos</span>
            </button>

            <div className="bottom-nav-cart-slot">
                <button
                    className={`bottom-nav-cart-btn ${isCartBumping ? 'cart-bump' : ''}`}
                    onClick={() => setIsSidebarOpen(true)}
                    aria-label="Abrir carrito"
                >
                    <FaShoppingCart />
                    {totalItems > 0 && <span className="bottom-nav-cart-badge">{totalItems}</span>}
                </button>
            </div>

            <button
                className={`bottom-nav-item ${isPedidos ? "active" : ""}`}
                onClick={() => navigateAndScroll("/mis-pedidos")}
                aria-label="Mis Pedidos"
                style={{ position: 'relative' }}
            >
                <FaClipboardList />
                <span>Pedidos</span>
                {activeOrdersCount > 0 && <span className="bottom-nav-item-badge">{activeOrdersCount}</span>}
            </button>

            <button
                className={`bottom-nav-item ${isCuenta ? "active" : ""}`}
                onClick={() => navigateAndScroll("/mi-cuenta")}
                aria-label="Mi Cuenta"
            >
                <FaUser />
                <span>Cuenta</span>
            </button>
        </nav>
    );
}
