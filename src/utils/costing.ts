/**
 * Motor único de cálculo de costos (recetas, CIF y costo real de productos).
 * Funciones puras: reciben todos los datos que necesitan y no tocan Firestore,
 * así Recetas, Productos, el Simulador y la sincronización con el POS usan
 * exactamente la misma fórmula.
 */

export type YieldType = 'units' | 'kg';

/** Gramos que equivalen a una "unidad CIF" (el costo CIF se fija cada 100 g). */
export const CIF_GRAMS_PER_UNIT = 100;

export interface CostingRawMaterial {
    id: string;
    baseQuantity: number;
    price: number;
    category?: string;
}

export interface CostingIngredient {
    rawMaterialId: string;
    quantity: number;
}

/**
 * Diferencia puntual de una variante contra su receta base: cambia la cantidad de un
 * insumo (o lo agrega si la base no lo tiene) o lo quita.
 */
export interface IngredientChange {
    rawMaterialId: string;
    quantity?: number;
    remove?: boolean;
}

/** Lo que una variante cambia respecto de la base; lo que falta se hereda. */
export interface RecipeVariant {
    changes?: IngredientChange[];
    yield?: number;
    weightPerUnitGrams?: number;
    merma?: number;
    excludeCif?: boolean;
}

export interface CostingRecipe {
    ingredients?: CostingIngredient[];
    yield?: number;
    yieldType?: YieldType;
    weightPerUnitGrams?: number;
    merma?: number; // Porcentaje de desperdicio/pérdida
    excludeCif?: boolean;
    /** Receta base (`recipe_bases`) de la que deriva. Los campos de arriba son la copia resuelta. */
    baseRecipeId?: string;
    variant?: RecipeVariant;
}

export interface CostingProduct {
    id?: string;
    recipe?: CostingRecipe | null;
    stockDependency?: {
        productId: string;
        unitsToDeduct: number;
    };
}

export interface CostingContext {
    rawMaterials: CostingRawMaterial[];
    products: CostingProduct[];
    cifUnitCost: number; // Costo CIF cada 100 g (config/cif_settings)
}

/** Receta base reutilizable por varios productos. */
export interface RecipeBase extends CostingRecipe {
    id: string;
    name: string;
}

/** Campos de la receta que una variante puede pisar. */
const VARIANT_SCALARS = ['yield', 'weightPerUnitGrams', 'merma', 'excludeCif'] as const;

/** Receta resuelta = base + diferencias de la variante. Sin variante devuelve la base. */
export const applyRecipeVariant = (
    base: CostingRecipe,
    variant?: RecipeVariant | null
): CostingRecipe => {
    const ingredients = (base.ingredients || []).map(i => ({ ...i }));

    for (const change of variant?.changes || []) {
        const idx = ingredients.findIndex(i => i.rawMaterialId === change.rawMaterialId);
        if (change.remove) {
            if (idx !== -1) ingredients.splice(idx, 1);
        } else if (idx !== -1) {
            ingredients[idx].quantity = Number(change.quantity) || 0;
        } else {
            ingredients.push({ rawMaterialId: change.rawMaterialId, quantity: Number(change.quantity) || 0 });
        }
    }

    const resolved: CostingRecipe = {
        ingredients,
        yield: base.yield,
        yieldType: base.yieldType,
        weightPerUnitGrams: base.weightPerUnitGrams,
        merma: base.merma,
        excludeCif: base.excludeCif
    };
    for (const key of VARIANT_SCALARS) {
        if (variant && variant[key] !== undefined) (resolved as Record<string, unknown>)[key] = variant[key];
    }
    return resolved;
};

/** Inversa de `applyRecipeVariant`: qué cambió `edited` respecto de `base`. */
export const diffRecipeFromBase = (base: CostingRecipe, edited: CostingRecipe): RecipeVariant => {
    const variant: RecipeVariant = {};
    const baseIngs = base.ingredients || [];
    const editedIngs = edited.ingredients || [];

    const changes: IngredientChange[] = [];
    for (const ing of editedIngs) {
        const original = baseIngs.find(b => b.rawMaterialId === ing.rawMaterialId);
        if (!original || original.quantity !== ing.quantity) {
            changes.push({ rawMaterialId: ing.rawMaterialId, quantity: ing.quantity });
        }
    }
    for (const original of baseIngs) {
        if (!editedIngs.some(i => i.rawMaterialId === original.rawMaterialId)) {
            changes.push({ rawMaterialId: original.rawMaterialId, remove: true });
        }
    }
    if (changes.length > 0) variant.changes = changes;

    if (edited.yield !== undefined && edited.yield !== base.yield) variant.yield = edited.yield;
    if ((edited.weightPerUnitGrams || 0) !== (base.weightPerUnitGrams || 0)) variant.weightPerUnitGrams = edited.weightPerUnitGrams || 0;
    if ((edited.merma || 0) !== (base.merma || 0)) variant.merma = edited.merma || 0;
    if (!!edited.excludeCif !== !!base.excludeCif) variant.excludeCif = !!edited.excludeCif;

    return variant;
};

/** Cambia un insumo por otro en una lista; si el destino ya estaba, suma las cantidades. */
export const replaceIngredient = (
    ingredients: CostingIngredient[],
    fromId: string,
    toId: string
): CostingIngredient[] => {
    const result = ingredients.map(i => ({ ...i }));
    const fromIdx = result.findIndex(i => i.rawMaterialId === fromId);
    if (fromIdx === -1) return result;
    const toIdx = result.findIndex(i => i.rawMaterialId === toId);
    if (toIdx !== -1) {
        result[toIdx].quantity += result[fromIdx].quantity;
        result.splice(fromIdx, 1);
    } else {
        result[fromIdx].rawMaterialId = toId;
    }
    return result;
};

