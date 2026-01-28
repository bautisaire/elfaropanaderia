import { useState, useEffect } from "react";
import { FaBell, FaCheck, FaTimes } from "react-icons/fa";

export default function AdminSettings() {
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );

    useEffect(() => {
        const stored = localStorage.getItem('admin_order_alerts_enabled');
        setNotificationsEnabled(stored === 'true');
    }, []);

    const toggleNotifications = async () => {
        if (!notificationsEnabled) {
            // Enable
            if (typeof Notification === 'undefined') {
                alert("Este navegador no soporta notificaciones.");
                return;
            }
            try {
                const result = await Notification.requestPermission();
                setPermissionStatus(result);
                if (result === 'granted') {
                    setNotificationsEnabled(true);
                    localStorage.setItem('admin_order_alerts_enabled', 'true');
                    new Notification("Alertas Activadas", {
                        body: "Recibirás notificaciones cuando lleguen nuevos pedidos."
                    });
                } else {
                    alert("Debes dar permisos de notificación en el navegador.");
                }
            } catch (error) {
                console.error("Error requesting notification permission:", error);
            }
        } else {
            // Disable
            setNotificationsEnabled(false);
            localStorage.setItem('admin_order_alerts_enabled', 'false');
        }
    };

    return (
        <div className="admin-settings-container" style={{ padding: '20px', maxWidth: '800px' }}>
            <h2 style={{ marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Configuración</h2>

            <div className="setting-card" style={{
                background: 'white',
                padding: '24px',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div className="setting-info">
                    <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaBell style={{ color: '#f59e0b' }} />
                        Alertas de Nuevos Pedidos
                    </h3>
                    <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                        Recibe una notificación en el escritorio cada vez que ingrese un nuevo pedido, incluso si tienes la pestaña minimizada.
                    </p>
                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: permissionStatus === 'granted' ? '#10b981' : '#ef4444' }}>
                        Estado del permiso: {permissionStatus === 'granted' ? 'Permitido' : permissionStatus === 'denied' ? 'Bloqueado' : 'Sin preguntar'}
                    </div>
                </div>

                <button
                    onClick={toggleNotifications}
                    style={{
                        padding: '12px 24px',
                        borderRadius: '30px',
                        border: 'none',
                        background: notificationsEnabled ? '#fee2e2' : '#dcfce7',
                        color: notificationsEnabled ? '#ef4444' : '#16a34a',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s'
                    }}
                >
                    {notificationsEnabled ? (
                        <>
                            <FaTimes /> Desactivar
                        </>
                    ) : (
                        <>
                            <FaCheck /> Activar
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
