import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, increment, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig";

// Registro de visitas: cuenta 1 visita por dispositivo por día (visitante único diario).
// No cuenta superadmin, admins/empleados/riders (admin_roles) ni VITE_ADMIN_EMAIL.

const SUPERADMIN_EMAIL = 'sairebautista@gmail.com';
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
const LAST_VISIT_KEY = 'elfaro_last_visit_date';
const EXCLUDED_KEY = 'elfaro_visit_excluded';

let started = false; // Evita doble conteo (StrictMode / re-montajes)

export const getArgentinaDateKey = (date: Date = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: "America/Argentina/Buenos_Aires", year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const safeGet = (storage: Storage, key: string) => {
    try { return storage.getItem(key); } catch { return null; }
};
const safeSet = (storage: Storage, key: string, value: string) => {
    try { storage.setItem(key, value); } catch { /* storage bloqueado */ }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// Origen: ?ref= o ?utm_source= tienen prioridad; si no, se deduce del referrer.
const detectSource = (): string => {
    const params = new URLSearchParams(window.location.search);
    const explicit = (params.get('ref') || params.get('utm_source') || '').trim();
    if (explicit) return capitalize(explicit).replace(/[.$#[\]/]/g, '').slice(0, 40) || 'Directo';

    let host = '';
    try {
        host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
    } catch { /* referrer inválido */ }
    if (!host || host === window.location.hostname) return 'Directo';

    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('facebook') || host === 'fb.com' || host.endsWith('.fb.com')) return 'Facebook';
    if (host.includes('whatsapp') || host === 'wa.me') return 'Whatsapp';
    if (host.includes('google')) return 'Google';
    if (host.includes('bing')) return 'Bing';
    if (host.includes('tiktok')) return 'Tiktok';
    if (host === 't.co' || host.includes('twitter') || host === 'x.com') return 'Twitter';
    return 'Otros';
};

const isStaffEmail = async (email: string | null | undefined): Promise<boolean> => {
    if (!email) return false;
    const lower = email.toLowerCase();
    if (lower === SUPERADMIN_EMAIL || ADMIN_EMAILS.includes(lower)) return true;
    try {
        const roleDoc = await getDoc(doc(db, "admin_roles", lower));
        return roleDoc.exists();
    } catch {
        return false;
    }
};

export const trackVisit = () => {
    if (started) return;
    started = true;

    // Un dispositivo que alguna vez inició sesión como staff no vuelve a sumar visitas.
    if (safeGet(localStorage, EXCLUDED_KEY) === 'true') return;

    const today = getArgentinaDateKey();
    if (safeGet(localStorage, LAST_VISIT_KEY) === today) return;

    // Se toma el origen ahora, antes de que la navegación limpie la URL.
    const source = detectSource();

    // Esperamos el primer estado de Auth para saber si es admin.
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        unsubscribe();

        if (await isStaffEmail(currentUser?.email)) {
            safeSet(localStorage, EXCLUDED_KEY, 'true');
            return;
        }

        // Marcamos antes de escribir para no duplicar si hay otra pestaña abriéndose.
        safeSet(localStorage, LAST_VISIT_KEY, today);
        try {
            await setDoc(doc(db, "stats", "general"), {
                visits: increment(1),
                dailyVisits: { [today]: increment(1) },
                visitsBySource: { [source]: increment(1) },
                dailyVisitsBySource: { [today]: { [source]: increment(1) } }
            }, { merge: true });
        } catch (error) {
            console.error("Error logging visit:", error);
        }
    });
};

// Llamar al iniciar sesión: si el usuario es staff, excluir este dispositivo a futuro.
export const markDeviceAsStaff = () => safeSet(localStorage, EXCLUDED_KEY, 'true');
