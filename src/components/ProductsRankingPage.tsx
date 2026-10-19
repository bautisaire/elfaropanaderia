import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaArrowLeft, FaBreadSlice, FaSearch, FaEye, FaEyeSlash } from 'react-icons/fa';
import { db } from '../firebase/firebaseConfig';
import './CustomersRanking.css';

interface OrderItem {
    id?: string | number;
    productId?: string;
    baseProductId?: string;
    name?: string;
    variant?: string;
    quantity?: number | string;
    price?: number | string;
    historicCost?: number;
}

interface OrderDoc {
    id: string;
    status?: string;
    isTestOrder?: boolean;
    items?: OrderItem[];
    date?: { toDate?: () => Date } | string | number;
}

interface ProductDoc {
    id: string;
    nombre?: string;
    shortId?: string | number;
    excludeFromStats?: boolean;
    trackInDashboard?: boolean;
    stockDependency?: { productId?: string; unitsToDeduct?: number };
    recipe?: { costPerUnit?: number };
}

interface Row {
    id: string;
    code: string;
    name: string;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
    hasCost: boolean;
}

type Range = 'all' | '30' | '7';
type SortBy = 'quantity' | 'profit';

const medals = ['🥇', '🥈', '🥉'];

const toDate = (v: OrderDoc['date']): Date | null => {
    if (!v) return null;
    if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v as string | number);
    return isNaN(d.getTime()) ? null : d;
};

