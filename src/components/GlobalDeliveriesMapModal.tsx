import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { FaTimes, FaMapMarkerAlt, FaPhone, FaExternalLinkAlt, FaMotorcycle } from 'react-icons/fa';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './GlobalDeliveriesMapModal.css';

// Fix for default Leaflet icon in React
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

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

const bakerySvg = `
<svg width="40" height="40" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.5"/>
    </filter>
  </defs>
  <g filter="url(#shadow)" fill="#eab308" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round">
    <path d="M 4 12 L 8 2 H 24 L 28 12 A 2 2 0 0 1 24 12 A 2 2 0 0 1 20 12 A 2 2 0 0 1 16 12 A 2 2 0 0 1 12 12 A 2 2 0 0 1 8 12 A 2 2 0 0 1 4 12 Z" />
    <path d="M 6 13 V 30 H 26 V 13 H 22 V 23 H 10 V 13 Z" />
  </g>
</svg>
`;

const bakeryIcon = L.divIcon({
    html: bakerySvg,
    className: 'custom-bakery-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
});

const BAKERY_LOCATION = { lat: -39.0189446, lng: -68.4297867 };

interface GlobalDeliveriesMapModalProps {
    isOpen?: boolean;
    onClose?: () => void;
    orders: any[];
    inline?: boolean;
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

    useEffect(() => {
        if (markers.length > 0) {
            const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [markers, map]);

    return null;
};

export default function GlobalDeliveriesMapModal({ isOpen = true, onClose = () => { }, orders, inline = false }: GlobalDeliveriesMapModalProps) {
    if (!isOpen && !inline) return null;

    // Obtener ubicación efectiva (de location o mapsLink) y filtrar
    const validOrders = orders.map(o => {
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

    const markersCoords = validOrders.map(o => o.effectiveLocation!);
    const allMarkersCoords = [BAKERY_LOCATION, ...markersCoords];

    // Centro por defecto (Senillosa) si no hay marcadores
    const defaultCenter: L.LatLngExpression = markersCoords.length > 0
        ? [markersCoords[0].lat, markersCoords[0].lng]
        : [BAKERY_LOCATION.lat, BAKERY_LOCATION.lng];

    const mapContent = (
        <div className="global-map-body" style={inline ? {
            height: 'calc(100vh - 160px)',
            width: 'calc(100% + 30px)',
            margin: '0 -15px',
            borderRadius: '0',
            overflow: 'hidden',
            position: 'relative'
        } : {}}>
            {validOrders.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <FaMapMarkerAlt size={40} color="#cbd5e1" style={{ marginBottom: '10px' }} />
                    <p>No hay pedidos activos con ubicación fijada.</p>
                </div>
            ) : (
                <MapContainer
                    center={defaultCenter}
                    zoom={14}
                    style={{ height: "100%", width: "100%" }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

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

                    {validOrders.map(order => (
                        <Marker
                            key={order.id}
                            position={[order.effectiveLocation!.lat, order.effectiveLocation!.lng]}
                        >
                            <Popup>
                                <div className="map-popup-custom">
                                    <h4>#{order.id.slice(-5)} - {order.cliente.nombre}</h4>
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
                                    <a
                                        href={order.cliente.mapsLink && order.cliente.mapsLink.startsWith('http') ? order.cliente.mapsLink : (order.cliente.mapsLink ? `https://${order.cliente.mapsLink}` : `https://www.google.com/maps/search/?api=1&query=${order.effectiveLocation!.lat},${order.effectiveLocation!.lng}`)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="map-popup-btn"
                                    >
                                        Abrir en Google Maps <FaExternalLinkAlt size={12} />
                                    </a>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                    <MapBoundsFitter markers={allMarkersCoords} />
                </MapContainer>
            )}
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
