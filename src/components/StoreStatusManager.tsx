import { useEffect, useState, FormEvent } from 'react';
import { db } from '../firebase/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './StoreStatusManager.css';

interface StoreSettings {
    isOpen: boolean;
    closedMessage: string;
}

export default function StoreStatusManager() {
    const [settings, setSettings] = useState<StoreSettings>({
        isOpen: true,
        closedMessage: "Nuestra tienda se encuentra cerrada en este momento. Abrimos de Lunes a Sábado de 8:00 a 22:00."
    });
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, "settings", "store");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setSettings(docSnap.data() as StoreSettings);
            } else {
                // If it doesn't exist, we'll create it on first save, keep default state
            }
        } catch (error) {
            console.error("Error fetching store settings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = () => {
        setSettings(prev => ({ ...prev, isOpen: !prev.isOpen }));
    };

    const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings(prev => ({ ...prev, closedMessage: e.target.value }));
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await setDoc(doc(db, "settings", "store"), settings);
            setMsg("Estado de tienda actualizado correctamente.");
            setTimeout(() => setMsg(null), 3000);
        } catch (error) {
            console.error("Error saving settings:", error);
            setMsg("Error al guardar configuración.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="store-status-manager">
            <h2>Estado de la Tienda</h2>

            {msg && <div className="msg-success">{msg}</div>}

            <div className="status-header">
                <div>Estado Actual:</div>
                <div className={`current-status ${settings.isOpen ? 'status-open' : 'status-closed'}`}>
                    {settings.isOpen ? 'ABIERTO' : 'CERRADO'}
                </div>
            </div>

            <form onSubmit={handleSave} className="status-form">
                <div className="toggle-container">
                    <label className="switch">
                        <input
                            type="checkbox"
                            checked={settings.isOpen}
                            onChange={handleToggle}
                        />
                        <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: 500 }}>
                        {settings.isOpen ? 'Tienda Habilitada' : 'Tienda Deshabilitada (No se reciben pedidos)'}
                    </span>
                </div>

                {!settings.isOpen && (
                    <div className="form-group">
                        <label>Mensaje de Cierre (visible para clientes)</label>
                        <input
                            type="text"
                            value={settings.closedMessage}
                            onChange={handleMessageChange}
                            placeholder="Ej: Cerramos por vacaciones hasta el..."
                        />
                    </div>
                )}

                <button type="submit" className="btn-save" disabled={loading}>
                    {loading ? "Guardando..." : "Guardar Cambios"}
                </button>
            </form>
        </div>
    );
}
