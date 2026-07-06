import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { FaTimes, FaSave } from 'react-icons/fa';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './MapLocationPickerModal.css';

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
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapLocationPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (location: { lat: number, lng: number }) => void;
    initialLocation?: { lat: number, lng: number };
}

// Component to handle map clicks
function LocationMarker({ position, setPosition }: { position: L.LatLng | null, setPosition: (pos: L.LatLng) => void }) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
        },
    });

    return position === null ? null : (
        <Marker position={position}></Marker>
    );
}

export default function MapLocationPickerModal({ isOpen, onClose, onSave, initialLocation }: MapLocationPickerModalProps) {
    // Default to Senillosa, Neuquen if no initial location
    const defaultCenter: L.LatLngExpression = initialLocation 
        ? [initialLocation.lat, initialLocation.lng] 
        : [-39.0142, -68.4239];
    
    const [position, setPosition] = useState<L.LatLng | null>(
        initialLocation ? new L.LatLng(initialLocation.lat, initialLocation.lng) : null
    );

    // Reset position when modal opens if needed
    useEffect(() => {
        if (isOpen) {
            setPosition(initialLocation ? new L.LatLng(initialLocation.lat, initialLocation.lng) : null);
        }
    }, [isOpen, initialLocation]);

    const handleSave = () => {
        if (position) {
            onSave({ lat: position.lat, lng: position.lng });
        }
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="map-modal-overlay" onClick={onClose}>
            <div className="map-modal" onClick={e => e.stopPropagation()}>
                <div className="map-modal-header">
                    <h3>📍 Fijar Ubicación Exacta</h3>
                    <button className="map-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                
                <div className="map-modal-body">
                    <p className="map-modal-instructions">
                        Haz clic en el mapa para colocar el puntero rojo en la ubicación exacta del domicilio.
                    </p>
                    
                    <div className="map-container-wrapper">
                        <MapContainer 
                            center={defaultCenter} 
                            zoom={15} 
                            scrollWheelZoom={true}
                            style={{ height: "100%", width: "100%" }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <LocationMarker position={position} setPosition={setPosition} />
                        </MapContainer>
                    </div>
                </div>
                
                <div className="map-modal-footer">
                    <button className="btn-cancel" onClick={onClose}>Cancelar</button>
                    <button 
                        className="btn-primary" 
                        onClick={handleSave}
                        disabled={!position}
                    >
                        <FaSave /> Guardar Ubicación
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
