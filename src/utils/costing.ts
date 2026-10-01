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

export interface CostingRecipe {
    ingredients?: CostingIngredient[];
    yield?: number;
    yieldType?: YieldType;
    weightPerUnitGrams?: number;
    merma?: number; // Porcentaje de desperdicio/pérdida
    excludeCif?: boolean;
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
