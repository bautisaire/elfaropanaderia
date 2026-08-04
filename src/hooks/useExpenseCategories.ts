import { useEffect, useRef, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';

export interface ExpenseCategory {
    key: string;
    label: string;
    icon: string;
    locked?: boolean;
    order?: number;
}

// "materia_prima" está protegida porque VoiceAIPurchases.tsx dispara la lógica de
// alta/actualización de materias primas cuando ticketType === "materia_prima" (comparación
// por key, no por label). "otro" está protegida porque es el fallback al borrar categorías.
export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
    { key: 'materia_prima', label: 'Materia Prima', icon: '🛒', locked: true, order: 0 },
    { key: 'servicio', label: 'Servicio', icon: '💡', order: 1 },
    { key: 'delivery', label: 'Delivery', icon: '🚚', order: 2 },
    { key: 'otro', label: 'Otro', icon: '📦', locked: true, order: 3 },
];

export const FALLBACK_CATEGORY_KEY = 'otro';

export function useExpenseCategories() {
    const [categories, setCategories] = useState<ExpenseCategory[]>(DEFAULT_EXPENSE_CATEGORIES);
    const [loading, setLoading] = useState(true);
    const hasSeeded = useRef(false);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'expense_categories'), async (snap) => {
            if (snap.empty && !hasSeeded.current) {
                hasSeeded.current = true;
                try {
                    await Promise.all(DEFAULT_EXPENSE_CATEGORIES.map(cat =>
                        setDoc(doc(db, 'expense_categories', cat.key), {
                            label: cat.label,
                            icon: cat.icon,
                            locked: !!cat.locked,
                            order: cat.order
                        })
                    ));
                } catch (error) {
                    console.error('Error creando categorías de gastos por defecto:', error);
                }
                return; // el propio seed dispara un nuevo snapshot con los datos ya creados
            }

            const data = snap.docs
                .map(d => ({ key: d.id, ...(d.data() as any) } as ExpenseCategory))
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label));
            setCategories(data);
            setLoading(false);
        }, (error) => {
            console.error('Error cargando categorías de gastos:', error);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    return { categories, loading };
}

export function slugifyCategoryKey(name: string, existingKeys: string[]): string {
    const base = name
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'categoria';

    let key = base;
    let i = 2;
    while (existingKeys.includes(key)) {
        key = `${base}_${i}`;
        i++;
    }
    return key;
}
