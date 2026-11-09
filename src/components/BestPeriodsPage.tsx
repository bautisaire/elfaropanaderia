import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaArrowLeft, FaCalendarAlt, FaEye, FaEyeSlash } from 'react-icons/fa';
import { db } from '../firebase/firebaseConfig';
import { getArgentinaDateKey } from '../utils/visitTracker';
import './CustomersRanking.css';

interface OrderItem {
    id?: string | number;
    productId?: string;
    baseProductId?: string;
    name?: string;
    variant?: string;
    quantity?: number | string;
    price?: number | string;
}

interface OrderDoc {
    id: string;
    status?: string;
    isTestOrder?: boolean;
    total?: number | string;
    items?: OrderItem[];
    date?: { toDate?: () => Date } | string | number;
}

interface ProductDoc { id: string; excludeFromStats?: boolean }

interface Period {
    key: string;
    label: string;
    sub?: string;
    total: number;
    orders: number;
    current: boolean;
}

type Mode = 'day' | 'week' | 'month';
type SortBy = 'total' | 'orders';

const medals = ['🥇', '🥈', '🥉'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const toDate = (v: OrderDoc['date']): Date | null => {
    if (!v) return null;
    if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v as string | number);
    return isNaN(d.getTime()) ? null : d;
};

// "YYYY-MM-DD" -> Date en UTC (solo para aritmética de calendario, sin problemas de zona horaria)
const parseKey = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};
const toKey = (d: Date) => d.toISOString().slice(0, 10);
const fmtShort = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const mondayOf = (key: string) => {
    const d = parseKey(key);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return toKey(d);
};

