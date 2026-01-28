import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, doc, onSnapshot } from "firebase/firestore";
import "react-datepicker/dist/react-datepicker.css";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from 'date-fns/locale/es';
import "./Dashboard.css";
import { FaMoneyBillWave, FaShoppingCart, FaEye, FaCalendarDay, FaCalendarWeek, FaCalendarAlt, FaCalendarPlus } from "react-icons/fa";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

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
        despensaCount: 0,
        publico: 0,     // Local POS
        publicoCount: 0,
        delivery: 0,     // Online
        deliveryCount: 0
    });

    const [topProducts, setTopProducts] = useState<ProductSale[]>([]);
    const [productData, setProductData] = useState<Map<string, any>>(new Map());

    // Chart Data State
    const [salesTrendData, setSalesTrendData] = useState<any[]>([]);
    const [salesSourceData, setSalesSourceData] = useState<any[]>([]);

    const COLORS = ['#8b5cf6', '#10b981', '#3b82f6']; // Despensa, Publico, Delivery

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
        let despensaCount = 0;
        let publico = 0;
        let publicoCount = 0;
        let delivery = 0;
        let deliveryCount = 0;

        const productMap = new Map<string, ProductSale>();

        filteredOrders.forEach(order => {
            const amount = Number(order.total) || 0;
            plata += amount;

            // Categories
            if (order.source === 'pos_wholesale') {
                despensa += amount;
                despensaCount++;
            } else if (order.source === 'pos_public' || order.source === 'pos') {
                publico += amount;
                publicoCount++;
            } else {
                delivery += amount;
                deliveryCount++;
            }

            // Products Aggregation with Dependency Logic
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach((item: any) => {
                    // 1. Identify Product
                    // Some items have ID "parentID-variantID" or just "productID"
                    const isVariant = String(item.id).includes('-');
                    const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);

                    const productInfo = productData.get(baseId);

                    let finalId = baseId;
                    let finalName = item.name;
                    let finalVariant = item.variant;
                    let finalQty = Number(item.quantity) || 0;

                    // 2. Check Dependency (Roll-up)
                    if (productInfo && productInfo.stockDependency && productInfo.stockDependency.productId) {
                        const parentId = productInfo.stockDependency.productId;
                        const parentInfo = productData.get(parentId);

                        if (parentInfo) {
                            // It is a derived product. Convert to Parent Units
                            const unitsToDeduct = productInfo.stockDependency.unitsToDeduct || 1;
                            finalQty = finalQty * unitsToDeduct;

                            // Override Identity to Parent
                            finalId = parentInfo.id;
                            // The name will be updated in the next step
                            finalVariant = undefined; // Merge into parent base
                        }
                    }

                    // 3. Update Name from Current DB (Consolidate renames)
                    // We look up the product by the final ID we decided on (base or parent)
                    const currentInfo = productData.get(finalId);
                    if (currentInfo) {
                        finalName = currentInfo.nombre;
                    }

                    // Normalize variant
                    if (finalVariant) {
                        finalVariant = String(finalVariant).trim();
                    }

                    // GROUP BY ID to ensure consistency across renames
                    const key = `${finalId}-${finalVariant || 'base'}`;
                    const nameForDisplay = String(finalName).trim();

                    const current = productMap.get(key);
                    const price = Number(item.price) || 0;
                    const lineTotal = (Number(item.quantity) || 0) * price;

                    if (current) {
                        current.quantity += finalQty;
                        current.total += lineTotal;
                    } else {
                        productMap.set(key, {
                            id: finalId,
                            name: nameForDisplay,
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
            despensaCount,
            publico,
            publicoCount,
            delivery,
            deliveryCount
        }));

        setTopProducts(Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity));

        // --- Chart Data Processing ---

        // 1. Sales Trend Data
        const trendMap = new Map<string, number>();

        // Initialize Trend Map with 0s based on timeframe
        if (timeframe === 'day') {
            for (let i = 0; i < 24; i++) {
                const hour = i.toString().padStart(2, '0');
                trendMap.set(`${hour}:00`, 0);
            }
        } else if (timeframe === 'week') {
            const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            // Reorder to start with Monday if desired, or keep Sunday first. 
            // Let's adhere to standard JS getDay() for simplicity but maybe sort later.
            // Actually, for "This Week", it usually means current week.
            days.forEach(d => trendMap.set(d, 0));
        } else if (timeframe === 'month') {
            // Initialize days 1-31 (or max days in month? keeping simple 1-31 for now or dynamic)
            // A better way is to iterate from start of month to end.
            // For simplicity, we will just fill keys as we encounter them or pre-fill valid dates if possible.
            // Let's only fill what we have for month/custom to avoid large empty gaps if not needed.
            // Or ideally, fill range.
        }

        filteredOrders.forEach(order => {
            const amount = Number(order.total) || 0;
            const d = order.dateTyped as Date;
            const dArg = getArgentinaDate(d);

            let key = '';
            if (timeframe === 'day') {
                const hour = dArg.getHours().toString().padStart(2, '0');
                key = `${hour}:00`;
            } else if (timeframe === 'week') {
                const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                key = days[dArg.getDay()];
            } else {
                // Month or Custom
                key = `${dArg.getDate().toString().padStart(2, '0')}/${(dArg.getMonth() + 1).toString().padStart(2, '0')}`;
            }

            const currentVal = trendMap.get(key) || 0;
            trendMap.set(key, currentVal + amount);
        });

        const trendData = Array.from(trendMap.entries()).map(([name, total]) => ({ name, total }));

        // Sort for Month/Custom to ensure chronological order
        if (timeframe === 'month' || timeframe === 'custom') {
            trendData.sort((a, b) => {
                const [da, ma] = a.name.split('/').map(Number);
                const [db, mb] = b.name.split('/').map(Number);
                return (ma - mb) || (da - db);
            });
        }
        // week sort? (Mon-Sun generally expected)
        if (timeframe === 'week') {
            const dayOrder = { 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Domingo': 7 };
            trendData.sort((a, b) => (dayOrder[a.name as keyof typeof dayOrder] || 0) - (dayOrder[b.name as keyof typeof dayOrder] || 0));
        }

        setSalesTrendData(trendData);

        // 2. Sales Source Data
        setSalesSourceData([
            { name: 'Despensa', value: despensa },
            { name: 'Público', value: publico },
            { name: 'Delivery', value: delivery }
        ].filter(d => d.value > 0));

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
                        <span className="stat-sub">{stats.despensaCount} tickets</span>
                    </div>
                </div>

                {/* Publico */}
                <div className="stat-card local-sales">
                    <div className="stat-icon-small" style={{ color: '#10b981' }}><FaShoppingCart /></div>
                    <div className="stat-info">
                        <h3>Público</h3>
                        <p>${Math.floor(stats.publico).toLocaleString('es-AR')}</p>
                        <span className="stat-sub">{stats.publicoCount} tickets</span>
                    </div>
                </div>

                {/* Delivery */}
                <div className="stat-card online-sales">
                    <div className="stat-icon-small" style={{ color: '#3b82f6' }}><FaShoppingCart /></div>
                    <div className="stat-info">
                        <h3>Delivery</h3>
                        <p>${Math.floor(stats.delivery).toLocaleString('es-AR')}</p>
                        <span className="stat-sub">{stats.deliveryCount} pedidos</span>
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

            {/* Charts Section */}
            <div className="charts-section" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
                <div className="chart-container" style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '20px' }}>Tendencia de Ventas</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <AreaChart data={salesTrendData}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="name"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#6B7280', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#6B7280', fontSize: 12 }}
                                    tickFormatter={(value) => `$${value}`}
                                />
                                <Tooltip
                                    formatter={(value: number | undefined) => [`$${(value || 0).toLocaleString('es-AR')}`, 'Ventas']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    stroke="#8b5cf6"
                                    fillOpacity={1}
                                    fill="url(#colorTotal)"
                                    strokeWidth={3}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-container" style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '20px' }}>Ventas por Origen</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={salesSourceData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {salesSourceData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number | undefined) => `$${(value || 0).toLocaleString('es-AR')}`} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
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
