import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, onSnapshot } from "firebase/firestore";
import "./Dashboard.css";
import { FaMoneyBillWave, FaShoppingCart, FaEye } from "react-icons/fa";

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
        localCount: 0,
        wholesaleSales: 0,
        wholesaleCount: 0,
        // Detailed Metrics (Today/Month)
        onlineSalesToday: 0,
        onlineSalesMonth: 0,
        localSalesToday: 0,
        localSalesMonth: 0,
        wholesaleSalesToday: 0,
        wholesaleSalesMonth: 0
    });
    const [loading, setLoading] = useState(true);

    // Helpers for Timezone (Argentina)
    const getArgentinaDate = (date: Date) => {
        return new Date(date.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    };

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    const isSameMonth = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth();
    };

    useEffect(() => {
        let unsubOrders: () => void;
        let unsubProducts: () => void;
        let unsubStats: () => void;

        const setupListeners = async () => {
            try {
                // 1. Orders Listener
                unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
                    const orders = snapshot.docs.map(doc => doc.data());
                    const validOrders = orders.filter((o: any) => o.status !== 'cancelado');

                    const totalOrders = validOrders.length;
                    const totalSales = validOrders.reduce((acc, order: any) => acc + (Number(order.total) || 0), 0);

                    // Split Logic
                    // Split Logic
                    let onlineSales = 0;
                    let onlineCount = 0;
                    let localSales = 0;
                    let localCount = 0;
                    let wholesaleSales = 0;
                    let wholesaleCount = 0;

                    let onlineSalesToday = 0;
                    let onlineSalesMonth = 0;
                    let localSalesToday = 0;
                    let localSalesMonth = 0;
                    let wholesaleSalesToday = 0;
                    let wholesaleSalesMonth = 0;

                    const nowArgentina = getArgentinaDate(new Date());

                    validOrders.forEach((order: any) => {
                        const amount = Number(order.total) || 0;

                        // Parse Date
                        let orderDate: Date;
                        if (order.date && typeof order.date.toDate === 'function') {
                            orderDate = order.date.toDate();
                        } else if (order.date) {
                            orderDate = new Date(order.date);
                        } else {
                            // Fallback if no date (shouldn't happen on new orders)
                            orderDate = new Date(0);
                        }

                        const orderDateArgentina = getArgentinaDate(orderDate);

                        const isToday = isSameDay(nowArgentina, orderDateArgentina);
                        const isThisMonth = isSameMonth(nowArgentina, orderDateArgentina);

                        if (order.source === 'pos_public' || order.source === 'pos') {
                            localSales += amount;
                            localCount++;
                            if (isToday) localSalesToday += amount;
                            if (isThisMonth) localSalesMonth += amount;
                        } else if (order.source === 'pos_wholesale') {
                            wholesaleSales += amount;
                            wholesaleCount++;
                            if (isToday) wholesaleSalesToday += amount;
                            if (isThisMonth) wholesaleSalesMonth += amount;
                        } else {
                            // Default to online if source is 'online' or undefined (legacy)
                            onlineSales += amount;
                            onlineCount++;
                            if (isToday) onlineSalesToday += amount;
                            if (isThisMonth) onlineSalesMonth += amount;
                        }
                    });

                    setStats(prev => ({
                        ...prev,
                        totalOrders,
                        totalSales,
                        onlineSales,
                        onlineCount,
                        localSales,
                        localCount,
                        wholesaleSales,
                        wholesaleCount,
                        onlineSalesToday,
                        onlineSalesMonth,
                        localSalesToday,
                        localSalesMonth,
                        wholesaleSalesToday,
                        wholesaleSalesMonth
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
                    // Round to 3 decimals
                    totalStock = Math.round(totalStock * 1000) / 1000;
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
                        <h3>Ingresos Totales</h3>
                        <p>${Math.floor(stats.totalSales).toLocaleString('es-AR')}</p>
                    </div>
                </div>

                {/* Card 2: Stock
                <div className="stat-card stock">
                    <div className="stat-icon"><FaBox /></div>
                    <div className="stat-info">
                        <h3>Stock Total</h3>
                        <p>{stats.totalStock}</p>
                    </div>
                </div> */}

                {/* Sub-Card: Ventas Despensa (Wholesale) */}
                <div className="stat-card wholesale-sales" style={{ borderLeft: '4px solid #8b5cf6', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                        <div className="stat-icon-small" style={{ color: '#8b5cf6' }}><FaShoppingCart /></div>
                        <h3 style={{ margin: 0 }}>Ventas Despensa</h3>
                    </div>

                    <div className="stat-detail-row">
                        <span>Hoy:</span>
                        <strong>${Math.floor(stats.wholesaleSalesToday).toLocaleString('es-AR')}</strong>
                    </div>
                    <div className="stat-detail-row">
                        <span>Mes:</span>
                        <strong>${Math.floor(stats.wholesaleSalesMonth).toLocaleString('es-AR')}</strong>
                    </div>
                    <div className="stat-detail-row total">
                        <span>Total:</span>
                        <strong>${Math.floor(stats.wholesaleSales).toLocaleString('es-AR')}</strong>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>({stats.wholesaleCount} pedidos)</span>
                </div>

                {/* Sub-Card: Ventas Local */}
                <div className="stat-card local-sales" style={{ borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                        <div className="stat-icon-small" style={{ color: '#10b981' }}><FaShoppingCart /></div>
                        <h3 style={{ margin: 0 }}>Ventas Local</h3>
                    </div>

                    <div className="stat-detail-row">
                        <span>Hoy:</span>
                        <strong>${Math.floor(stats.localSalesToday).toLocaleString('es-AR')}</strong>
                    </div>
                    <div className="stat-detail-row">
                        <span>Mes:</span>
                        <strong>${Math.floor(stats.localSalesMonth).toLocaleString('es-AR')}</strong>
                    </div>
                    <div className="stat-detail-row total">
                        <span>Total:</span>
                        <strong>${Math.floor(stats.localSales).toLocaleString('es-AR')}</strong>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>({stats.localCount} tickets)</span>
                </div>

                {/* Sub-Card: Ventas Online */}
                <div className="stat-card online-sales" style={{ borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                        <div className="stat-icon-small" style={{ color: '#3b82f6' }}><FaShoppingCart /></div>
                        <h3 style={{ margin: 0 }}>Ventas Online</h3>
                    </div>

                    <div className="stat-detail-row">
                        <span>Hoy:</span>
                        <strong>${Math.floor(stats.onlineSalesToday).toLocaleString('es-AR')}</strong>
                    </div>
                    <div className="stat-detail-row">
                        <span>Mes:</span>
                        <strong>${Math.floor(stats.onlineSalesMonth).toLocaleString('es-AR')}</strong>
                    </div>
                    <div className="stat-detail-row total">
                        <span>Total:</span>
                        <strong>${Math.floor(stats.onlineSales).toLocaleString('es-AR')}</strong>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>({stats.onlineCount} pedidos)</span>
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
