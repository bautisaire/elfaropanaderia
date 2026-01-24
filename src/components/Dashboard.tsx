import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, onSnapshot } from "firebase/firestore";
import "react-datepicker/dist/react-datepicker.css";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from 'date-fns/locale/es';
import "./Dashboard.css";
import { FaMoneyBillWave, FaShoppingCart, FaEye, FaCalendarDay, FaCalendarWeek, FaCalendarAlt, FaCalendarPlus } from "react-icons/fa";

registerLocale('es', es);

// Interface for aggregated product data
interface ProductSale {
    id: string;
    name: string;
    variant?: string;
    quantity: number;
    total: number;
}

export default function Dashboard() {
    const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'custom'>('day');
    const [customRange, setCustomRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
    const [tempCustomRange, setTempCustomRange] = useState<{ start: Date | null; end: Date | null }>({ start: new Date(), end: new Date() });
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [rawOrders, setRawOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [stats, setStats] = useState({
        visits: 0,
        // Current Timeframe Stats
        totalSales: 0,
        totalOrders: 0,
        plata: 0,       // All revenue
        despensa: 0,    // Wholesale
        publico: 0,     // Local POS
        delivery: 0     // Online
    });

    const [topProducts, setTopProducts] = useState<ProductSale[]>([]);
    const [productData, setProductData] = useState<Map<string, any>>(new Map());

    // Helpers for Timezone (Argentina)
    const getArgentinaDate = (date: Date) => {
        return new Date(date.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    };

    // Date Helpers
    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    const isSameMonth = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth();
    };


    // Helper to get week number
    const getWeekNumber = (d: Date) => {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return weekNo;
    }

    const isInTimeframe = (orderDate: Date, timeframe: 'day' | 'week' | 'month' | 'custom') => {
        const nowArg = getArgentinaDate(new Date());
        const dateArg = getArgentinaDate(orderDate);

        if (timeframe === 'custom') {
            if (!customRange.start || !customRange.end) return false;
            // Normalize to ensure we capture the whole day
            const start = new Date(customRange.start);
            start.setHours(0, 0, 0, 0);
            const end = new Date(customRange.end);
            end.setHours(23, 59, 59, 999);
            return dateArg >= start && dateArg <= end;
        }

        if (timeframe === 'day') return isSameDay(nowArg, dateArg);
        if (timeframe === 'month') return isSameMonth(nowArg, dateArg);
        if (timeframe === 'week') {
            // Calculate week number for current date and order date
            return getWeekNumber(nowArg) === getWeekNumber(dateArg) && nowArg.getFullYear() === dateArg.getFullYear();
        }
        return false;
    };


    useEffect(() => {
        let unsubOrders: () => void;
        let unsubStats: () => void;
        let unsubProducts: () => void; // New listener for products

        const setupListeners = async () => {
            try {
                // 0. Fetch Products first to build dependency map
                // We need to listen to products to ensure we have the latest names/dependencies
                unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
                    const productsMap = new Map<string, any>();
                    snapshot.docs.forEach(doc => {
                        productsMap.set(doc.id, { id: doc.id, ...doc.data() });
                    });

                    // 1. Orders Listener (Nested inside to have access to productsMap, or we can use ref)
                    // Better approach: Store products in state or Ref to use in Orders processing
                    // But for simplicity/reactivity, we'll set a local state for products and depend on it.
                    // However, we can't nest listeners easily without re-triggering.
                    // Correct approach: Independent listeners, and a "process" effect that runs when either changes.

                    setProductData(productsMap);
                    // We need a state for product map to trigger reprocessing
                });


                // 1. Orders Listener
                unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
                    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    const processedOrders = orders.map((o: any) => {
                        let orderDate: Date;
                        if (o.date && typeof o.date.toDate === 'function') {
                            orderDate = o.date.toDate();
                        } else if (o.date) {
                            orderDate = new Date(o.date);
                        } else {
                            orderDate = new Date(0);
                        }
                        return { ...o, dateTyped: orderDate };
                    });
                    setRawOrders(processedOrders.sort((a, b) => b.dateTyped.getTime() - a.dateTyped.getTime()));
                });

                // 2. Stats
                unsubStats = onSnapshot(doc(db, "stats", "general"), (docSnap) => {
                    if (docSnap.exists()) {
                        setStats(prev => ({ ...prev, visits: docSnap.data().visits || 0 }));
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

    // Recalculate stats when rawOrders, timeframe, OR productData changes
    useEffect(() => {
        if (!rawOrders) return;

        // If custom timeframe but no range selected (shouldn't happen if UI is correct), skip or show 0
        if (timeframe === 'custom' && (!customRange.start || !customRange.end)) {
            // Maybe keep previous stats or clear? Let's clear to be safe
            // But actually validation in UI prevents this state ideally.
        }

        const validOrders = rawOrders.filter((o: any) => o.status !== 'cancelado');
        const filteredOrders = validOrders.filter(o => isInTimeframe(o.dateTyped, timeframe));

        let plata = 0;
        let despensa = 0;
        let publico = 0;
        let delivery = 0;

        const productMap = new Map<string, ProductSale>();

        filteredOrders.forEach(order => {
            const amount = Number(order.total) || 0;
            plata += amount;

            // Categories
            if (order.source === 'pos_wholesale') {
                despensa += amount;
            } else if (order.source === 'pos_public' || order.source === 'pos') {
                publico += amount;
            } else {
                delivery += amount;
            }

            // Products Aggregation with Dependency Logic
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach((item: any) => {
                    // 1. Identify Product
                    // Some items have ID "parentID-variantID" or just "productID"
                    // Helper to get base ID
                    const isVariant = String(item.id).includes('-');
                    const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);

                    const productInfo = productData.get(baseId);

                    let finalId = item.id;
                    let finalName = item.name;
                    let finalVariant = item.variant;
                    let finalQty = Number(item.quantity) || 0;

                    // 2. Check Dependency (Roll-up)
                    if (productInfo && productInfo.stockDependency && productInfo.stockDependency.productId) {
                        const parentId = productInfo.stockDependency.productId;
                        const parentInfo = productData.get(parentId);

                        if (parentInfo) {
                            // It is a derived product.
                            // Convert to Parent Units
                            const unitsToDeduct = productInfo.stockDependency.unitsToDeduct || 1;
                            finalQty = finalQty * unitsToDeduct;

                            // Override Identity to Parent
                            finalId = parentInfo.id;
                            finalName = parentInfo.nombre; // Use parent name
                            finalVariant = undefined; // Merge into parent base
                        } else {
                            // Fallback: Use baseId if parent info missing (or original logic)
                            // Ideally we want to aggregate by the PRODUCT ID, not the cart item ID which might differ.
                            finalId = baseId;
                        }
                    } else {
                        // Standard product: Use baseId to ensuring grouping by Product, not random item IDs
                        finalId = baseId;
                    }

                    // Normalize variant
                    if (finalVariant) {
                        finalVariant = String(finalVariant).trim();
                    }

                    // GROUP BY NAME - Case Insensitive to handle "Torta" vs "torta"
                    // Key: normalized (lower case)
                    // Display: original name
                    const nameForDisplay = String(finalName).trim();
                    const nameForKey = nameForDisplay.toLowerCase();
                    const key = `${nameForKey}-${finalVariant || 'base'}`;

                    const current = productMap.get(key);
                    const price = Number(item.price) || 0;
                    const lineTotal = (Number(item.quantity) || 0) * price;

                    if (current) {
                        current.quantity += finalQty;
                        current.total += lineTotal;
                    } else {
                        productMap.set(key, {
                            id: finalId, // Keep the last ID encountered for reference
                            name: nameForDisplay, // Store the nice display version
                            variant: finalVariant,
                            quantity: finalQty,
                            total: lineTotal
                        });
                    }
                });
            }
        });

        setStats(prev => ({
            ...prev,
            totalSales: plata,
            totalOrders: filteredOrders.length,
            plata,
            despensa,
            publico,
            delivery
        }));

        setTopProducts(Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity));

    }, [rawOrders, timeframe, productData, customRange]);

    const handleCustomDateChange = (dates: [Date | null, Date | null]) => {
        const [start, end] = dates;
        setTempCustomRange({ start, end });
    };

    const applyCustomFilter = () => {
        if (tempCustomRange.start && tempCustomRange.end) {
            setCustomRange(tempCustomRange);
            setShowCustomPicker(false);
            // Timeframe is already 'custom' or is set here
            // It might be better to set timeframe here if not already
        }
    };


    if (loading) return <div className="dashboard-loading">Cargando estadísticas...</div>;

    const getTimeframeLabel = () => {
        switch (timeframe) {
            case 'day': return 'Hoy';
            case 'week': return 'Esta Semana';
            case 'month': return 'Este Mes';
            case 'custom': return `Del ${customRange.start?.toLocaleDateString('es-AR')} al ${customRange.end?.toLocaleDateString('es-AR')}`;
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h2>Panel de Control</h2>

                <div className="timeframe-selector-row">
                    <div className="timeframe-selector">
                        <button
                            className={`tf-btn ${timeframe === 'day' ? 'active' : ''}`}
                            onClick={() => { setTimeframe('day'); setShowCustomPicker(false); }}
                        >
                            <FaCalendarDay /> Hoy
                        </button>
                        <button
                            className={`tf-btn ${timeframe === 'week' ? 'active' : ''}`}
                            onClick={() => { setTimeframe('week'); setShowCustomPicker(false); }}
                        >
                            <FaCalendarWeek /> Semana
                        </button>
                        <button
                            className={`tf-btn ${timeframe === 'month' ? 'active' : ''}`}
                            onClick={() => { setTimeframe('month'); setShowCustomPicker(false); }}
                        >
                            <FaCalendarAlt /> Mes
                        </button>
                        <button
                            className={`tf-btn ${timeframe === 'custom' ? 'active' : ''}`}
                            onClick={() => {
                                setTimeframe('custom');
                                setShowCustomPicker(true);
                                // Initialize temp range with current applied range or today
                                if (customRange.start) {
                                    setTempCustomRange(customRange);
                                }
                            }}
                        >
                            <FaCalendarPlus /> Personalizado
                        </button>
                    </div>

                    {showCustomPicker && (
                        <div className="custom-picker-popup">
                            <div className="picker-wrapper">
                                <DatePicker
                                    selected={tempCustomRange.start}
                                    onChange={handleCustomDateChange}
                                    startDate={tempCustomRange.start}
                                    endDate={tempCustomRange.end}
                                    selectsRange
                                    inline
                                    locale="es"
                                />
                            </div>
                            <div className="picker-actions">
                                <button className="picker-cancel-btn" onClick={() => setShowCustomPicker(false)}>Cancelar</button>
                                <button className="picker-accept-btn" onClick={applyCustomFilter}>Aceptar</button>
                            </div>
                        </div>
                    )}
                </div>
            </div >

            <div className="stats-grid">
                {/* Total Plata */}
                <div className="stat-card sales main-stat">
                    <div className="stat-icon"><FaMoneyBillWave /></div>
                    <div className="stat-info">
                        <h3>Total ({getTimeframeLabel()})</h3>
                        <p>${Math.floor(stats.plata).toLocaleString('es-AR')}</p>
                        <span className="stat-sub">{stats.totalOrders} pedidos</span>
                    </div>
                </div>

                {/* Despensa */}
                <div className="stat-card wholesale-sales">
                    <div className="stat-icon-small" style={{ color: '#8b5cf6' }}><FaShoppingCart /></div>
                    <div className="stat-info">
                        <h3>Despensa</h3>
                        <p>${Math.floor(stats.despensa).toLocaleString('es-AR')}</p>
                    </div>
                </div>

                {/* Publico */}
                <div className="stat-card local-sales">
                    <div className="stat-icon-small" style={{ color: '#10b981' }}><FaShoppingCart /></div>
                    <div className="stat-info">
                        <h3>Público</h3>
                        <p>${Math.floor(stats.publico).toLocaleString('es-AR')}</p>
                    </div>
                </div>

                {/* Delivery */}
                <div className="stat-card online-sales">
                    <div className="stat-icon-small" style={{ color: '#3b82f6' }}><FaShoppingCart /></div>
                    <div className="stat-info">
                        <h3>Delivery</h3>
                        <p>${Math.floor(stats.delivery).toLocaleString('es-AR')}</p>
                    </div>
                </div>

                {/* Visitas (Always Global or maybe tied to timeframe in future, keeping global for now) */}
                <div className="stat-card visits">
                    <div className="stat-icon"><FaEye /></div>
                    <div className="stat-info">
                        <h3>Visitas Web</h3>
                        <p>{stats.visits.toLocaleString('es-AR')}</p>
                    </div>
                </div>
            </div>

            {/* Product List Section */}
            <div className="products-stats-section">
                <h3>Productos Vendidos ({getTimeframeLabel()})</h3>
                <div className="products-table-container">
                    {topProducts.length === 0 ? (
                        <p className="no-data">No hay ventas en este periodo.</p>
                    ) : (
                        <table className="products-stats-table">
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th>Cantidad</th>
                                    <th>Total Generado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topProducts.map((p, index) => (
                                    <tr key={`${index}-${p.name}`}>
                                        <td>{p.name} {p.variant ? <span className="text-sm text-gray light">({p.variant})</span> : ''}</td>
                                        <td>{Number(p.quantity).toFixed(3).replace(/\.?0+$/, "")}</td>
                                        <td>${Math.floor(p.total).toLocaleString('es-AR')}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#f9fafb', fontWeight: 'bold' }}>
                                    <td colSpan={2} style={{ textAlign: 'right', paddingRight: '10px' }}>Total Lista:</td>
                                    <td style={{ color: '#10b981' }}>
                                        ${Math.floor(topProducts.reduce((sum, p) => sum + p.total, 0)).toLocaleString('es-AR')}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            </div>

        </div >
    );
}
