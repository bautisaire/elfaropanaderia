import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { FaTimes, FaMapMarkerAlt, FaPhone, FaExternalLinkAlt, FaMotorcycle, FaStore, FaRoute, FaFlask, FaTrash, FaPlus } from 'react-icons/fa';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './GlobalDeliveriesMapModal.css';

// Fix for default Leaflet icon in React
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { mapsLinkForCoords } from '../utils/mapsLink';
import { useCart } from '../context/CartContext';
import type { RiderPosition } from '../utils/riderLocation';
import { useCustomerDocs, pinForOrder } from '../utils/customers';

const DefaultIcon = L.icon({
    iconUrl,
    iconRetinaUrl,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Marcador del local: ícono de tienda (react-icons) sobre un círculo amarillo
const bakeryIcon = L.divIcon({
    html: `<div class="bakery-marker">${renderToStaticMarkup(<FaStore size={20} color="#ffffff" />)}</div>`,
    className: 'custom-bakery-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
});

// Pines de prueba: marcador naranja con frasco, para distinguirlos de los pedidos reales
const testPinIcon = L.divIcon({
    html: `<div class="test-pin-marker">${renderToStaticMarkup(<FaFlask size={14} color="#ffffff" />)}</div>`,
    className: 'custom-test-pin-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
});

// Repartidor en vivo: moto blanca sobre círculo verde con pulso
const riderIcon = L.divIcon({
    html: `<div class="rider-live-marker"><span class="rider-live-pulse"></span><div class="rider-live-dot">${renderToStaticMarkup(<FaMotorcycle size={16} color="#ffffff" />)}</div></div>`,
    className: 'custom-rider-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
});

const BAKERY_LOCATION = { lat: -39.0189446, lng: -68.4297867 };

// Los pines de prueba se guardan solo en este dispositivo: nunca se crean pedidos reales.
const TEST_PINS_KEY = 'map_test_pins';
type TestPin = { id: string; nombre: string; mapsLink: string; precio: number; indicaciones: string; lat: number; lng: number };
const loadTestPins = (): TestPin[] => {
    try { return JSON.parse(localStorage.getItem(TEST_PINS_KEY) || '[]'); } catch { return []; }
};
const saveTestPins = (pins: TestPin[]) => {
    try { localStorage.setItem(TEST_PINS_KEY, JSON.stringify(pins)); } catch { /* sin almacenamiento: quedan en memoria */ }
};
type PinDraft = { nombre: string; mapsLink: string; precio: string; indicaciones: string; lat: number | null; lng: number | null };
const emptyDraft = (lat: number | null = null, lng: number | null = null): PinDraft => ({ nombre: '', mapsLink: '', precio: '', indicaciones: '', lat, lng });

// En modo prueba, tocar el mapa abre el formulario en ese punto
const MapClickCatcher = ({ onPick }: { onPick: (lat: number, lng: number) => void }) => {
    useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
    return null;
};

interface GlobalDeliveriesMapModalProps {
    isOpen?: boolean;
    onClose?: () => void;
    orders: any[];
    inline?: boolean;
    /** Repartidores en camino con su ubicación en vivo */
    riders?: RiderPosition[];
    /** Si se pasa, la ruta sale desde acá (el repartidor) en vez del local */
    routeOrigin?: { lat: number; lng: number } | null;
}

const extractCoordinatesFromUrl = (url?: string) => {
    if (!url) return null;
    try {
        url = decodeURIComponent(url);
    } catch(e) {}
    const regexList = [
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,
        /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
        /[?&]query=(-?\d+\.\d+),(-?\d+\.\d+)/,
        /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/
    ];
    for (let regex of regexList) {
        const match = url.match(regex);
        if (match && match.length >= 3) {
            return {
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2])
            };
        }
    }
    return null;
};