export default function ProductsRankingPage() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<OrderDoc[]>([]);
    const [products, setProducts] = useState<Map<string, ProductDoc>>(new Map());
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<Range>('all');
    const [sortBy, setSortBy] = useState<SortBy>('quantity');
    const [search, setSearch] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [showAmounts, setShowAmounts] = useState(() => {
        try { return localStorage.getItem('showSensitiveData') !== 'false'; } catch { return true; }
    });

    useEffect(() => {
        const u1 = onSnapshot(collection(db, 'orders'), s => {
            setOrders(s.docs.map(d => ({ id: d.id, ...d.data() } as OrderDoc)));
            setLoading(false);
        }, e => { console.error(e); setLoading(false); });
        const u2 = onSnapshot(collection(db, 'products'), s => {
            const m = new Map<string, ProductDoc>();
            s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() } as ProductDoc));
            setProducts(m);
        });
        return () => { u1(); u2(); };
    }, []);

    const money = (n: number) => (showAmounts ? `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-AR')}` : '***');

    const rows = useMemo<Row[]>(() => {
        const from = range === 'all' ? null : new Date(Date.now() - Number(range) * 24 * 3600 * 1000);
        const map = new Map<string, Row>();

        orders.forEach(o => {
            if (o.status === 'cancelado' || o.isTestOrder || !Array.isArray(o.items)) return;
            if (from) {
                const d = toDate(o.date);
                if (!d || d < from) return;
            }
            o.items.forEach(item => {
                const qty = Number(item.quantity) || 0;
                if (qty <= 0) return;

                // Mismo criterio que el Dashboard para encontrar el producto base de un ítem con variante.
                let baseId = String(item.id);
                let variantName = item.variant;
                if (!variantName && item.name) {
                    const m = item.name.match(/\(([^)]+)\)$/);
                    if (m) variantName = m[1];
                }
                if (item.baseProductId) baseId = String(item.baseProductId);
                else if (item.productId) baseId = String(item.productId);
                else if (variantName) {
                    const suffix = `-${variantName}`;
                    if (baseId.endsWith(suffix)) baseId = baseId.slice(0, -suffix.length);
                    else {
                        const parts = baseId.split('-');
                        if (parts.length > 1 && parts[parts.length - 1] === variantName) baseId = parts.slice(0, -1).join('-');
                    }
                }

                const lowerName = String(item.name || '').toLowerCase();
                if (baseId === 'shipping-cost' || lowerName.includes('envío') || lowerName.includes('envio')) return;

                const info = products.get(baseId);
                if (info?.excludeFromStats) return;

                // Productos derivados (ej. "Facturas x6") se suman a su producto padre.
                const parent = info?.stockDependency?.productId ? products.get(info.stockDependency.productId) : undefined;
                const unitsToDeduct = parent ? (info?.stockDependency?.unitsToDeduct || 1) : 1;
                const target = parent || info;
                const finalId = parent ? parent.id : baseId;

                const revenue = qty * (Number(item.price) || 0);
                let cost: number;
                if (item.historicCost !== undefined) cost = item.historicCost * qty;
                else if (info?.trackInDashboard) cost = revenue;
                else if (parent) cost = (info?.recipe?.costPerUnit || (parent.recipe?.costPerUnit || 0) * unitsToDeduct) * qty;
                else cost = (info?.recipe?.costPerUnit || 0) * qty;

                const cur = map.get(finalId);
                const addQty = qty * unitsToDeduct;
                if (cur) {
                    cur.quantity += addQty; cur.revenue += revenue; cur.cost += cost;
                    if (cost > 0) cur.hasCost = true;
                } else {
                    map.set(finalId, {
                        id: finalId,
                        code: target?.shortId !== undefined ? String(target.shortId) : '',
                        name: String(target?.nombre || item.name || finalId).trim(),
                        quantity: addQty, revenue, cost, profit: 0, margin: 0, hasCost: cost > 0
                    });
                }
            });
        });

        return [...map.values()].map(r => ({
            ...r,
            profit: r.revenue - r.cost,
            margin: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0
        }));
    }, [orders, products, range]);

    const ranked = useMemo(() => {
        const sorted = [...rows].sort((a, b) =>
            sortBy === 'quantity' ? b.quantity - a.quantity || b.profit - a.profit : b.profit - a.profit || b.quantity - a.quantity);
        return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
    }, [rows, sortBy]);

    const q = search.trim().toLowerCase();
    const filtered = q ? ranked.filter(r => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) : ranked;
    const visible = showAll || q ? filtered : filtered.slice(0, 15);

    const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
    const maxValue = ranked.length ? Math.max(1, sortBy === 'quantity' ? ranked[0].quantity : ranked[0].profit) : 1;
    const withoutCost = rows.filter(r => !r.hasCost).length;
    const fmtQty = (n: number) => (Number.isInteger(n) ? n.toLocaleString('es-AR') : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

    return (
        <section className="cr-section cr-page">
            <button className="cr-back" onClick={() => navigate('/editor/')}><FaArrowLeft /> Volver al Dashboard</button>
            <div className="cr-header">
                <h2><FaBreadSlice /> Ranking de productos
                    <button className="cr-eye" onClick={() => {
                        const next = !showAmounts;
                        setShowAmounts(next);
                        try { localStorage.setItem('showSensitiveData', String(next)); } catch { /* sin almacenamiento */ }
                    }} title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}>{showAmounts ? <FaEyeSlash /> : <FaEye />}</button>
                </h2>
                <p>Los más vendidos por cantidad y los que más ganancia dejan. Sin cancelados ni pedidos de prueba, ni envíos. Los productos derivados se suman a su producto padre.</p>
            </div>

            <div className="cr-kpis">
                <div className="cr-kpi"><span>Productos vendidos</span><strong>{rows.length}</strong></div>
                <div className="cr-kpi"><span>Unidades</span><strong>{fmtQty(totalQty)}</strong></div>
                <div className="cr-kpi"><span>Ingresos</span><strong>{money(totalRevenue)}</strong></div>
                <div className="cr-kpi"><span>Ganancia estimada</span><strong>{money(totalProfit)}</strong>
                    <small>{totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% de margen</small></div>
            </div>

            {withoutCost > 0 && (
                <div className="cr-warn">{withoutCost} producto(s) no tienen costo cargado: su ganancia figura igual a sus ingresos. Se marcan con "sin costo".</div>
            )}

            <div className="cr-toolbar">
                <div className="cr-sort">
                    <button className={sortBy === 'quantity' ? 'active' : ''} onClick={() => setSortBy('quantity')}>Más vendidos (cantidad)</button>
                    <button className={sortBy === 'profit' ? 'active' : ''} onClick={() => setSortBy('profit')}>Más ganancia</button>
                </div>
                <div className="cr-sort">
                    {([['all', 'Todo'], ['30', '30 días'], ['7', '7 días']] as [Range, string][]).map(([k, l]) => (
                        <button key={k} className={range === k ? 'active' : ''} onClick={() => setRange(k)}>{l}</button>
                    ))}
                </div>
            </div>

            {ranked.length > 0 && (
                <div className="cr-podium">
                    {ranked.slice(0, 3).map((r, i) => (
                        <div key={r.id} className={`cr-podium-card place-${i + 1}`}>
                            <div className="cr-medal">{medals[i]}</div>
                            <strong className="cr-podium-name">{r.name}</strong>
                            {r.code && <span className="cr-podium-phone">ID {r.code}</span>}
                            <div className="cr-podium-total">{sortBy === 'quantity' ? `${fmtQty(r.quantity)} u.` : money(r.profit)}</div>
                            <small>{sortBy === 'quantity' ? `${money(r.profit)} de ganancia` : `${fmtQty(r.quantity)} unidades`}</small>
                        </div>
                    ))}
                </div>
            )}

            <div className="cr-toolbar">
                <div className="cr-search">
                    <FaSearch size={13} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ID" />
                </div>
            </div>

            <div className="cr-table-wrap">
                <table className="cr-table">
                    <thead>
                        <tr><th>#</th><th>Producto</th><th>ID</th><th className="r">Cantidad</th><th className="r">Ingresos</th><th className="r">Costo</th><th className="r">Ganancia</th><th className="r">Margen</th></tr>
                    </thead>
                    <tbody>
                        {visible.map(r => {
                            const value = sortBy === 'quantity' ? r.quantity : r.profit;
                            return (
                                <tr key={r.id}>
                                    <td className="cr-rank">{r.rank <= 3 ? medals[r.rank - 1] : r.rank}</td>
                                    <td>
                                        <div className="cr-name">{r.name}{!r.hasCost && <span className="cr-tag">sin costo</span>}</div>
                                        <div className="cr-bar"><div style={{ width: `${Math.max(4, (Math.max(0, value) / maxValue) * 100)}%` }} /></div>
                                    </td>
                                    <td className="cr-phone">{r.code || '—'}</td>
                                    <td className="r">{fmtQty(r.quantity)}</td>
                                    <td className="r">{money(r.revenue)}</td>
                                    <td className="r">{money(r.cost)}</td>
                                    <td className="r cr-money">{money(r.profit)}</td>
                                    <td className="r">{Math.round(r.margin)}%</td>
                                </tr>
                            );
                        })}
                        {visible.length === 0 && <tr><td colSpan={8} className="cr-empty">{loading ? 'Cargando…' : 'No hay productos para mostrar.'}</td></tr>}
                    </tbody>
                </table>
            </div>

            {!q && filtered.length > 15 && (
                <button className="cr-more" onClick={() => setShowAll(v => !v)}>
                    {showAll ? 'Ver solo el top 15' : `Ver los ${filtered.length} productos`}
                </button>
            )}
        </section>
    );
}
