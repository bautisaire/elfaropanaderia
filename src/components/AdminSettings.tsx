import { useState, useEffect } from "react";
import { FaBell, FaCheck, FaTimes, FaPrint, FaFlask } from "react-icons/fa";
import { auth } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { isSuperAdminEmail, isTestModeEnabled, setTestModeEnabled } from "../utils/testMode";

export default function AdminSettings() {
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
    const [testModeEnabled, setTestModeEnabledState] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );

    const isSuperAdmin = isSuperAdminEmail(userEmail);

    useEffect(() => {
        const stored = localStorage.getItem('admin_order_alerts_enabled');
        setNotificationsEnabled(stored === 'true');
        
        const storedAutoPrint = localStorage.getItem('admin_auto_print_enabled');
        setAutoPrintEnabled(storedAutoPrint === 'true');

        setTestModeEnabledState(isTestModeEnabled());

        const unsubAuth = onAuthStateChanged(auth, (user) => {
            setUserEmail(user?.email ?? null);
        });

        const onTestModeChange = () => setTestModeEnabledState(isTestModeEnabled());
        window.addEventListener('admin_test_mode_changed', onTestModeChange);

        return () => {
            unsubAuth();
            window.removeEventListener('admin_test_mode_changed', onTestModeChange);
        };
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

    const toggleAutoPrint = () => {
        const newValue = !autoPrintEnabled;
        setAutoPrintEnabled(newValue);
        localStorage.setItem('admin_auto_print_enabled', newValue.toString());
    };

    const toggleTestMode = () => {
        const newValue = !testModeEnabled;
        setTestModeEnabledState(newValue);
        setTestModeEnabled(newValue);
    };

    const settingCardStyle = {
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
    } as const;

    const toggleBtnStyle = (enabled: boolean) => ({
        padding: '12px 24px',
        borderRadius: '30px',
        border: 'none',
        background: enabled ? '#fee2e2' : '#dcfce7',
        color: enabled ? '#ef4444' : '#16a34a',
        fontWeight: 'bold',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s',
        flexShrink: 0,
    } as const);

    return (
        <div className="admin-settings-container" style={{ padding: '20px', maxWidth: '800px' }}>
            <h2 style={{ marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Configuración</h2>

            {isSuperAdmin && (
                <div className="setting-card" style={{
                    ...settingCardStyle,
                    border: testModeEnabled ? '2px solid #f59e0b' : '2px solid transparent',
                    background: testModeEnabled ? '#fffbeb' : 'white',
                }}>
                    <div className="setting-info">
                        <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FaFlask style={{ color: '#d97706' }} />
                            Modo Prueba
                        </h3>
                        <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                            Los pedidos que hagas desde este dispositivo no activarán sonido, notificaciones ni impresión automática de ticket. El resto del personal no se entera.
                        </p>
                        {testModeEnabled && (
                            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#b45309', fontWeight: 600 }}>
                                Modo prueba ACTIVO — los pedidos se marcan como prueba
                            </div>
                        )}
                    </div>

                    <button onClick={toggleTestMode} style={toggleBtnStyle(testModeEnabled)}>
                        {testModeEnabled ? (
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
            )}

            <div className="setting-card" style={settingCardStyle}>
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

                <button onClick={toggleNotifications} style={toggleBtnStyle(notificationsEnabled)}>
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

            <div className="setting-card" style={{ ...settingCardStyle, marginBottom: 0 }}>
                <div className="setting-info">
                    <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaPrint style={{ color: '#3b82f6' }} />
                        Impresión Automática (Ticketera)
                    </h3>
                    <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                        Abre automáticamente el diálogo de impresión con un ticket formateado (58mm/80mm) cada vez que llega un pedido nuevo.
                    </p>
                </div>

                <button onClick={toggleAutoPrint} style={toggleBtnStyle(autoPrintEnabled)}>
                    {autoPrintEnabled ? (
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