// Subcomponente para ajustar los límites del mapa automáticamente
const MapBoundsFitter = ({ markers }: { markers: { lat: number, lng: number }[] }) => {
    const map = useMap();
    // Solo reacomodar cuando cambian las ubicaciones, no en cada actualización de pedidos
    const markersKey = markers.map(m => `${m.lat},${m.lng}`).join('|');

    useEffect(() => {
        if (markers.length === 1) {
            map.setView([markers[0].lat, markers[0].lng], 15);
        } else if (markers.length > 1) {
            const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [markersKey, map]);

    return null;
};

type LatLng = { lat: number; lng: number };
type RouteInfo = { path: [number, number][]; distance: number; duration: number; approx: boolean };

// Ruta por calles desde el local hasta el destino (OSRM, servicio público gratuito).
// Si no responde, se dibuja una línea recta punteada para no dejar el mapa sin ruta.
const useRoute = (stops: LatLng[], origin: LatLng | null = null): RouteInfo | null => {
    const [route, setRoute] = useState<RouteInfo | null>(null);
    // El origen se redondea (~50 m) para no pedir una ruta nueva con cada paso del repartidor
    const from = origin ? { lat: Math.round(origin.lat * 2000) / 2000, lng: Math.round(origin.lng * 2000) / 2000 } : BAKERY_LOCATION;
    const points = stops.length > 0 ? [from, ...stops] : [];
    const key = points.map(p => `${p.lat},${p.lng}`).join('>');

    useEffect(() => {
        if (points.length < 2) { setRoute(null); return; }
        let straightDistance = 0;
        for (let i = 1; i < points.length; i++) {
            straightDistance += L.latLng(points[i - 1].lat, points[i - 1].lng).distanceTo(L.latLng(points[i].lat, points[i].lng));
        }
        const straight: RouteInfo = {
            path: points.map(p => [p.lat, p.lng] as [number, number]),
            distance: straightDistance,
            duration: 0,
            approx: true,
        };
        const ctrl = new AbortController();
        // OSRM acepta varias paradas en un solo pedido: origen;parada1;parada2;...
        const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
        fetch(url, { signal: ctrl.signal })
            .then(r => r.json())
            .then(data => {
                const r = data?.routes?.[0];
                if (!r) { setRoute(straight); return; }
                setRoute({
                    path: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
                    distance: r.distance,
                    duration: r.duration,
                    approx: false,
                });
            })
            .catch(e => { if (e?.name !== 'AbortError') setRoute(straight); });
        return () => ctrl.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return route;
};

type OrderDate = { toMillis?: () => number; seconds?: number } | string | number | Date | null | undefined;
const orderTime = (o: { id?: string; date?: OrderDate }): number => {
    const d = o.date;
    if (d && typeof d === 'object' && !(d instanceof Date)) {
        if (d.toMillis) return d.toMillis();
        if (d.seconds) return d.seconds * 1000;
    } else if (d) {
        const t = new Date(d).getTime();
        if (!Number.isNaN(t)) return t;
    }
    // Pines de prueba: el id lleva la hora de creación
    const m = /^test-(\d+)$/.exec(o.id || '');
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

/**
 * Orden de reparto: primero el pedido elegido (o el más viejo), después siempre
 * el pedido más cercano a la parada anterior.
 */
const planStops = <T extends { id: string; effectiveLocation?: LatLng | null }>(orders: T[], firstId: string | null): T[] => {
    if (orders.length === 0) return [];
    const byAge = [...orders].sort((a, b) => orderTime(a) - orderTime(b));
    const first = byAge.find(o => o.id === firstId) || byAge[0];
    const plan = [first];
    const rest = byAge.filter(o => o.id !== first.id);
    while (rest.length) {
        const last = plan[plan.length - 1].effectiveLocation!;
        let best = 0;
        let bestD = Infinity;
        rest.forEach((o, i) => {
            const d = L.latLng(last.lat, last.lng).distanceTo(L.latLng(o.effectiveLocation!.lat, o.effectiveLocation!.lng));
            if (d < bestD) { bestD = d; best = i; }
        });
        plan.push(rest.splice(best, 1)[0]);
    }
    return plan;
};

/** La última entrega sirve como punto de partida solo si fue hace poco (si no, se sale del local). */
const LAST_DELIVERY_MAX_AGE_MS = 3 * 60 * 60_000;

/** Pedidos pasados a "Enviado" con hasta 5 minutos de diferencia (desde el primero) son la misma tanda. */
const BATCH_WINDOW_MS = 5 * 60_000;

/**
 * Agrupa por la hora de "Enviado" (sentAt): cada tanda arranca con el primer pedido enviado y
 * suma los que se enviaron hasta 5 minutos después. Devuelve el número de tanda de cada pedido.
 */
const groupBatchesBySentAt = (orders: { id: string; sentAt?: OrderDate }[]): Map<string, number> => {
    const withTime = orders
        .map(o => ({ id: o.id, at: orderTime({ date: o.sentAt }) }))
        .filter(o => o.at !== Number.MAX_SAFE_INTEGER)
        .sort((a, b) => a.at - b.at);
    const batchOf = new Map<string, number>();
    let batch = -1;
    let start = -Infinity;
    for (const o of withTime) {
        if (o.at - start > BATCH_WINDOW_MS) { batch++; start = o.at; }
        batchOf.set(o.id, batch);
    }
    return batchOf;
};

// Marcador del punto de la última entrega
const lastDeliveryIcon = L.divIcon({
    html: `<div class="last-delivery-marker">✓</div>`,
    className: 'custom-last-delivery-icon',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
});

const formatDistance = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;

export default function GlobalDeliveriesMapModal({ isOpen = true, onClose = () => { }, orders, inline = false, riders = [], routeOrigin = null }: GlobalDeliveriesMapModalProps) {
    // Modo prueba: solo admins (no repartidores) pueden poner pines de prueba
    const { isAdmin, isSuperAdmin, adminPermissions } = useCart();
    const canTest = isSuperAdmin || (isAdmin && adminPermissions?.is_rider !== true);
    const [testMode, setTestMode] = useState(false);
    const [testPins, setTestPins] = useState<TestPin[]>(loadTestPins);
    const [draft, setDraft] = useState<PinDraft | null>(null);
    const [draftError, setDraftError] = useState('');

    const updatePins = (pins: TestPin[]) => { setTestPins(pins); saveTestPins(pins); };

    const saveDraft = () => {
        if (!draft) return;
        // Si el link de Maps trae coordenadas, el pin va ahí; si no, donde se tocó el mapa
        const fromLink = extractCoordinatesFromUrl(draft.mapsLink.trim());
        const lat = fromLink?.lat ?? draft.lat;
        const lng = fromLink?.lng ?? draft.lng;
        if (lat == null || lng == null) {
            setDraftError('Tocá el mapa o pegá un link de Maps con coordenadas.');
            return;
        }
        const pin: TestPin = {
            id: `test-${Date.now()}`,
            nombre: draft.nombre.trim() || `Prueba ${testPins.length + 1}`,
            mapsLink: draft.mapsLink.trim(),
            precio: Number(draft.precio.replace(',', '.')) || 0,
            indicaciones: draft.indicaciones.trim(),
            lat, lng,
        };
        updatePins([...testPins, pin]);
        setDraft(null);
        setDraftError('');
    };

    // Los pines de prueba se suman como pedidos solo mientras el modo prueba está activo
    const testOrders = canTest && testMode ? testPins.map(p => ({
        id: p.id,
        isTestPin: true,
        status: 'enviado',
        total: p.precio,
        cliente: { nombre: p.nombre, direccion: 'Pin de prueba', mapsLink: p.mapsLink, indicaciones: p.indicaciones, location: { lat: p.lat, lng: p.lng } },
    })) : [];

    // Ubicaciones fijadas en la sección Clientes (por teléfono + dirección)
    const customerDocs = useCustomerDocs();

    // Obtener ubicación efectiva: la del pedido, la de su link de Maps o, si no tiene,
    // la fijada para ese cliente en esa MISMA dirección (otra dirección no se ubica).
    const validOrders = [...orders, ...testOrders].map(o => {
        let loc = o.cliente?.location;
        if (!loc && o.cliente?.mapsLink) {
            loc = extractCoordinatesFromUrl(o.cliente.mapsLink);
        }
        let fromCustomerPin = false;
        if (!loc) {
            const pin = pinForOrder(customerDocs, o.cliente);
            if (pin) { loc = { lat: pin.lat, lng: pin.lng }; fromCustomerPin = true; }
        }
        return { ...o, effectiveLocation: loc, fromCustomerPin };
    }).filter(o =>
        o.effectiveLocation &&
        o.status !== 'cancelado' &&
        o.status !== 'entregado'
    );

    // Tandas: lo que está "enviado" es la tanda en camino. Lo pendiente o en preparación es
    // la próxima tanda: se ve en el mapa pero no entra en la ruta hasta que pase a "enviado".
    // Sin nada en camino, la ruta muestra la próxima tanda saliendo del local.
    // Varias tandas en "Enviado": se agrupan por la hora en que pasaron a Enviado (5 min).
    // La tanda actual es la más vieja que todavía tiene pedidos en camino; las demás
    // salen en la próxima vuelta. Se incluyen las entregadas para saber de qué tanda es cada entrega.
    const batchOf = groupBatchesBySentAt(
        orders.filter(o => o.status === 'enviado' || o.status === 'entregado')
            .filter(o => o.status === 'enviado' || Date.now() - orderTime({ date: o.sentAt }) < 12 * 60 * 60_000)
    );
    const onTheWay = validOrders.filter(o => o.status === 'enviado');
    // Pedidos enviados antes de este cambio no tienen hora de salida: van en la tanda actual
    const currentBatchNo = onTheWay
        .map(o => batchOf.get(o.id))
        .filter((n): n is number => n !== undefined)
        .sort((a, b) => a - b)[0];
    const currentBatch = onTheWay.filter(o => !batchOf.has(o.id) || batchOf.get(o.id) === currentBatchNo || o.isTestPin);
    const hasBatchOnTheWay = currentBatch.length > 0;
    const routeOrders = hasBatchOnTheWay ? currentBatch : validOrders;
    const nextBatchCount = hasBatchOnTheWay ? validOrders.length - currentBatch.length : 0;
    const inRoute = new Set(routeOrders.map(o => o.id));

    // Ruta con todas las paradas: arranca por el pedido más viejo (o el elegido con
    // "Ir primero acá") y sigue por el más cercano a cada parada anterior.
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const stops = planStops(routeOrders, selectedId);
    const routeOrder = stops[0] || null;
    const stopNumber = new Map(stops.map((o, i) => [o.id, i + 1]));

    // Origen de la ruta: GPS en vivo del repartidor; si no, el punto de la última entrega
    // DE ESTA MISMA TANDA; si todavía no entregó ninguno de esta tanda, el local.
    const lastDelivery = !hasBatchOnTheWay ? null : orders
        .filter(o => o.status === 'entregado' && typeof o.deliveredLocation?.lat === 'number' && typeof o.deliveredLocation?.lng === 'number')
        .filter(o => currentBatchNo !== undefined
            ? batchOf.get(o.id) === currentBatchNo
            // Tanda sin hora de salida (pedidos de antes de este cambio): últimas 3 horas
            : Date.now() - orderTime({ date: o.deliveredAt }) < LAST_DELIVERY_MAX_AGE_MS)
        .map(o => ({ at: orderTime({ date: o.deliveredAt }), loc: o.deliveredLocation as LatLng }))
        .filter(d => d.at !== Number.MAX_SAFE_INTEGER)
        .sort((a, b) => b.at - a.at)[0] || null;
    const origin = routeOrigin || lastDelivery?.loc || null;
    const originLabel = routeOrigin ? 'desde tu ubicación' : lastDelivery ? 'desde la última entrega' : 'desde el local';
    const route = useRoute(stops.map(o => o.effectiveLocation!), origin);

    const markersCoords = validOrders.map(o => o.effectiveLocation!);
    const allMarkersCoords = [BAKERY_LOCATION, ...markersCoords];

    // Centro por defecto (Senillosa) si no hay marcadores
    const defaultCenter: L.LatLngExpression = markersCoords.length > 0
        ? [markersCoords[0].lat, markersCoords[0].lng]
        : [BAKERY_LOCATION.lat, BAKERY_LOCATION.lng];

    if (!isOpen && !inline) return null;

    const mapContent = (
        <div className="global-map-body" style={inline ? {
            height: 'calc(100vh - 160px)',
            width: 'calc(100% + 30px)',
            margin: '0 -15px',
            borderRadius: '0',
            overflow: 'hidden',
            position: 'relative'
        } : {}}>
            {validOrders.length === 0 && (
                <div className="global-map-empty">
                    <FaMapMarkerAlt /> No hay pedidos activos con ubicación fijada.
                </div>
            )}
            {canTest && (
                <div className="map-test-toolbar">
                    <button
                        type="button"
                        className={`map-test-toggle${testMode ? ' is-on' : ''}`}
                        onClick={() => { setTestMode(!testMode); setDraft(null); }}
                    >
                        <FaFlask /> {testMode ? 'Salir de prueba' : 'Modo prueba'}
                    </button>
                    {testMode && (
                        <>
                            <button type="button" className="map-test-small" onClick={() => { setDraft(emptyDraft()); setDraftError(''); }}>
                                <FaPlus /> Por link
                            </button>
                            {testPins.length > 0 && (
                                <button type="button" className="map-test-small is-danger" onClick={() => { if (window.confirm('¿Borrar todos los pines de prueba?')) updatePins([]); }}>
                                    <FaTrash /> Borrar ({testPins.length})
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
            {canTest && testMode && !draft && (
                <div className="map-test-hint">Tocá el mapa para poner un pin de prueba</div>
            )}
            {draft && (
                <div className="map-test-form">
                    <h4><FaFlask color="#f97316" /> Pin de prueba</h4>
                    <input placeholder="Nombre" value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })} />
                    <input placeholder="Link de Google Maps (opcional)" value={draft.mapsLink} onChange={e => setDraft({ ...draft, mapsLink: e.target.value })} />
                    <input placeholder="Precio" inputMode="decimal" value={draft.precio} onChange={e => setDraft({ ...draft, precio: e.target.value })} />
                    <textarea placeholder="Indicaciones" rows={2} value={draft.indicaciones} onChange={e => setDraft({ ...draft, indicaciones: e.target.value })} />
                    <p className="map-test-form-note">
                        {draft.lat != null ? 'Ubicación: donde tocaste el mapa (o la del link, si tiene coordenadas).' : 'Pegá un link de Maps que tenga coordenadas.'}
                    </p>
                    {draftError && <p className="map-test-form-error">{draftError}</p>}
                    <div className="map-test-form-actions">
                        <button type="button" onClick={() => { setDraft(null); setDraftError(''); }}>Cancelar</button>
                        <button type="button" className="is-primary" onClick={saveDraft}>Guardar pin</button>
                    </div>
                </div>
            )}
            {routeOrder && route && (
                <div className="global-map-route-info">
                    <FaRoute color="#2563eb" />
                    <span>
                        {!hasBatchOnTheWay && <span className="global-map-route-next">Próxima tanda · </span>}
                        {stops.length > 1
                            ? <>Ruta de <strong>{stops.length} paradas</strong></>
                            : <>Ruta a <strong>{routeOrder.cliente?.nombre || `#${routeOrder.id.slice(-5)}`}</strong></>}
                        {' · '}{route.approx ? '≈ ' : ''}{formatDistance(route.distance)}
                        {!route.approx && route.duration > 0 && <> · {Math.max(1, Math.round(route.duration / 60))} min</>}
                        <span className="global-map-route-origin"> · {originLabel}</span>
                        {nextBatchCount > 0 && (
                            <span className="global-map-route-origin"> · +{nextBatchCount} para la próxima vuelta</span>
                        )}
                    </span>
                </div>
            )}
            <MapContainer
                center={defaultCenter}
                zoom={14}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {route && (
                    <>
                        {/* Borde blanco + línea azul, estilo app de delivery */}
                        <Polyline positions={route.path} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />
                        <Polyline positions={route.path} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.95, dashArray: route.approx ? '8 10' : undefined }} />
                    </>
                )}

                {/* Marcador Fijo de la Panadería */}
                <Marker position={[BAKERY_LOCATION.lat, BAKERY_LOCATION.lng]} icon={bakeryIcon}>
                    <Popup>
                        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem', color: '#1e293b' }}>
                            El Faro Panadería
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#64748b' }}>
                            Punto de Partida
                        </div>
                    </Popup>
                </Marker>

                {!routeOrigin && lastDelivery && (
                    <Marker position={[lastDelivery.loc.lat, lastDelivery.loc.lng]} icon={lastDeliveryIcon}>
                        <Popup>
                            <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#1e293b' }}>
                                <strong>Última entrega</strong><br />La ruta sigue desde acá
                            </div>
                        </Popup>
                    </Marker>
                )}

                {riders.map(r => (
                    <Marker key={`rider-${r.email}`} position={[r.lat, r.lng]} icon={riderIcon} zIndexOffset={1000}>
                        <Popup>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#1e293b' }}>🛵 {r.name || r.email}</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Actualizado {Math.max(0, Math.round((Date.now() - r.updatedAt) / 60000)) === 0 ? 'recién' : `hace ${Math.round((Date.now() - r.updatedAt) / 60000)} min`}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}

                {validOrders.map(order => (
                    <Marker
                        key={order.id}
                        position={[order.effectiveLocation!.lat, order.effectiveLocation!.lng]}
                        {...(order.isTestPin ? { icon: testPinIcon } : {})}
                        opacity={inRoute.has(order.id) ? 1 : 0.45}
                    >
                        {stopNumber.has(order.id) && stops.length > 1 && (
                            <Tooltip permanent direction="top" offset={order.isTestPin ? [0, -14] : [-15, -28]} className="map-stop-number">
                                {stopNumber.get(order.id)}
                            </Tooltip>
                        )}
                        <Popup>
                            <div className="map-popup-custom">
                                <h4>
                                    {order.isTestPin ? <span className="map-test-badge">PRUEBA</span> : `#${order.id.slice(-5)} - `}
                                    {order.cliente.nombre}
                                </h4>
                                {!inRoute.has(order.id) && (
                                    <div className="map-next-batch-badge">
                                        {order.status === 'enviado'
                                            ? '⏳ Próxima vuelta · se envió más tarde que la tanda actual'
                                            : '⏳ Próxima tanda · sale cuando pase a "Enviado"'}
                                    </div>
                                )}
                                <p><FaMapMarkerAlt /> {order.cliente.direccion}</p>
                                {order.fromCustomerPin && (
                                    <p style={{ fontSize: '0.78rem', color: '#166534' }}>📍 Ubicación guardada del cliente</p>
                                )}
                                {order.cliente.telefono && (
                                    <p>
                                        <FaPhone />
                                        <a
                                            href={`https://wa.me/+549${order.cliente.telefono.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: 'bold' }}
                                        >
                                            {order.cliente.telefono}
                                        </a>
                                    </p>
                                )}
                                {order.cliente.indicaciones && (
                                    <div style={{ marginTop: '5px', padding: '6px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '0.85rem', color: '#475569', borderLeft: '3px solid #3b82f6' }}>
                                        <strong>Indicaciones:</strong> {order.cliente.indicaciones}
                                    </div>
                                )}
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold', color: '#64748b' }}>Total:</span>
                                    <span style={{ fontSize: '1.2rem', color: '#10b981', fontWeight: '800' }}>${Math.ceil(order.total)}</span>
                                </div>
                                {inRoute.has(order.id) && (
                                    <button
                                        type="button"
                                        className={`map-popup-route-btn${routeOrder?.id === order.id ? ' is-active' : ''}`}
                                        onClick={() => setSelectedId(order.id)}
                                        disabled={routeOrder?.id === order.id}
                                    >
                                        <FaRoute /> {routeOrder?.id === order.id ? 'Primera parada' : 'Ir primero acá'}
                                    </button>
                                )}
                                <a
                                    href={order.cliente.mapsLink && order.cliente.mapsLink.startsWith('http') ? order.cliente.mapsLink : (order.cliente.mapsLink ? `https://${order.cliente.mapsLink}` : mapsLinkForCoords(order.effectiveLocation!.lat, order.effectiveLocation!.lng))}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="map-popup-btn"
                                >
                                    Abrir en el mapa <FaExternalLinkAlt size={12} />
                                </a>
                                {order.isTestPin && (
                                    <button
                                        type="button"
                                        className="map-popup-delete-btn"
                                        onClick={() => updatePins(testPins.filter(p => p.id !== order.id))}
                                    >
                                        <FaTrash /> Eliminar pin
                                    </button>
                                )}
                            </div>
                        </Popup>
                    </Marker>
                ))}
                {canTest && testMode && (
                    <MapClickCatcher onPick={(lat, lng) => { setDraft(emptyDraft(lat, lng)); setDraftError(''); }} />
                )}
                <MapBoundsFitter markers={allMarkersCoords} />
            </MapContainer>
        </div>
    );

    if (inline) {
        return mapContent;
    }

    return createPortal(
        <div className="global-map-overlay" onClick={onClose}>
            <div className="global-map-modal" onClick={e => e.stopPropagation()}>
                <div className="global-map-header">
                    <h3><FaMotorcycle color="#3b82f6" /> Mapa Global de Deliveries Activos</h3>
                    <button className="global-map-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                {mapContent}
            </div>
        </div>,
        document.body
    );
}