export default function BestPeriodsPage() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<OrderDoc[]>([]);
    const [products, setProducts] = useState<Map<string, ProductDoc>>(new Map());
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<Mode>('day');
    const [sortBy, setSortBy] = useState<SortBy>('total');
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

    const money = (n: number) => (showAmounts ? `$${Math.round(n).toLocaleString('es-AR')}` : '***');

    // Ventas por día (clave de fecha argentina). Mismo criterio que el Dashboard:
    // sin cancelados ni pruebas, y se descuentan envíos y productos excluidos de estadísticas.
    const days = useMemo(() => {
        const map = new Map<string, { total: number; orders: number }>();
        orders.forEach(o => {
            if (o.status === 'cancelado' || o.isTestOrder) return;
            const date = toDate(o.date);
            if (!date) return;
            let exclude = 0;
            if (Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const baseId = String(item.baseProductId || item.productId || item.id);
                    const lower = String(item.name || '').toLowerCase();
                    const isShipping = baseId === 'shipping-cost' || lower.includes('envío') || lower.includes('envio');
                    if (isShipping || products.get(baseId)?.excludeFromStats) {
                        exclude += (Number(item.quantity) || 0) * (Number(item.price) || 0);
                    }
                });
            }
            const amount = Math.max(0, (Number(o.total) || 0) - exclude);
            const key = getArgentinaDateKey(date);
            const cur = map.get(key);
            if (cur) { cur.total += amount; cur.orders += 1; } else map.set(key, { total: amount, orders: 1 });
        });
        return map;
    }, [orders, products]);

    const periods = useMemo<Period[]>(() => {
        const todayKey = getArgentinaDateKey();
        const currentWeek = mondayOf(todayKey);
        const currentMonth = todayKey.slice(0, 7);
        const acc = new Map<string, Period>();

        days.forEach((v, key) => {
            let gKey: string;
            if (mode === 'day') gKey = key;
            else if (mode === 'week') gKey = mondayOf(key);
            else gKey = key.slice(0, 7);

            let p = acc.get(gKey);
            if (!p) {
                if (mode === 'day') {
                    const d = parseKey(gKey);
                    p = {
                        key: gKey,
                        label: `${DAY_NAMES[d.getUTCDay()]} ${fmtShort(d)}/${String(d.getUTCFullYear()).slice(2)}`,
                        total: 0, orders: 0, current: gKey === todayKey
                    };
                } else if (mode === 'week') {
                    const start = parseKey(gKey);
                    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
                    p = {
                        key: gKey,
                        label: `${fmtShort(start)} al ${fmtShort(end)}`,
                        sub: String(end.getUTCFullYear()),
                        total: 0, orders: 0, current: gKey === currentWeek
                    };
                } else {
                    const [y, m] = gKey.split('-').map(Number);
                    p = {
                        key: gKey,
                        label: `${MONTH_NAMES[m - 1]} ${y}`,
                        total: 0, orders: 0, current: gKey === currentMonth
                    };
                }
                acc.set(gKey, p);
            }
            p.total += v.total;
            p.orders += v.orders;
        });
        return [...acc.values()];
    }, [days, mode]);

    const ranked = useMemo(() => {
        const sorted = [...periods].sort((a, b) =>
            sortBy === 'total' ? b.total - a.total || b.orders - a.orders : b.orders - a.orders || b.total - a.total);
        return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
    }, [periods, sortBy]);

    const limit = 10;
    const visible = showAll ? ranked : ranked.slice(0, limit);
    const valueOf = (p: Period) => (sortBy === 'total' ? p.total : p.orders);
    const fmtValue = (p: Period) => (sortBy === 'total' ? money(p.total) : `${p.orders} pedidos`);
    const maxValue = ranked.length ? Math.max(1, valueOf(ranked[0])) : 1;
    const totalAll = periods.reduce((s, p) => s + p.total, 0);
    const ordersAll = periods.reduce((s, p) => s + p.orders, 0);
    const average = periods.length ? totalAll / periods.length : 0;
    const noun = mode === 'day' ? 'día' : mode === 'week' ? 'semana' : 'mes';
    const nounPlural = mode === 'day' ? 'días' : mode === 'week' ? 'semanas' : 'meses';

    // Diferencia porcentual del puesto vs. el anterior (o vs. el primero)
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);
    const diffText = (p: { rank: number } & Period, ref: Period | undefined) => {
        if (!ref) return '—';
        const d = pct(valueOf(p), valueOf(ref));
        return `${d}%`;
    };

    return (
        <section className="cr-section cr-page">
            <button className="cr-back" onClick={() => navigate('/editor/')}><FaArrowLeft /> Volver al Dashboard</button>
            <div className="cr-header">
                <h2><FaCalendarAlt /> Mejores días, semanas y meses
                    <button className="cr-eye" onClick={() => {
                        const next = !showAmounts;
                        setShowAmounts(next);
                        try { localStorage.setItem('showSensitiveData', String(next)); } catch { /* sin almacenamiento */ }
                    }} title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}>{showAmounts ? <FaEyeSlash /> : <FaEye />}</button>
                </h2>
                <p>Comparación de tus mejores períodos de venta. Sin cancelados ni pedidos de prueba, ni envíos. Las semanas van de lunes a domingo. El período en curso puede estar incompleto.</p>
            </div>

            <div className="cr-toolbar">
                <div className="cr-sort">
                    {([['day', 'Días'], ['week', 'Semanas'], ['month', 'Meses']] as [Mode, string][]).map(([k, l]) => (
                        <button key={k} className={mode === k ? 'active' : ''} onClick={() => { setMode(k); setShowAll(false); }}>{l}</button>
                    ))}
                </div>
                <div className="cr-sort">
                    <button className={sortBy === 'total' ? 'active' : ''} onClick={() => setSortBy('total')}>Por ventas</button>
                    <button className={sortBy === 'orders' ? 'active' : ''} onClick={() => setSortBy('orders')}>Por pedidos</button>
                </div>
            </div>

            <div className="cr-kpis">
                <div className="cr-kpi"><span>{nounPlural.charAt(0).toUpperCase() + nounPlural.slice(1)} con ventas</span><strong>{periods.length}</strong></div>
                <div className="cr-kpi"><span>Total vendido</span><strong>{money(totalAll)}</strong></div>
                <div className="cr-kpi"><span>Pedidos</span><strong>{ordersAll}</strong></div>
                <div className="cr-kpi"><span>Promedio por {noun}</span><strong>{money(average)}</strong>
                    {ranked[0] && average > 0 && <small>El mejor lo supera en {pct(ranked[0].total, average)}%</small>}</div>
            </div>

            {ranked.length > 0 && (
                <div className="cr-podium">
                    {ranked.slice(0, 3).map((p, i) => (
                        <div key={p.key} className={`cr-podium-card place-${i + 1}`}>
                            <div className="cr-medal">{medals[i]}</div>
                            <strong className="cr-podium-name" style={{ textTransform: 'capitalize' }}>{p.label}</strong>
                            {p.current && <span className="cr-podium-phone">en curso</span>}
                            <div className="cr-podium-total">{fmtValue(p)}</div>
                            <small>
                                {i === 0
                                    ? (ranked[1] ? `${pct(valueOf(p), valueOf(ranked[1]))}% más que el 2.º` : 'Único período')
                                    : `${Math.abs(pct(valueOf(p), valueOf(ranked[0])))}% menos que el 1.º`}
                            </small>
                        </div>
                    ))}
                </div>
            )}

            <div className="cr-table-wrap">
                <table className="cr-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>{noun.charAt(0).toUpperCase() + noun.slice(1)}</th>
                            <th className="r">Ventas</th>
                            <th className="r">Pedidos</th>
                            <th className="r">Ticket prom.</th>
                            <th className="r">vs. el 1.º</th>
                            <th className="r">vs. el anterior</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((p, idx) => (
                            <tr key={p.key}>
                                <td className="cr-rank">{p.rank <= 3 ? medals[p.rank - 1] : p.rank}</td>
                                <td>
                                    <div className="cr-name" style={{ textTransform: 'capitalize' }}>
                                        {p.label}{p.sub ? ` ${p.sub}` : ''}{p.current && <span className="cr-tag">en curso</span>}
                                    </div>
                                    <div className="cr-bar"><div style={{ width: `${Math.max(4, (valueOf(p) / maxValue) * 100)}%` }} /></div>
                                </td>
                                <td className="r cr-money">{money(p.total)}</td>
                                <td className="r">{p.orders}</td>
                                <td className="r">{money(p.orders ? p.total / p.orders : 0)}</td>
                                <td className="r">{idx === 0 && p.rank === 1 ? '—' : diffText(p, ranked[0])}</td>
                                <td className="r">{p.rank === 1 ? '—' : diffText(p, ranked[p.rank - 2])}</td>
                            </tr>
                        ))}
                        {visible.length === 0 && <tr><td colSpan={7} className="cr-empty">{loading ? 'Cargando…' : 'No hay ventas para mostrar.'}</td></tr>}
                    </tbody>
                </table>
            </div>

            {ranked.length > limit && (
                <button className="cr-more" onClick={() => setShowAll(v => !v)}>
                    {showAll ? `Ver solo el top ${limit}` : `Ver los ${ranked.length} ${nounPlural}`}
                </button>
            )}
        </section>
    );
}
