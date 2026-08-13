export interface PriceTier {
    quantity: number;
    price: number;
}

/**
 * Calcula el total de una línea aplicando precios por cantidad (ej. media docena, docena).
 * Los tiers se aplican de forma "greedy" desde el de mayor cantidad al menor: por cada
 * múltiplo completo de `tier.quantity` se cobra `tier.price`, y las unidades sobrantes
 * se cobran al precio unitario normal.
 *
 * Ej: tiers = [{quantity:6, price:5800}, {quantity:12, price:11500}], unitPrice=1000
 *  - qty 6  -> 5800
 *  - qty 7  -> 5800 + 1*1000 = 6800
 *  - qty 12 -> 11500
 *  - qty 18 -> 11500 + 5800 = 17300
 */
export function calculateTieredTotal(quantity: number, unitPrice: number, priceTiers?: PriceTier[]): number {
    const validTiers = (priceTiers || []).filter(t => t.quantity > 0 && t.price >= 0);

    if (validTiers.length === 0 || quantity <= 0) {
        return unitPrice * quantity;
    }

    const sortedTiers = [...validTiers].sort((a, b) => b.quantity - a.quantity);

    let remaining = quantity;
    let total = 0;

    for (const tier of sortedTiers) {
        if (remaining < tier.quantity) continue;
        const count = Math.floor(remaining / tier.quantity);
        total += count * tier.price;
        remaining -= count * tier.quantity;
    }

    total += remaining * unitPrice;
    return total;
}
