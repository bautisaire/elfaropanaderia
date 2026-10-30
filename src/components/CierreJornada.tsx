import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, updateDoc, addDoc, increment, onSnapshot } from 'firebase/firestore';
import { FaTrashAlt, FaTimes, FaCheckCircle } from 'react-icons/fa';
import { syncChildProducts } from '../utils/stockUtils';
import { calculateIngredientCost, type CostingRecipe } from '../utils/costing';
import './StockManager.css';

// Cierre de jornada: lo que sobra de los productos marcados "Se tira al cierre" se descarta.
// Baja el stock del producto, descuenta la materia prima que llevaba y guarda el costo de la
// pérdida: total (receta completa, con CIF) y aparte lo que corresponde a materia prima.

interface CloseVariant {
    name: string;
    stock?: boolean;
    stockQuantity?: number;
}

interface CloseProduct {
    id: string;
    nombre: string;
    stockQuantity?: number;
    unitType?: 'unit' | 'weight';
    variants?: CloseVariant[];
    discardAtEndOfDay?: boolean;
    stockDependency?: unknown;
    recipe?: CostingRecipe & { costPerUnit?: number };
}

interface RawMat {
    id: string;
    name: string;
    unit: string;
    baseQuantity: number;
    price: number;
    category?: string;
}

interface IngredientLoss {
    rawMaterialId: string;
    name: string;
    unit: string;
    quantity: number;
    cost: number;
}

