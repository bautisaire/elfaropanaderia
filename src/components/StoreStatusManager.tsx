import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import "./StoreStatusManager.css";
import { FaStore, FaClock, FaCheckCircle, FaExclamationCircle } from "react-icons/fa";

export default function StoreStatusManager() {
    const [minPurchase, setMinPurchase] = useState<number>(0);
    const [shippingCost, setShippingCost] = useState<number>(0);
    const [isOpen, setIsOpen] = useState<boolean>(true);
    const [closeMessage, setCloseMessage] = useState<string>("Estamos cerrados. Abrimos de Lunes a Sábado de 8 a 22hs.");
    const [storeAddress, setStoreAddress] = useState<string>("");
    const [storeMapUrl, setStoreMapUrl] = useState<string>("");
    const [allowDelivery, setAllowDelivery] = useState<boolean>(true);
    const [allowPickup, setAllowPickup] = useState<boolean>(true);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [pickupDiscountPercentage, setPickupDiscountPercentage] = useState<number>(0);
    const [pickupDiscountText, setPickupDiscountText] = useState<string>("");

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docSnap = await getDoc(doc(db, "config", "store_settings"));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setMinPurchase(data.minPurchase || 0);
                    setShippingCost(data.shippingCost || 0);
                    setIsOpen(data.isOpen !== undefined ? data.isOpen : true);
                    setCloseMessage(data.closeMessage || "");
                    setStoreAddress(data.storeAddress || "");
                    setStoreMapUrl(data.storeMapUrl || "");
                    setAllowDelivery(data.allowDelivery !== undefined ? data.allowDelivery : true);
                    setAllowPickup(data.allowPickup !== undefined ? data.allowPickup : true);
                    setPickupDiscountPercentage(data.pickupDiscountPercentage || 0);
                    setPickupDiscountText(data.pickupDiscountText || "");
                }
            } catch (error) {
                console.error("Error loading settings:", error);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setLoading(true);
        try {
            await setDoc(doc(db, "config", "store_settings"), {
                minPurchase: Number(minPurchase),
                shippingCost: Number(shippingCost),
                isOpen: isOpen,
                closeMessage: closeMessage,
                storeAddress: storeAddress,
                storeMapUrl: storeMapUrl,
                allowDelivery: allowDelivery,
                allowPickup: allowPickup,
                pickupDiscountPercentage: Number(pickupDiscountPercentage),
                pickupDiscountText: pickupDiscountText
            }, { merge: true });
            setMessage("🎉 Configuración guardada correctamente");
            setTimeout(() => setMessage(""), 3000);
        } catch (error) {
            console.error("Error saving settings:", error);
            setMessage("Error al guardar la configuración");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="store-status-container">
            <div className="status-header">
                <h2><FaStore /> Estado de la Tienda</h2>
                <p>Gestiona la disponibilidad y condiciones de tu tienda online.</p>
            </div>

            <div className="status-card open-close-card">
                <h3>Disponibilidad General</h3>
                <div className={`status-indicator ${isOpen ? 'open' : 'closed'}`}>
                    {isOpen ? <FaCheckCircle size={40} /> : <FaExclamationCircle size={40} />}
                    <div className="status-text">
                        <h4>{isOpen ? 'TIENDA ABIERTA' : 'TIENDA CERRADA'}</h4>
                        <p>{isOpen ? 'Tus clientes pueden realizar pedidos normalmente.' : 'Los clientes verán un aviso de cerrado y no podrán comprar.'}</p>
                    </div>
                </div>

                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={isOpen}
                        onChange={(e) => setIsOpen(e.target.checked)}
                    />
                    <span className="slider round"></span>
                </label>

                {!isOpen && (
                    <div className="close-message-input" style={{ marginTop: '20px', borderTop: '1px solid #fee2e2', paddingTop: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#b91c1c', fontWeight: '500' }}>
                            Mensaje para mostrar a los clientes:
                        </label>
                        <textarea
                            value={closeMessage}
                            onChange={(e) => setCloseMessage(e.target.value)}
                            placeholder="Ej: Cerramos por vacaciones hasta el lunes..."
                            style={{
                                width: '100%',
                                padding: '12px',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                minHeight: '80px',
                                fontFamily: 'inherit',
                                fontSize: '0.95rem',
                                color: '#7f1d1d',
                                backgroundColor: '#fef2f2'
                            }}
                        />
                        <small style={{ color: '#ef4444' }}>Este mensaje aparecerá en la ventana emergente que bloquea la tienda.</small>
                    </div>
                )}
            </div>

            <div className="status-card config-card">
                <h3><FaClock /> Configuraciones de Venta</h3>
                <div className="form-group">
                    <label>Monto Mínimo de Compra ($)</label>
                    <input
                        type="number"
                        value={minPurchase}
                        onChange={(e) => setMinPurchase(Number(e.target.value))}
                        placeholder="0"
                    />
                    <small>Los clientes no podrán finalizar la compra si el total es menor a este monto.</small>
                </div>
                <div className="form-group" style={{ marginTop: '15px' }}>
                    <label>Costo de Envío ($)</label>
                    <input
                        type="number"
                        value={shippingCost}
                        onChange={(e) => setShippingCost(Number(e.target.value))}
                        placeholder="0"
                    />
                    <small>Este monto se sumará automáticamente al total del pedido en el checkout para envíos a domicilio.</small>
                </div>
                <div className="form-group" style={{ marginTop: '15px' }}>
                    <label>Dirección del Local (Texto)</label>
                    <input
                        type="text"
                        value={storeAddress}
                        onChange={(e) => setStoreAddress(e.target.value)}
                        placeholder="Ej: Calle Principal 123"
                    />
                    <small>Se mostrará a los clientes cuando elijan 'Retirar en el local'.</small>
                </div>
                <div className="form-group" style={{ marginTop: '15px' }}>
                    <label>URL de Google Maps (Ubicación)</label>
                    <input
                        type="text"
                        value={storeMapUrl}
                        onChange={(e) => setStoreMapUrl(e.target.value)}
                        placeholder="Ej: https://maps.app.goo.gl/..."
                    />
                    <small>Enlace que se abrirá al hacer clic en el botón de ubicación en el checkout.</small>
                </div>
            </div>

            <div className="status-card config-card">
                <h3>Métodos de Entrega Disponibles</h3>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <div>
                        <strong style={{ display: 'block', color: '#1e293b' }}>Envío a Domicilio</strong>
                        <small style={{ color: '#64748b' }}>Permite a los clientes seleccionar entrega a domicilio.</small>
                    </div>
                    <label className="toggle-switch" style={{ margin: 0 }}>
                        <input
                            type="checkbox"
                            checked={allowDelivery}
                            onChange={(e) => setAllowDelivery(e.target.checked)}
                        />
                        <span className="slider round"></span>
                    </label>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                    <div>
                        <strong style={{ display: 'block', color: '#1e293b' }}>Retiro en Local</strong>
                        <small style={{ color: '#64748b' }}>Permite a los clientes pasar a retirar su pedido.</small>
                    </div>
                    <label className="toggle-switch" style={{ margin: 0 }}>
                        <input
                            type="checkbox"
                            checked={allowPickup}
                            onChange={(e) => setAllowPickup(e.target.checked)}
                        />
                        <span className="slider round"></span>
                    </label>
                </div>
                
                <div className="form-group" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                    <label>Descuento por Retiro en Local (%)</label>
                    <input
                        type="number"
                        value={pickupDiscountPercentage}
                        onChange={(e) => setPickupDiscountPercentage(Number(e.target.value))}
                        placeholder="Ej: 10"
                        min="0"
                        max="100"
                    />
                    <small>Porcentaje de descuento que se aplicará si eligen retirar en el local. Si es 0, no hay descuento.</small>
                </div>

                {pickupDiscountPercentage > 0 && (
                    <div className="form-group" style={{ marginTop: '15px' }}>
                        <label>Texto Promocional del Descuento</label>
                        <input
                            type="text"
                            value={pickupDiscountText}
                            onChange={(e) => setPickupDiscountText(e.target.value)}
                            placeholder="Ej: Promoción por apertura"
                        />
                        <small>Texto que aparecerá en el resumen de compra junto al descuento.</small>
                    </div>
                )}
            </div>

            <div className="status-footer">
                <button
                    className="save-btn"
                    onClick={handleSave}
                    disabled={loading}
                >
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
                {message && <p className={`message ${message.includes('Error') ? 'error' : 'success'}`}>{message}</p>}
            </div>
        </div>
    );
}
