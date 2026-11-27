import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export type RiderAccount = { email: string; name: string };

/** Repartidores: cuentas de admin_roles con el rol is_rider (las lee cualquier admin). */
export const useRiders = (enabled = true): RiderAccount[] => {
    const [riders, setRiders] = useState<RiderAccount[]>([]);
    useEffect(() => {
        if (!enabled) return;
        return onSnapshot(query(collection(db, 'admin_roles'), where('is_rider', '==', true)), snap => {
            setRiders(snap.docs
                .map(d => {
                    const data = d.data();
                    const email = d.id.toLowerCase();
                    return { email, name: String(data.primary_name || '').trim() || email.split('@')[0] };
                })
                .sort((a, b) => a.name.localeCompare(b.name)));
        }, e => {
            console.warn('No se pudo leer la lista de repartidores:', e);
            setRiders([]);
        });
    }, [enabled]);
    return riders;
};

/** Id del perfil de empleado que se crea por defecto para un repartidor. */
export const riderProfileId = (email: string) => `rider_${email.toLowerCase()}`;
