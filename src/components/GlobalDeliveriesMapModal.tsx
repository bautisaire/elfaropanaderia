import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
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
const useRoute = (to: LatLng | null, origin: LatLng | null = null): RouteInfo | null => {
    const [route, setRoute] = useState<RouteInfo | null>(null);
    // El origen se redondea (~50 m) para no pedir una ruta nueva con cada paso del repartidor
    const from = origin ? { lat: Math.round(origin.lat * 2000) / 2000, lng: Math.round(origin.lng * 2000) / 2000 } : BAKERY_LOCATION;
    const key = to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : '';

    useEffect(() => {
        if (!to) { setRoute(null); return; }
        const straight: RouteInfo = {
            path: [[from.lat, from.lng], [to.lat, to.lng]],
            distance: L.latLng(from.lat, from.lng).distanceTo(L.latLng(to.lat, to.lng)),
            duration: 0,
            approx: true,
        };
        const ctrl = new AbortController();
        const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
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
        status: 'pendiente',
        total: p.precio,
        cliente: { nombre: p.nombre, direccion: 'Pin de prueba', mapsLink: p.mapsLink, indicaciones: p.indicaciones, location: { lat: p.lat, lng: p.lng } },
    })) : [];

    // Obtener ubicación efectiva (de location o mapsLink) y filtrar
    const validOrders = [...orders, ...testOrders].map(o => {
        let loc = o.cliente?.location;
        if (!loc && o.cliente?.mapsLink) {
            loc = extractCoordinatesFromUrl(o.cliente.mapsLink);
        }
        return { ...o, effectiveLocation: loc };
    }).filter(o =>
        o.effectiveLocation &&
        o.status !== 'cancelado' &&
        o.status !== 'entregado'
    );

    // Ruta: por defecto al primer pedido; "Marcar ruta" en otro pedido la cambia
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const routeOrder = validOrders.find(o => o.id === selectedId) || validOrders[0] || null;
    const route = useRoute(routeOrder ? routeOrder.effectiveLocation! : null, routeOrigin);

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
                        Ruta a <strong>{routeOrder.cliente?.nombre || `#${routeOrder.id.slice(-5)}`}</strong>
                        {' · '}{route.approx ? '≈ ' : ''}{formatDistance(route.distance)}
                        {!route.approx && route.duration > 0 && <> · {Math.max(1, Math.round(route.duration / 60))} min</>}
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
                    >
                        <Popup>
                            <div className="map-popup-custom">
                                <h4>
                                    {order.isTestPin ? <span className="map-test-badge">PRUEBA</span> : `#${order.id.slice(-5)} - `}
                                    {order.cliente.nombre}
                                </h4>
                                <p><FaMapMarkerAlt /> {order.cliente.direccion}</p>
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
                                <button
                                    type="button"
                                    className={`map-popup-route-btn${routeOrder?.id === order.id ? ' is-active' : ''}`}
                                    onClick={() => setSelectedId(order.id)}
                                    disabled={routeOrder?.id === order.id}
                                >
                                    <FaRoute /> {routeOrder?.id === order.id ? 'Ruta marcada' : 'Marcar ruta'}
                                </button>
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
