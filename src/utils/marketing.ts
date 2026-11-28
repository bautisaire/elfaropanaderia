import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

// Mensajes de marketing por WhatsApp para clientes, según su caso.
// Las plantillas se editan desde Clientes → Mensajes y viven en marketing/templates.

export type Segment = 'favorite' | 'missed' | 'new' | 'none';

export interface MessageTemplate {
    id: string;
    title: string;
    emoji: string;
    segment: Segment;
    text: string;
}

export const SEGMENTS: { key: Exclude<Segment, 'none'>; label: string; emoji: string; help: string }[] = [
    { key: 'favorite', label: 'Favoritos', emoji: '⭐', help: '5 pedidos o más, o 3+ pidiendo seguido' },
    { key: 'missed', label: 'Te extrañamos', emoji: '💛', help: 'Hace 30 días o más que no pide' },
    { key: 'new', label: 'Primera compra', emoji: '🎉', help: 'Hizo un solo pedido en el último mes' },
];

export const PLACEHOLDERS: { key: string; help: string }[] = [
    { key: '{nombre}', help: 'Primer nombre del cliente' },
    { key: '{producto}', help: 'Su producto favorito' },
    { key: '{dias}', help: 'Días desde su último pedido' },
    { key: '{pedidos}', help: 'Cantidad de pedidos' },
];

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
    {
        id: 'favorite',
        title: 'Cliente favorito',
        emoji: '⭐',
        segment: 'favorite',
        text: '¡Hola {nombre}! 🥐 Queremos agradecerte por elegirnos siempre en El Faro: ¡ya van {pedidos} pedidos! Por ser uno de nuestros clientes favoritos, en tu próximo pedido te regalamos un 10% de descuento en {producto}. ¡Te esperamos!',
    },
    {
        id: 'missed',
        title: 'Te extrañamos',
        emoji: '💛',
        segment: 'missed',
        text: '¡Hola {nombre}! Hace {dias} días que no te vemos por El Faro y te extrañamos 🥖. Quisiéramos ofrecerte un 10% de descuento en tu próximo pedido. ¿Te tentás con {producto}? Pedí en www.elfaropanificacion.com o respondé este mensaje.',
    },
    {
        id: 'new',
        title: 'Gracias por tu primera compra',
        emoji: '🎉',
        segment: 'new',
        text: '¡Hola {nombre}! Gracias por tu primer pedido en El Faro 🙌. Esperamos que te haya encantado. Para tu segunda compra tenés un 10% de descuento: pedí en www.elfaropanificacion.com o respondé este mensaje.',
    },
];

/** Caso del cliente, para sugerir el mensaje. "Te extrañamos" gana sobre los demás. */
export const segmentOf = (c: { orders: number; daysSinceLast: number; everyDays: number | null }): Segment => {
    if (c.daysSinceLast >= 30) return 'missed';
    if (c.orders >= 5 || (c.orders >= 3 && c.everyDays !== null && c.everyDays <= 10)) return 'favorite';
    if (c.orders === 1) return 'new';
    return 'none';
};

export const fillTemplate = (text: string, data: { nombre: string; producto: string; dias: number; pedidos: number }) =>
    text
        .replace(/\{nombre\}/g, data.nombre)
        .replace(/\{producto\}/g, data.producto)
        .replace(/\{dias\}/g, String(data.dias))
        .replace(/\{pedidos\}/g, String(data.pedidos));

export const whatsappLink = (phone: string, text: string) =>
    `https://wa.me/549${phone}?text=${encodeURIComponent(text)}`;

const templatesRef = () => doc(db, 'marketing', 'templates');

/** Plantillas guardadas; si todavía no se editó ninguna, las de fábrica. */
export const useTemplates = (): MessageTemplate[] => {
    const [list, setList] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES);
    useEffect(() => onSnapshot(templatesRef(), snap => {
        const saved = snap.data()?.list as MessageTemplate[] | undefined;
        setList(saved && saved.length ? saved : DEFAULT_TEMPLATES);
    }, e => console.warn('No se pudieron leer las plantillas de mensajes:', e)), []);
    return list;
};

export const saveTemplates = (list: MessageTemplate[]) =>
    setDoc(templatesRef(), { list, updatedAt: serverTimestamp() });
