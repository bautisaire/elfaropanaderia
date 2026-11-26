import { useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

// Ubicación en vivo del repartidor.
// Privacidad: solo se comparte mientras tiene al menos un pedido "enviado" (en camino).
// Sin pedidos en camino no se lee el GPS y se borra la última ubicación guardada.

export type RiderPosition = {
    email: string;
    name?: string;
    lat: number;
    lng: number;
    accuracy?: number;
    updatedAt: number; // ms
};

const COLLECTION = 'rider_locations';
const MIN_WRITE_INTERVAL_MS = 10_000; // como mucho una escritura cada 10 s...
const MIN_MOVE_METERS = 15;           // ...o antes si se movió más de 15 m
/** Ubicaciones más viejas que esto no se muestran (el teléfono dejó de mandar). */
export const RIDER_LOCATION_STALE_MS = 10 * 60_000;

const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

export type SharingStatus = 'off' | 'needs-permission' | 'starting' | 'sharing' | 'denied' | 'unavailable';

// El permiso se pide con un botón: Safari (iPhone) solo muestra el cartel de "Permitir"
// de forma confiable cuando la persona toca algo. Una vez permitido, se recuerda.
const GPS_OK_KEY = 'rider_gps_enabled';
const readGpsOk = () => { try { return localStorage.getItem(GPS_OK_KEY) === '1'; } catch { return false; } };
const writeGpsOk = (ok: boolean) => { try { if (ok) localStorage.setItem(GPS_OK_KEY, '1'); else localStorage.removeItem(GPS_OK_KEY); } catch { /* sin almacenamiento */ } };

/**
 * Lado repartidor: mientras `active` sea true, sigue el GPS y lo publica en Firestore.
 * Devuelve la posición propia (para dibujarla en su mapa) y el estado del permiso.
 */
export const useRiderLocationSharing = (email: string, name: string, active: boolean) => {
    const [position, setPosition] = useState<RiderPosition | null>(null);
    const [status, setStatus] = useState<SharingStatus>('off');
    const lastWrite = useRef<{ at: number; lat: number; lng: number } | null>(null);
    const [enabled, setEnabled] = useState(readGpsOk);

    // Si el navegador ya tiene el permiso concedido, arrancar sin pedir el botón
    useEffect(() => {
        if (!active || enabled || !navigator.permissions?.query) return;
        navigator.permissions.query({ name: 'geolocation' as PermissionName })
            .then((p) => {
                if (p.state === 'granted') { writeGpsOk(true); setEnabled(true); }
                else if (p.state === 'denied') setStatus('denied');
            })
            .catch(() => { /* Safari viejo: queda el botón */ });
    }, [active, enabled]);

    /** Llamar desde un toque del usuario: abre el cartel de permiso del teléfono. */
    const requestPermission = () => {
        if (!('geolocation' in navigator)) { setStatus('unavailable'); return; }
        setStatus('starting');
        navigator.geolocation.getCurrentPosition(
            () => { writeGpsOk(true); setEnabled(true); },
            (err) => {
                console.warn('Permiso de ubicación:', err);
                setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
            },
            { enableHighAccuracy: true, timeout: 30_000 }
        );
    };

    useEffect(() => {
        if (!email || !active) {
            setPosition(null);
            setStatus('off');
            return;
        }
        if (!('geolocation' in navigator)) {
            setStatus('unavailable');
            return;
        }
        if (!enabled) {
            setStatus((prev) => (prev === 'denied' || prev === 'starting' || prev === 'unavailable' ? prev : 'needs-permission'));
            return;
        }

        const docRef = doc(db, COLLECTION, email.toLowerCase());
        setStatus('starting');
        lastWrite.current = null;

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const p: RiderPosition = {
                    email,
                    name,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    updatedAt: Date.now(),
                };
                setPosition(p);
                setStatus('sharing');

                const last = lastWrite.current;
                const due = !last
                    || Date.now() - last.at >= MIN_WRITE_INTERVAL_MS
                    || metersBetween(last, p) >= MIN_MOVE_METERS;
                if (!due) return;
                lastWrite.current = { at: Date.now(), lat: p.lat, lng: p.lng };
                setDoc(docRef, {
                    email: email.toLowerCase(),
                    name: name || email,
                    lat: p.lat,
                    lng: p.lng,
                    accuracy: Math.round(p.accuracy || 0),
                    updatedAt: serverTimestamp(),
                }).catch((e) => console.warn('No se pudo guardar la ubicación del repartidor:', e));
            },
            (err) => {
                console.warn('GPS del repartidor:', err);
                if (err.code === err.PERMISSION_DENIED) {
                    // Se quitó el permiso desde los ajustes: volver a mostrar el botón
                    writeGpsOk(false);
                    setEnabled(false);
                    setStatus('denied');
                } else {
                    setStatus('unavailable');
                }
            },
            { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 }
        );

        return () => {
            navigator.geolocation.clearWatch(watchId);
            // Al terminar los pedidos en camino (o salir de la pantalla) se borra la ubicación
            deleteDoc(docRef).catch(() => { /* sin permiso o sin conexión: queda vencida sola */ });
        };
    }, [email, name, active, enabled]);

    return { position, status, requestPermission };
};

/** Lado admin: ubicaciones de todos los repartidores en camino (solo mientras `enabled`). */
export const useRiderLocations = (enabled: boolean): RiderPosition[] => {
    const [riders, setRiders] = useState<RiderPosition[]>([]);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!enabled) { setRiders([]); return; }
        const unsub = onSnapshot(collection(db, COLLECTION), (snap) => {
            setRiders(snap.docs.map((d) => {
                const data = d.data();
                return {
                    email: data.email || d.id,
                    name: data.name,
                    lat: data.lat,
                    lng: data.lng,
                    accuracy: data.accuracy,
                    updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now(),
                };
            }).filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number'));
        }, (e) => console.warn('No se pudieron leer las ubicaciones de repartidores:', e));
        // Refresca "hace X min" y descarta las vencidas
        const tick = setInterval(() => setNow(Date.now()), 30_000);
        return () => { unsub(); clearInterval(tick); };
    }, [enabled]);

    return riders.filter((r) => now - r.updatedAt < RIDER_LOCATION_STALE_MS);
};