/** Igual que `replaceIngredient` pero para las diferencias de una variante. */
export const replaceIngredientInVariant = (
    variant: RecipeVariant | undefined,
    fromId: string,
    toId: string
): RecipeVariant | undefined => {
    if (!variant?.changes) return variant;
    const changes: IngredientChange[] = [];
    for (const change of variant.changes) {
        if (change.rawMaterialId !== fromId) {
            changes.push({ ...change });
        } else if (!variant.changes.some(c => c.rawMaterialId === toId)) {
            changes.push({ ...change, rawMaterialId: toId });
        }
    }
    return { ...variant, changes };
};

export const getRecipeYieldType = (recipe: CostingRecipe | null | undefined, yieldType?: YieldType): YieldType =>
    yieldType || recipe?.yieldType || 'units';

/** Gramos totales que rinde la receta (0 si no se puede saber el peso). */
export const getRecipeTotalGrams = (recipe: CostingRecipe | null | undefined, yieldType?: YieldType): number => {
    if (!recipe || !recipe.yield || recipe.yield <= 0) return 0;

    if (getRecipeYieldType(recipe, yieldType) === 'kg') {
        return recipe.yield * 1000;
    }

    if (!recipe.weightPerUnitGrams) return 0;
    return recipe.yield * recipe.weightPerUnitGrams;
};

export const getRecipeCifUnits = (recipe: CostingRecipe | null | undefined, yieldType?: YieldType): number =>
    recipe?.excludeCif ? 0 : getRecipeTotalGrams(recipe, yieldType) / CIF_GRAMS_PER_UNIT;

/** La merma sólo encarece insumos de 'materia prima' (o sin categoría). */
const isMermable = (mat: CostingRawMaterial): boolean =>
    mat.category === 'materia prima' || !mat.category;

export const calculateIngredientCost = (
    ing: CostingIngredient,
    rawMaterials: CostingRawMaterial[],
    recipeMermaPercentage: number = 0
): number => {
    const mat = rawMaterials.find(m => m.id === ing.rawMaterialId);
    if (!mat || !mat.baseQuantity) return 0;

    // Regla de 3: (Precio / Base) * CantidadUsada
    let cost = (mat.price / mat.baseQuantity) * ing.quantity;

    if (isMermable(mat) && recipeMermaPercentage > 0) {
        cost += cost * (recipeMermaPercentage / 100);
    }

    return cost;
};

/** Costo de insumos de toda la tanda (con merma), sin CIF. */
export const calculateRecipeIngredientsCost = (
    recipe: CostingRecipe | null | undefined,
    rawMaterials: CostingRawMaterial[]
): number => {
    if (!recipe) return 0;
    return (recipe.ingredients || []).reduce(
        (total, ing) => total + calculateIngredientCost(ing, rawMaterials, recipe.merma || 0),
        0
    );
};

/** CIF de toda la tanda. */
export const calculateRecipeCifCost = (
    recipe: CostingRecipe | null | undefined,
    cifUnitCost: number,
    yieldType?: YieldType
): number => getRecipeCifUnits(recipe, yieldType) * cifUnitCost;

/** Costo de toda la tanda: insumos + CIF. */
export const calculateRecipeTotalCost = (
    recipe: CostingRecipe | null | undefined,
    ctx: CostingContext,
    yieldType?: YieldType
): number => {
    if (!recipe) return 0;
    return calculateRecipeIngredientsCost(recipe, ctx.rawMaterials)
        + calculateRecipeCifCost(recipe, ctx.cifUnitCost, yieldType);
};

/** Costo por unidad (o por kg si la receta rinde en kg). */
export const calculateRecipeUnitCost = (
    recipe: CostingRecipe | null | undefined,
    ctx: CostingContext,
    yieldType?: YieldType
): number => {
    if (!recipe || !recipe.yield || isNaN(recipe.yield) || recipe.yield <= 0) return 0;
    const cost = calculateRecipeTotalCost(recipe, ctx, getRecipeYieldType(recipe, yieldType)) / recipe.yield;
    return isNaN(cost) ? 0 : cost;
};

export interface RealProductCostOptions {
    /** Receta a usar en lugar de la guardada (borrador en edición, reemplazo global, etc.). */
    recipeOverride?: CostingRecipe | null;
    yieldTypeOverride?: YieldType;
    visitedIds?: Set<string>;
}

/**
 * Costo unitario real: lo que hereda del producto padre (si tiene dependencia de stock)
 * más el costo de su propia receta.
 */
export const calculateRealProductCost = (
    product: CostingProduct | null | undefined,
    ctx: CostingContext,
    options: RealProductCostOptions = {}
): number => {
    if (!product) return 0;

    const visitedIds = options.visitedIds || new Set<string>();
    if (product.id) {
        if (visitedIds.has(product.id)) return 0; // Evitar lazos infinitos
        visitedIds.add(product.id);
    }

    let totalCost = 0;

    // 1. Costo heredado del Padre (si tiene dependencia)
    const parentId = product.stockDependency?.productId;
    if (parentId) {
        const parent = ctx.products.find(p => p.id === parentId);
        if (parent) {
            const parentUnitCost = calculateRealProductCost(parent, ctx, { visitedIds });
            totalCost += parentUnitCost * (Number(product.stockDependency?.unitsToDeduct) || 0);
        }
    }

    // 2. Costo propio de la receta (ej. empaques o insumos extras)
    const recipe = options.recipeOverride !== undefined ? options.recipeOverride : product.recipe;
    if (recipe) {
        totalCost += calculateRecipeUnitCost(recipe, ctx, options.yieldTypeOverride || recipe.yieldType || 'units');
    }

    return isNaN(totalCost) ? 0 : totalCost;
};
