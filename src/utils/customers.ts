import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

// Clientes: el ID es el teléfono (solo los números, formato de 10 dígitos), así
// "2995206821", "2995-206821", "+54 9 299 520-6821", "0299 15 5206821" y
// "15 5206821" son el mismo cliente. Sin característica se asume 299 (Neuquén).
const LOCAL_AREA = '299';
export const normalizePhone = (raw: unknown): string => {
    let d = String(raw ?? '').replace(/\D/g, '');
    if (d.startsWith('54') && d.length >= 12) d = d.slice(2); // código de país
    if (d.startsWith('9') && d.length === 11) d = d.slice(1); // 9 de celular internacional
    if (d.startsWith('0')) d = d.slice(1); // 0 de larga distancia
    if (d.length === 12) {
        // "15" de celular después de la característica (de 3, 4 o 2 dígitos)
        for (const area of [3, 4, 2]) {
            if (d.substr(area, 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break; }
        }
    }
    if (d.length === 9 && d.startsWith('15')) d = LOCAL_AREA + d.slice(2); // "15 5206821"
    if (d.length === 7) d = LOCAL_AREA + d; // "5206821"
    return d.length > 10 ? d.slice(-10) : d;
};

/** Un teléfono sirve como ID si tiene al menos 6 dígitos. */
export const isValidPhone = (phone: string) => phone.length >= 6;

// Dirección comparable: sin mayúsculas, acentos, signos ni la localidad.
// "Las Lengas 797, Senillosa" y "las lengas 797" son la misma dirección.
const DROP_WORDS = new Set(['senillosa', 'neuquen', 'argentina', 'nqn']);
export const addressKey = (raw: unknown): string =>
    String(raw ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(w => w && !DROP_WORDS.has(w))
        .join(' ');

export type CustomerPin = { address: string; lat: number; lng: number };
export type CustomerDoc = {
    notes?: string;
    /** Ubicación fijada por dirección (clave: addressKey). */
    pins?: Record<string, CustomerPin>;
    /** Último mensaje de marketing abierto en WhatsApp desde Clientes. */
    lastMessage?: { templateId: string; title: string; at?: { toMillis?: () => number } };
};

/** Documentos de la colección customers (id = teléfono normalizado). */
export const useCustomerDocs = (enabled = true): Record<string, CustomerDoc> => {
    const [docs, setDocs] = useState<Record<string, CustomerDoc>>({});
    useEffect(() => {
        if (!enabled) return;
        return onSnapshot(collection(db, 'customers'), snap => {
            const map: Record<string, CustomerDoc> = {};
            snap.docs.forEach(d => { map[d.id] = d.data() as CustomerDoc; });
            setDocs(map);
        }, e => {
            console.warn('No se pudieron leer los clientes:', e);
            setDocs({});
        });
    }, [enabled]);
    return docs;
};

/** Ubicación fijada para el teléfono + dirección de un pedido (solo si la dirección coincide). */
export const pinForOrder = (
    docs: Record<string, CustomerDoc>,
    cliente: { telefono?: unknown; direccion?: unknown } | undefined
): CustomerPin | null => {
    if (!cliente) return null;
    const phone = normalizePhone(cliente.telefono);
    if (!isValidPhone(phone)) return null;
    const key = addressKey(cliente.direccion);
    if (!key) return null;
    return docs[phone]?.pins?.[key] || null;
};
