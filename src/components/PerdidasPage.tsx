import { Fragment, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { es } from 'date-fns/locale/es';
import { FaTrashAlt, FaSearch, FaEye, FaEyeSlash, FaCalendarDay, FaCalendarWeek, FaCalendarAlt, FaCalendarPlus, FaSortAmountDown, FaSortAmountUp, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { db } from '../firebase/firebaseConfig';
import { calculateIngredientCost, type CostingRecipe, type CostingRawMaterial } from '../utils/costing';
import { normalizeForSearch } from '../utils/textSearch';
import './CustomersRanking.css';
import './Dashboard.css';
import './PerdidasPage.css';

registerLocale('es', es);

// Pérdida por productos: todo lo registrado en `waste_logs` — el cierre de jornada (Stock) y los
// ajustes de salida por Merma/Desperdicio o Consumo Interno. Solo materia prima (sin CIF).

type Timeframe = 'day' | 'week' | 'month' | 'custom';
type Origin = 'cierre' | 'merma' | 'consumo';
type OriginFilter = 'all' | Origin;

interface IngredientLoss {
    rawMaterialId: string;
    name: string;
    unit: string;
    quantity: number;
    cost: number;
}

interface WasteItem {
    productId?: string;
    name?: string;
    quantity?: number;
    rawMaterialCost?: number;
    ingredients?: IngredientLoss[];
}

interface WasteLog {
    id: string;
    date: Date;
    type: string;
    reason?: string;
    rawMaterialCost: number;
    items: WasteItem[];
}

interface ProductDoc {
    id: string;
    nombre?: string;
    unitType?: 'unit' | 'weight';
    recipe?: CostingRecipe;
}

type RawMat = CostingRawMaterial & { name?: string; unit?: string };

interface LossRow {
    key: string;
    date: Date;
    origin: Origin;
    productName: string;
    quantity: number;
    isWeight: boolean;
    rawCost: number;
    ingredients: IngredientLoss[];
    /** El registro no guardó el detalle de insumos: se reconstruye con la receta actual. */
    estimated: boolean;
}

const ORIGIN_LABEL: Record<Origin, string> = {
    cierre: 'Cierre de jornada',
    merma: 'Merma/Desperdicio',
    consumo: 'Consumo propio',
};

const TZ = 'America/Argentina/Buenos_Aires';
const getArgentinaDate = (date: Date) => new Date(date.toLocaleString('en-US', { timeZone: TZ }));
const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isSameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
// Mismo criterio de semana que el Dashboard (número de semana ISO).
const getWeekNumber = (input: Date) => {
    const d = new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const qtyText = (n: number) => round3(n).toLocaleString('es-AR', { maximumFractionDigits: 3 });
const fmtDate = (d: Date) => d.toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtShort = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

const toDate = (v: unknown): Date => {
    if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
    const d = new Date(v as string | number);
    return isNaN(d.getTime()) ? new Date(0) : d;
};

const originOf = (log: WasteLog): Origin => {
    if (log.type === 'cierre_jornada') return 'cierre';
    return log.reason === 'Consumo Interno' ? 'consumo' : 'merma';
};

export default function PerdidasPage() {
    const [logs, setLogs] = useState<WasteLog[]>([]);
    const [products, setProducts] = useState<Map<string, ProductDoc>>(new Map());
    const [rawMaterials, setRawMaterials] = useState<RawMat[]>([]);
    const [loading, setLoading] = useState(true);

    const [timeframe, setTimeframe] = useState<Timeframe>('day');
    const [customRange, setCustomRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
    const [tempRange, setTempRange] = useState<{ start: Date | null; end: Date | null }>({ start: new Date(), end: new Date() });
    const [showPicker, setShowPicker] = useState(false);

    const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
    const [search, setSearch] = useState('');
    const [newestFirst, setNewestFirst] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [showAmounts, setShowAmounts] = useState(() => {
        try { return localStorage.getItem('showSensitiveData') !== 'false'; } catch { return true; }
    });

    useEffect(() => {
        const u1 = onSnapshot(collection(db, 'waste_logs'), s => {
            setLogs(s.docs
                .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
                .filter(w => w.type === 'cierre_jornada' || w.type === 'perdida_producto')
                .map(w => ({
                    id: w.id,
                    date: toDate(w.date),
                    type: String(w.type),
                    reason: w.reason as string | undefined,
                    rawMaterialCost: Number(w.rawMaterialCost) || 0,
                    items: Array.isArray(w.items) ? (w.items as WasteItem[]) : [],
                })));
            setLoading(false);
        }, e => { console.error('Error cargando pérdidas:', e); setLoading(false); });
        const u2 = onSnapshot(collection(db, 'products'), s => {
            const m = new Map<string, ProductDoc>();
            s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() } as ProductDoc));
            setProducts(m);
        });
        const u3 = onSnapshot(collection(db, 'raw_materials'), s => {
            setRawMaterials(s.docs.map(d => ({ id: d.id, ...d.data() }) as RawMat));
        });
        return () => { u1(); u2(); u3(); };
    }, []);

    const money = (n: number) => (showAmounts
        ? `$${(Math.round(n * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '***');

    const inTimeframe = (date: Date) => {
        const now = getArgentinaDate(new Date());
        const d = getArgentinaDate(date);
        if (timeframe === 'custom') {
            if (!customRange.start || !customRange.end) return false;
            const start = new Date(customRange.start); start.setHours(0, 0, 0, 0);
            const end = new Date(customRange.end); end.setHours(23, 59, 59, 999);
            return d >= start && d <= end;
        }
        if (timeframe === 'day') return isSameDay(now, d);
        if (timeframe === 'month') return isSameMonth(now, d);
        return getWeekNumber(now) === getWeekNumber(d) && now.getFullYear() === d.getFullYear();
    };

    const timeframeLabel = timeframe === 'day' ? 'Hoy'
        : timeframe === 'week' ? 'Esta semana'
            : timeframe === 'month' ? 'Este mes'
                : customRange.start && customRange.end ? `${fmtShort(customRange.start)} – ${fmtShort(customRange.end)}` : 'Personalizado';

    // Para registros viejos sin detalle de insumos: cantidades según la receta actual y el costo
    // guardado repartido en la misma proporción (así el total coincide con lo registrado).
    const estimateIngredients = (item: WasteItem): IngredientLoss[] => {
        const product = item.productId ? products.get(item.productId) : undefined;
        const recipe = product?.recipe;
        const yieldQty = recipe?.yield && recipe.yield > 0 ? recipe.yield : 0;
        const qty = Number(item.quantity) || 0;
        if (!recipe || !yieldQty || qty <= 0) return [];
        const list: IngredientLoss[] = [];
        for (const ing of recipe.ingredients || []) {
            const mat = rawMaterials.find(m => m.id === ing.rawMaterialId);
            if (!mat) continue;
            list.push({
                rawMaterialId: mat.id,
                name: mat.name || '',
                unit: mat.unit || '',
                quantity: (ing.quantity / yieldQty) * qty,
                cost: (calculateIngredientCost(ing, rawMaterials, recipe.merma || 0) / yieldQty) * qty,
            });
        }
        const stored = Number(item.rawMaterialCost) || 0;
        const current = list.reduce((s, i) => s + i.cost, 0);
        if (stored > 0 && current > 0) list.forEach(i => { i.cost = i.cost * (stored / current); });
        return list;
    };

    const rowsInPeriod = useMemo<LossRow[]>(() => {
        const rows: LossRow[] = [];
        logs.filter(l => inTimeframe(l.date)).forEach(log => {
            const origin = originOf(log);
            log.items.forEach((item, idx) => {
                const saved = Array.isArray(item.ingredients) && item.ingredients.length > 0;
                const ingredients = saved ? item.ingredients! : estimateIngredients(item);
                const product = item.productId ? products.get(item.productId) : undefined;
                rows.push({
                    key: `${log.id}-${idx}`,
                    date: log.date,
                    origin,
                    productName: item.name || product?.nombre || 'Producto',
                    quantity: Number(item.quantity) || 0,
                    isWeight: product?.unitType === 'weight',
                    rawCost: Number(item.rawMaterialCost) || 0,
                    ingredients,
                    estimated: !saved && ingredients.length > 0,
                });
            });
        });
        return rows;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logs, products, rawMaterials, timeframe, customRange]);

    const q = normalizeForSearch(search.trim());
    const rows = useMemo(() => rowsInPeriod
        .filter(r => originFilter === 'all' || r.origin === originFilter)
        .filter(r => !q || normalizeForSearch(r.productName).includes(q))
        .sort((a, b) => newestFirst ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime()),
    [rowsInPeriod, originFilter, q, newestFirst]);

    const materials = useMemo(() => {
        const map = new Map<string, IngredientLoss>();
        rows.forEach(r => r.ingredients.forEach(i => {
            const cur = map.get(i.rawMaterialId);
            if (cur) { cur.quantity += i.quantity; cur.cost += i.cost; }
            else map.set(i.rawMaterialId, { ...i, name: i.name || rawMaterials.find(m => m.id === i.rawMaterialId)?.name || 'Insumo' });
        }));
        return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
    }, [rows, rawMaterials]);

    const byOrigin = useMemo(() => {
        const acc: Record<Origin, number> = { cierre: 0, merma: 0, consumo: 0 };
        rowsInPeriod.forEach(r => { acc[r.origin] += r.rawCost; });
        return acc;
    }, [rowsInPeriod]);

    const totalCost = rows.reduce((s, r) => s + r.rawCost, 0);
    const materialsCost = materials.reduce((s, m) => s + m.cost, 0);
    const withoutRecipe = rows.filter(r => r.ingredients.length === 0).length;
    const anyEstimated = rows.some(r => r.estimated);

    const toggleExpanded = (key: string) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const pickTimeframe = (tf: Timeframe) => {
        setTimeframe(tf);
        if (tf === 'custom') {
            if (customRange.start) setTempRange(customRange);
            setShowPicker(true);
        } else setShowPicker(false);
    };

    return (
        <section className="cr-section pp-page">
            <div className="cr-header">
                <h2><FaTrashAlt style={{ color: '#dc2626' }} /> Pérdida por productos
                    <button className="cr-eye" onClick={() => {
                        const next = !showAmounts;
                        setShowAmounts(next);
                        try { localStorage.setItem('showSensitiveData', String(next)); } catch { /* sin almacenamiento */ }
                    }} title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}>{showAmounts ? <FaEyeSlash /> : <FaEye />}</button>
                </h2>
                <p>Productos descartados en el cierre de jornada y los descontados del stock por merma/desperdicio o consumo propio. Se cuentan los insumos de la receta (incluido el tiempo cargado como insumo), sin costos fijos (CIF).</p>
            </div>

            <div className="timeframe-selector-row pp-timeframe">
                <div className="timeframe-selector">
                    <button className={`tf-btn ${timeframe === 'day' ? 'active' : ''}`} onClick={() => pickTimeframe('day')}><FaCalendarDay /> Hoy</button>
                    <button className={`tf-btn ${timeframe === 'week' ? 'active' : ''}`} onClick={() => pickTimeframe('week')}><FaCalendarWeek /> Semana</button>
                    <button className={`tf-btn ${timeframe === 'month' ? 'active' : ''}`} onClick={() => pickTimeframe('month')}><FaCalendarAlt /> Mes</button>
                    <button className={`tf-btn ${timeframe === 'custom' ? 'active' : ''}`} onClick={() => pickTimeframe('custom')}>
                        <FaCalendarPlus /> {timeframe === 'custom' && customRange.start && customRange.end ? timeframeLabel : 'Personalizado'}
                    </button>
                </div>
                {showPicker && (
                    <div className="custom-picker-popup">
                        <div className="picker-wrapper">
                            <DatePicker
                                selected={tempRange.start}
                                onChange={(dates: [Date | null, Date | null]) => setTempRange({ start: dates[0], end: dates[1] })}
                                startDate={tempRange.start}
                                endDate={tempRange.end}
                                selectsRange
                                inline
                                locale="es"
                            />
                        </div>
                        <div className="picker-actions">
                            <button className="picker-cancel-btn" onClick={() => setShowPicker(false)}>Cancelar</button>
                            <button className="picker-accept-btn" onClick={() => {
                                if (tempRange.start && tempRange.end) { setCustomRange(tempRange); setShowPicker(false); }
                            }}>Aceptar</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="cr-kpis">
                <div className="cr-kpi pp-kpi-main"><span>Pérdida materia prima ({timeframeLabel})</span><strong>{money(totalCost)}</strong>
                    <small>{rows.length} {rows.length === 1 ? 'producto descontado' : 'productos descontados'}</small></div>
                <div className="cr-kpi"><span>Cierre de jornada</span><strong>{money(byOrigin.cierre)}</strong></div>
                <div className="cr-kpi"><span>Merma/Desperdicio</span><strong>{money(byOrigin.merma)}</strong></div>
                <div className="cr-kpi"><span>Consumo propio</span><strong>{money(byOrigin.consumo)}</strong></div>
            </div>

            <div className="cr-toolbar">
                <div className="cr-sort pp-wrap">
                    {([['all', 'Todos'], ['cierre', 'Cierre'], ['merma', 'Merma/Desperdicio'], ['consumo', 'Consumo propio']] as [OriginFilter, string][]).map(([k, l]) => (
                        <button key={k} className={originFilter === k ? 'active' : ''} onClick={() => setOriginFilter(k)}>{l}</button>
                    ))}
                </div>
                <div className="cr-search">
                    <FaSearch size={13} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto" />
                </div>
            </div>

            {(withoutRecipe > 0 || anyEstimated) && (
                <div className="cr-warn">
                    {withoutRecipe > 0 && <>{withoutRecipe} registro(s) sin receta: no se puede calcular la materia prima. </>}
                    {anyEstimated && <>Los marcados "estimado" son registros viejos sin detalle de insumos: se reconstruyen con la receta actual.</>}
                </div>
            )}

            <h3 className="pp-title">Productos descontados</h3>
            <div className="cr-table-wrap">
                <table className="cr-table">
                    <thead>
                        <tr>
                            <th>
                                <button className="pp-sort-btn" onClick={() => setNewestFirst(v => !v)} title="Cambiar orden por fecha">
                                    Fecha {newestFirst ? <FaSortAmountDown /> : <FaSortAmountUp />}
                                </button>
                            </th>
                            <th>Producto</th>
                            <th>Origen</th>
                            <th className="r">Cantidad</th>
                            <th className="r">Materia prima</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => {
                            const open = expanded.has(r.key);
                            return (
                                <Fragment key={r.key}>
                                    <tr className={r.ingredients.length ? 'pp-row-click' : ''} onClick={() => r.ingredients.length && toggleExpanded(r.key)}>
                                        <td className="cr-phone pp-nowrap">{fmtDate(r.date)}</td>
                                        <td>
                                            <div className="cr-name">
                                                {r.ingredients.length > 0 && <span className="pp-chevron">{open ? <FaChevronDown /> : <FaChevronRight />}</span>}
                                                {r.productName}
                                                {r.estimated && <span className="cr-tag pp-tag-est">estimado</span>}
                                                {r.ingredients.length === 0 && <span className="cr-tag">sin receta</span>}
                                            </div>
                                        </td>
                                        <td><span className={`pp-badge pp-${r.origin}`}>{ORIGIN_LABEL[r.origin]}</span></td>
                                        <td className="r">{qtyText(r.quantity)}{r.isWeight ? ' kg' : ''}</td>
                                        <td className="r pp-loss">{money(r.rawCost)}</td>
                                    </tr>
                                    {open && (
                                        <tr className="pp-detail">
                                            <td colSpan={5}>
                                                {r.ingredients.map(i => (
                                                    <div key={i.rawMaterialId} className="pp-detail-line">
                                                        <span>{i.name}</span>
                                                        <span>{qtyText(i.quantity)} {i.unit} · <strong>{money(i.cost)}</strong></span>
                                                    </div>
                                                ))}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                        {rows.length === 0 && <tr><td colSpan={5} className="cr-empty">{loading ? 'Cargando…' : 'No hay pérdidas registradas en este período.'}</td></tr>}
                    </tbody>
                    {rows.length > 0 && (
                        <tfoot>
                            <tr className="pp-total"><td colSpan={4}>Total</td><td className="r">{money(totalCost)}</td></tr>
                        </tfoot>
                    )}
                </table>
            </div>

            <h3 className="pp-title">Materia prima perdida</h3>
            <div className="cr-table-wrap">
                <table className="cr-table">
                    <thead>
                        <tr><th>Insumo</th><th className="r">Cantidad</th><th className="r">Costo</th><th className="r">% del total</th></tr>
                    </thead>
                    <tbody>
                        {materials.map(m => (
                            <tr key={m.rawMaterialId}>
                                <td>
                                    <div className="cr-name">{m.name}</div>
                                    <div className="cr-bar pp-bar"><div style={{ width: `${Math.max(4, (m.cost / (materials[0].cost || 1)) * 100)}%` }} /></div>
                                </td>
                                <td className="r">{qtyText(m.quantity)} {m.unit}</td>
                                <td className="r pp-loss">{money(m.cost)}</td>
                                <td className="r">{materialsCost > 0 ? Math.round((m.cost / materialsCost) * 100) : 0}%</td>
                            </tr>
                        ))}
                        {materials.length === 0 && <tr><td colSpan={4} className="cr-empty">{loading ? 'Cargando…' : 'Sin materia prima perdida en este período.'}</td></tr>}
                    </tbody>
                    {materials.length > 0 && (
                        <tfoot>
                            <tr className="pp-total"><td colSpan={2}>Total</td><td className="r">{money(materialsCost)}</td><td /></tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </section>
    );
}
