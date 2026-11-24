// Fechas como claves 'yyyy-mm-dd' (hora de Argentina) y días de la semana, compartidas por
// Pagos y Empleados. Las cuentas se hacen en UTC para que el huso horario no corra el día.

const AR_TZ = 'America/Argentina/Buenos_Aires';

export const todayKey = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const pad = (n: number) => String(n).padStart(2, '0');
export const parts = (key: string) => key.split('-').map(Number) as [number, number, number];
export const utc = (key: string) => { const [y, m, d] = parts(key); return Date.UTC(y, m - 1, d); };
export const diffDays = (a: string, b: string) => Math.round((utc(a) - utc(b)) / 86400000);
export const addDays = (key: string, n: number) => new Date(utc(key) + n * 86400000).toISOString().slice(0, 10);
export const weekDayOf = (key: string) => new Date(utc(key)).getUTCDay();

/** Mismo día (`day`) del mes siguiente; si ese mes es más corto, el último día. */
export const nextMonth = (key: string, day: number) => {
    const [y, m] = parts(key);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${ny}-${pad(nm)}-${pad(Math.min(day, last))}`;
};

/** Próxima fecha (después de `key`) que cae en uno de los días de la semana elegidos. */
export const nextWeekDay = (key: string, days: number[]) => {
    for (let i = 1; i <= 7; i++) {
        const k = addDays(key, i);
        if (days.includes(weekDayOf(k))) return k;
    }
    return addDays(key, 7);
};

// Lunes a domingo, con el número de día de JS (0 = domingo).
export const WEEK_DAYS: { day: number; label: string }[] = [
    { day: 1, label: 'Lu' }, { day: 2, label: 'Ma' }, { day: 3, label: 'Mi' }, { day: 4, label: 'Ju' },
    { day: 5, label: 'Vi' }, { day: 6, label: 'Sá' }, { day: 0, label: 'Do' },
];
export const WEEKS_PER_MONTH = 52 / 12;

/** "Lu a Sá", "Lu, Mi, Vi" o "Todos los días". */
export const weekDaysText = (days?: number[] | null) => {
    if (!days || days.length === 0) return '';
    if (days.length === 7) return 'Todos los días';
    const idx = WEEK_DAYS.map((d, i) => (days.includes(d.day) ? i : -1)).filter(i => i >= 0);
    const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    return consecutive && idx.length > 2
        ? `${WEEK_DAYS[idx[0]].label} a ${WEEK_DAYS[idx[idx.length - 1]].label}`
        : idx.map(i => WEEK_DAYS[i].label).join(', ');
};
