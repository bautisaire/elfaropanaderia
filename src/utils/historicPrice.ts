// Precio de un insumo vigente en una fecha dada.
//
// Las ventas guardan cantidades de insumos (historicIngredients), pero si el costo se recalcula
// con el precio de HOY, un aumento (ej. la hora del panadero de $7.000 a $12.000) "reescribe"
// todos los meses anteriores. Estas funciones resuelven el precio que regía cuando se hizo la venta.

type DateLike = string | number | Date | { seconds: number } | { toDate: () => Date } | null | undefined;

export interface PriceHistoryEntry {
    price: number;
    date: DateLike;
    baseQuantity?: number;
    unit?: string;
}

export interface PricedMaterial {
    price?: number;
    baseQuantity?: number;
    priceHistory?: PriceHistoryEntry[];
}

export const toMillis = (d: DateLike): number => {
    if (d === null || d === undefined) return NaN;
    if (d instanceof Date) return d.getTime();
    if (typeof d === 'number') return d;
    if (typeof d === 'string') return Date.parse(d);
    if ('toDate' in d && typeof d.toDate === 'function') return d.toDate().getTime();
    if ('seconds' in d && typeof d.seconds === 'number') return d.seconds * 1000;
    return NaN;
};

/** Costo por unidad base (ej. por gramo, por minuto) con el precio actual. */
export const getCurrentUnitCost = (mat: PricedMaterial): number =>
    (Number(mat.price) || 0) / (Number(mat.baseQuantity) || 1);

/**
 * Costo por unidad base vigente en `when`, según `priceHistory` (cada entrada es el precio
 * nuevo y la fecha desde la que rige). Si la fecha es anterior al primer registro se usa el
 * precio más viejo conocido; sin historial, el precio actual.
 */
export const getUnitCostAt = (mat: PricedMaterial, when: DateLike): number => {
    const t = toMillis(when);
    const history = (mat.priceHistory || [])
        .map(h => ({ h, t: toMillis(h.date) }))
        .filter(x => Number.isFinite(x.t) && Number.isFinite(Number(x.h.price)))
        .sort((a, b) => a.t - b.t);

    if (!Number.isFinite(t) || history.length === 0) return getCurrentUnitCost(mat);

    let chosen = history[0];
    for (const x of history) {
        if (x.t <= t) chosen = x;
        else break;
    }
    const base = Number(chosen.h.baseQuantity) > 0 ? Number(chosen.h.baseQuantity) : (Number(mat.baseQuantity) || 1);
    return Number(chosen.h.price) / base;
};

interface IngredientLike {
    rawMaterialId: string;
    quantity: number;
    [key: string]: unknown;
}

/**
 * Copia los ingredientes agregando `unitCost` (costo por unidad base vigente ahora), para
 * guardarlos en la venta y que el historial no cambie si después sube el precio.
 */
export const freezeIngredientUnitCosts = <T extends IngredientLike>(
    ingredients: T[],
    rawMaterials: Map<string, PricedMaterial>
): (T & { unitCost?: number })[] =>
    ingredients.map(ing => {
        const mat = rawMaterials.get(ing.rawMaterialId);
        return mat ? { ...ing, unitCost: getCurrentUnitCost(mat) } : ing;
    });
