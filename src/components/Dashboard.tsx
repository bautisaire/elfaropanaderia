import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, onSnapshot } from "firebase/firestore";
import "./Dashboard.css";
import { FaMoneyBillWave, FaShoppingCart, FaBox, FaEye } from "react-icons/fa";

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalSales: 0,
        totalOrders: 0,
        totalStock: 0,
        visits: 0,
        // New Metrics
        onlineSales: 0,
        onlineCount: 0,
        localSales: 0,
        localCount: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubOrders: () => void;
        let unsubProducts: () => void;
        let unsubStats: () => void;

        const setupListeners = async () => {
            try {
                // 1. Orders Listener
                unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
                    const orders = snapshot.docs.map(doc => doc.data());
                    const totalOrders = orders.length;
                    const validOrders = orders.filter((o: any) => o.status !== 'cancelado');
                    const totalSales = validOrders.reduce((acc, order: any) => acc + (Number(order.total) || 0), 0);

                    // Split Logic
                    let onlineSales = 0;
                    let onlineCount = 0;
                    let localSales = 0;
                    let localCount = 0;

                    validOrders.forEach((order: any) => {
                        const amount = Number(order.total) || 0;
                        if (order.source === 'pos') {
                            localSales += amount;
                            localCount++;
                        } else {
                            // Default to online if source is 'online' or undefined (legacy)
                            onlineSales += amount;
                            onlineCount++;
                        }
                    });

                    setStats(prev => ({
                        ...prev,
                        totalOrders,
                        totalSales,
                        onlineSales,
                        onlineCount,
                        localSales,
                        localCount
                    }));
                });

                // 2. Products Listener (Stock)
                unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
                    let totalStock = 0;
                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        // Only count as variant product if variants exist AND array is not empty
                        if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
                            data.variants.forEach((v: any) => totalStock += (Number(v.stockQuantity) || 0));
                        } else {
                            // Simple product stock
                            totalStock += (Number(data.stockQuantity) || 0);
                        }
                    });
                    setStats(prev => ({ ...prev, totalStock }));
                });

                // 3. Stats Listener (Visits)
                unsubStats = onSnapshot(doc(db, "stats", "general"), (docSnap) => {
                    if (docSnap.exists()) {
                        setStats(prev => ({ ...prev, visits: docSnap.data().visits || 0 }));
                    } else {
                        // If doc doesn't exist yet (first time), visits is 0
                        setStats(prev => ({ ...prev, visits: 0 }));
                    }
                });

                setLoading(false);

            } catch (error) {
                console.error("Error setting up dashboard listeners:", error);
                setLoading(false);
            }
        };

        setupListeners();

        return () => {
            if (unsubOrders) unsubOrders();
            if (unsubProducts) unsubProducts();
            if (unsubStats) unsubStats();
        };
    }, []);

    if (loading) return <div className="dashboard-loading">Cargando estadísticas...</div>;

    return (
        <div className="dashboard-container">
            <h2>Panel de Control</h2>

            <div className="stats-grid">
                {/* Card 1: Ventas Totales */}
                <div className="stat-card sales">
                    <div className="stat-icon"><FaMoneyBillWave /></div>
                    <div className="stat-info">
                        <h3>Ingresos</h3>
                        <p>${Math.floor(stats.totalSales).toLocaleString('es-AR')}</p>
                    </div>
                </div>

                {/* Card 2: Pedidos */}
                <div className="stat-card orders">
                    <div className="stat-icon"><FaShoppingCart /></div>
                    <div className="stat-info">
                        <h3>Ventas Totales</h3>
                        <p>{stats.totalOrders}</p>
                    </div>
                </div>

                {/* Sub-Card: Ventas Online */}
                <div className="stat-card online-sales" style={{ borderLeft: '4px solid #3b82f6' }}>
                    <div className="stat-info">
                        <h3>Ventas Online</h3>
                        <p>${Math.floor(stats.onlineSales).toLocaleString('es-AR')}</p>
                        <span style={{ fontSize: '0.8rem', color: '#666' }}>({stats.onlineCount} pedidos)</span>
                    </div>
                </div>

                {/* Sub-Card: Ventas Local */}
                <div className="stat-card local-sales" style={{ borderLeft: '4px solid #10b981' }}>
                    <div className="stat-info">
                        <h3>Ventas Local</h3>
                        <p>${Math.floor(stats.localSales).toLocaleString('es-AR')}</p>
                        <span style={{ fontSize: '0.8rem', color: '#666' }}>({stats.localCount} pedidos)</span>
                    </div>
                </div>

                {/* Card 3: Stock */}
                <div className="stat-card stock">
                    <div className="stat-icon"><FaBox /></div>
                    <div className="stat-info">
                        <h3>Stock Total</h3>
                        <p>{stats.totalStock}</p>
                    </div>
                </div>

                {/* Card 4: Visitas */}
                <div className="stat-card visits">
                    <div className="stat-icon"><FaEye /></div>
                    <div className="stat-info">
                        <h3>Visitas Web</h3>
                        <p>{stats.visits.toLocaleString('es-AR')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