interface CloseRow {
    key: string;
    product: CloseProduct;
    variantIndex?: number;
    label: string;
    stock: number;
    qty: number;
    isWeight: boolean;
    totalCost: number;
    rawCost: number;
    ingredients: IngredientLoss[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const money = (n: number) => `$${round2(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (n: number) => round3(n).toLocaleString('es-AR', { maximumFractionDigits: 3 });

export default function CierreJornada() {
    const [products, setProducts] = useState<CloseProduct[]>([]);
    const [rawMaterials, setRawMaterials] = useState<RawMat[]>([]);
    const [loading, setLoading] = useState(true);
    // Cantidad a tirar por casilla; si no se tocó, es todo el stock que queda.
    const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        const unsubProducts = onSnapshot(collection(db, 'products'), snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CloseProduct));
            setLoading(false);
        }, err => { console.error(err); setLoading(false); });
        const unsubRaw = onSnapshot(collection(db, 'raw_materials'), snap => {
            setRawMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() }) as RawMat));
        }, err => console.error(err));
        return () => { unsubProducts(); unsubRaw(); };
    }, []);

    const rows = useMemo<CloseRow[]>(() => {
        const result: CloseRow[] = [];

        const build = (product: CloseProduct, key: string, label: string, stock: number, variantIndex?: number) => {
            if (stock <= 0) return;
            const typed = qtyInputs[key];
            const qty = typed === undefined ? stock : Math.min(stock, Math.max(0, Number(typed) || 0));

            const recipe = product.recipe;
            const yieldQty = recipe?.yield && recipe.yield > 0 ? recipe.yield : 0;
            const ingredients: IngredientLoss[] = [];
            if (recipe && yieldQty && qty > 0) {
                for (const ing of recipe.ingredients || []) {
                    const mat = rawMaterials.find(m => m.id === ing.rawMaterialId);
                    if (!mat) continue;
                    const used = (ing.quantity / yieldQty) * qty;
                    const cost = (calculateIngredientCost(ing, rawMaterials, recipe.merma || 0) / yieldQty) * qty;
                    ingredients.push({ rawMaterialId: mat.id, name: mat.name, unit: mat.unit, quantity: used, cost });
                }
            }
            const rawCost = ingredients.reduce((s, i) => s + i.cost, 0);
            // El costo total sale del costo por unidad ya sincronizado (incluye CIF); nunca menos que la materia prima.
            const totalCost = Math.max((recipe?.costPerUnit || 0) * qty, rawCost);

            result.push({
                key, product, variantIndex, label, stock, qty,
                isWeight: product.unitType === 'weight',
                totalCost, rawCost, ingredients,
            });
        };

        products
            .filter(p => p.discardAtEndOfDay && !p.stockDependency)
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .forEach(p => {
                if (p.variants && p.variants.length > 0) {
                    p.variants.forEach((v, idx) => build(p, `${p.id}-${idx}`, `${p.nombre} (${v.name})`, v.stockQuantity || 0, idx));
                } else {
                    build(p, p.id, p.nombre, p.stockQuantity || 0);
                }
            });
        return result;
    }, [products, rawMaterials, qtyInputs]);

    const activeRows = rows.filter(r => r.qty > 0);

    const totals = useMemo(() => {
        const byMaterial = new Map<string, IngredientLoss>();
        activeRows.forEach(r => r.ingredients.forEach(i => {
            const cur = byMaterial.get(i.rawMaterialId);
            if (cur) { cur.quantity += i.quantity; cur.cost += i.cost; }
            else byMaterial.set(i.rawMaterialId, { ...i });
        }));
        return {
            totalCost: activeRows.reduce((s, r) => s + r.totalCost, 0),
            rawCost: activeRows.reduce((s, r) => s + r.rawCost, 0),
            materials: Array.from(byMaterial.values()).sort((a, b) => b.cost - a.cost),
        };
    }, [activeRows]);

    const executeClose = async () => {
        if (activeRows.length === 0) return;
        setSaving(true);
        try {
            for (const row of activeRows) {
                const { product, variantIndex, qty } = row;
                let stockAfter: number;
                if (variantIndex !== undefined) {
                    const variants = (product.variants || []).map(v => ({ ...v }));
                    stockAfter = round3((variants[variantIndex].stockQuantity || 0) - qty);
                    variants[variantIndex].stockQuantity = stockAfter;
                    variants[variantIndex].stock = stockAfter > 0;
                    await updateDoc(doc(db, 'products', product.id), { variants });
                } else {
                    stockAfter = round3((product.stockQuantity || 0) - qty);
                    await updateDoc(doc(db, 'products', product.id), { stockQuantity: stockAfter });
                    await syncChildProducts(product.id, stockAfter);
                }
                await addDoc(collection(db, 'stock_movements'), {
                    productId: product.id,
                    productName: row.label,
                    type: 'OUT',
                    quantity: qty,
                    reason: 'Merma/Desperdicio',
                    observation: 'Cierre de jornada',
                    date: new Date(),
                    stockAfter,
                });
            }

            for (const mat of totals.materials) {
                await updateDoc(doc(db, 'raw_materials', mat.rawMaterialId), { stockQuantity: increment(-round3(mat.quantity)) });
            }

            await addDoc(collection(db, 'waste_logs'), {
                date: new Date(),
                type: 'cierre_jornada',
                totalCost: round2(totals.totalCost),
                rawMaterialCost: round2(totals.rawCost),
                items: activeRows.map(r => ({
                    productId: r.product.id,
                    name: r.label,
                    quantity: r.qty,
                    totalCost: round2(r.totalCost),
                    rawMaterialCost: round2(r.rawCost),
                    ingredients: r.ingredients.map(i => ({ ...i, quantity: round3(i.quantity), cost: round2(i.cost) })),
                })),
                rawMaterials: totals.materials.map(m => ({ ...m, quantity: round3(m.quantity), cost: round2(m.cost) })),
            });

            setQtyInputs({});
            setConfirmOpen(false);
            setMsg(`Cierre guardado: pérdida total ${money(totals.totalCost)} (materia prima ${money(totals.rawCost)}).`);
        } catch (error) {
            console.error('Error en el cierre de jornada:', error);
            alert('Ocurrió un error al guardar el cierre. Revisá el historial de stock antes de reintentar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p>Cargando...</p>;

    const box = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' } as const;

    return (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b' }}>
                    <FaTrashAlt style={{ color: '#dc2626' }} /> Cierre de jornada
                </h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
                    Lo que sobra de los productos marcados <strong>"Se tira al cierre"</strong> se descarta. Los demás siguen en stock para mañana.
                </p>
            </div>

            {msg && (
                <div style={{ ...box, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: 16 }}>{msg}</div>
            )}

            {rows.length === 0 ? (
                <div style={{ ...box, textAlign: 'center', color: '#64748b', padding: 30 }}>
                    No hay stock para tirar. Marcá "Se tira al cierre" en los productos que se descartan (Productos → editar).
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                        <div style={{ ...box, borderColor: '#fca5a5', background: '#fef2f2' }}>
                            <div style={{ fontSize: 12, color: '#7f1d1d', fontWeight: 600 }}>Costo total de la pérdida</div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: '#dc2626' }}>{money(totals.totalCost)}</div>
                            <div style={{ fontSize: 12, color: '#991b1b' }}>Receta completa (materia prima + costos fijos)</div>
                        </div>
                        <div style={{ ...box }}>
                            <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>De eso, materia prima</div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: '#1e293b' }}>{money(totals.rawCost)}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Lo que se descuenta del stock de insumos</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        {rows.map(r => (
                            <div key={r.key} style={{ ...box, opacity: r.qty > 0 ? 1 : 0.55 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: 160 }}>
                                        <strong style={{ color: '#1e293b' }}>{r.label}</strong>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>
                                            Stock: {qtyText(r.stock)}{r.isWeight ? ' kg' : ''}
                                            {!r.product.recipe?.yield && ' · sin receta: no se puede calcular el costo'}
                                        </div>
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        max={r.stock}
                                        step={r.isWeight ? '0.001' : '1'}
                                        className="quick-input"
                                        style={{ width: 90 }}
                                        value={qtyInputs[r.key] ?? String(r.stock)}
                                        onChange={e => setQtyInputs(prev => ({ ...prev, [r.key]: e.target.value }))}
                                        title="Cantidad a tirar (0 = no tirar)"
                                    />
                                    <div style={{ textAlign: 'right', minWidth: 130 }}>
                                        <div style={{ fontWeight: 700, color: '#dc2626' }}>{money(r.totalCost)}</div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>Mat. prima {money(r.rawCost)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {totals.materials.length > 0 && (
                        <div style={{ ...box, marginBottom: 16 }}>
                            <strong style={{ color: '#1e293b' }}>Materia prima perdida</strong>
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {totals.materials.map(m => (
                                    <div key={m.rawMaterialId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#334155' }}>
                                        <span>{m.name}</span>
                                        <span>{qtyText(m.quantity)} {m.unit} · <strong>{money(m.cost)}</strong></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        disabled={activeRows.length === 0}
                        onClick={() => setConfirmOpen(true)}
                        style={{ width: '100%', background: '#dc2626', color: '#fff', border: 'none', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: activeRows.length === 0 ? 'not-allowed' : 'pointer', opacity: activeRows.length === 0 ? 0.5 : 1 }}
                    >
                        Cerrar jornada y descartar
                    </button>
                </>
            )}

            {confirmOpen && (
                <div className="stock-modal-overlay" onClick={() => !saving && setConfirmOpen(false)}>
                    <div className="stock-modal" onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '95vw' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
                            <h3 style={{ margin: 0, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FaTrashAlt /> ¿Cerrar la jornada?
                            </h3>
                            <button onClick={() => setConfirmOpen(false)} disabled={saving} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>
                                <FaTimes />
                            </button>
                        </div>
                        <p style={{ color: '#1e293b', marginBottom: 12 }}>
                            Se descartan <strong>{activeRows.length} producto(s)</strong> y se descuenta la materia prima de {totals.materials.length} insumo(s).
                        </p>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 14, color: '#7f1d1d' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Costo total</span><strong>{money(totals.totalCost)}</strong></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Materia prima</span><strong>{money(totals.rawCost)}</strong></div>
                        </div>
                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button className="btn-cancel" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancelar</button>
                            <button
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                onClick={executeClose}
                                disabled={saving}
                            >
                                <FaCheckCircle /> {saving ? 'Guardando...' : 'Confirmar cierre'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
