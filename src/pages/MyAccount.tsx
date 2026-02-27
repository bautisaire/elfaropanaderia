import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CartContext } from '../context/CartContext';
import { auth, googleProvider, db } from '../firebase/firebaseConfig';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithPopup,
    signOut,
    sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, documentId } from 'firebase/firestore';
import { FaUser, FaMapMarkerAlt, FaShoppingBag, FaHeart, FaCogs, FaSignOutAlt, FaTimes, FaCheckCircle, FaStar, FaBoxOpen, FaChevronDown } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';
import './MyAccount.css';

// Status mappings for orders matching 4th photo
const statusMap: Record<string, { label: string, color: string }> = {
    pending: { label: "Pendiente", color: "#f59e0b" },
    pendiente: { label: "Pendiente", color: "#f59e0b" },
    preparando: { label: "Preparando", color: "#3b82f6" },
    enviado: { label: "En Camino", color: "#8b5cf6" },
    entregado: { label: "Entregado", color: "#10b981" },
    cancelado: { label: "Cancelado", color: "#ef4444" },
    pending_payment: { label: "Verificando Pago", color: "#3b82f6" },
};

const steps = [
    { key: 'pendiente', label: 'Pendiente' },
    { key: 'preparando', label: 'Preparando' },
    { key: 'enviado', label: 'Enviado' },
    { key: 'entregado', label: 'Entregado' }
];

const getStepIndex = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'pending') return 0;
    return steps.findIndex(s => s.key === normalized);
};

export default function MyAccount() {
    const { user, isAdmin } = useContext(CartContext);
    const navigate = useNavigate();

    const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    const [activeTab, setActiveTab] = useState<'personal' | 'direcciones' | 'compras' | 'favoritos'>('personal');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(''); setMsg('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(''); setMsg('');
        try {
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            setError(err.message || 'Error al crear cuenta');
        } finally {
            setLoading(false);
        }
    };

    const handleForgot = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(''); setMsg('');
        if (!email) {
            setError("Ingresá tu email para restablecer la contraseña.");
            setLoading(false);
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            setMsg("Correo de recuperación enviado. Revisa tu bandeja de entrada.");
            setMode('login');
        } catch (err: any) {
            setError(err.message || 'Error al enviar correo');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err: any) {
            setError('Error al conectar con Google.');
        }
    };

    const handleLogout = () => {
        signOut(auth);
        navigate('/');
    };

    if (!user) {
        return (
            <div className="account-container login-wrapper">
                <div className="auth-box">
                    <h2 className="auth-title">
                        {mode === 'login' ? 'Iniciar Sesión' : mode === 'register' ? 'Crear Cuenta' : 'Recuperar Contraseña'}
                    </h2>

                    {error && <div className="auth-error">{error}</div>}
                    {msg && <div className="auth-msg">{msg}</div>}

                    <form onSubmit={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleForgot} className="auth-form">
                        <div className="auth-form-group">
                            <label>Email</label>
                            <input type="email" placeholder="Introduce tu email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>

                        {mode !== 'forgot' && (
                            <div className="auth-form-group" style={{ position: 'relative' }}>
                                <label>Contraseña</label>
                                <input type="password" placeholder="Tu contraseña" value={password} onChange={e => setPassword(e.target.value)} required />
                                {mode === 'login' && (
                                    <div style={{ textAlign: 'right', marginTop: '5px' }}>
                                        <button type="button" className="auth-link-inline-right" style={{ position: 'static' }} onClick={() => setMode('forgot')}>
                                            ¿Olvidaste tu contraseña?
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {mode === 'forgot' && (
                            <div className="auth-form-group" style={{ textAlign: 'right' }}>
                                <button type="button" className="auth-link-inline-right" style={{ position: 'static' }} onClick={() => setMode('forgot')}>
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>
                        )}

                        <button className="auth-btn-primary" type="submit" disabled={loading}>
                            {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Registrarse' : 'Enviar Correo'}
                        </button>
                    </form>

                    <div className="auth-links">
                        {mode === 'login' ? (
                            <span className="auth-link-text">¿No tenés cuenta? <button type="button" className="auth-link-btn" onClick={() => setMode('register')}>Creala aquí.</button></span>
                        ) : mode === 'register' ? (
                            <span className="auth-link-text">¿Ya tenés cuenta? <button type="button" className="auth-link-btn" onClick={() => setMode('login')}>Iniciá sesión.</button></span>
                        ) : (
                            <button type="button" className="auth-link-btn" onClick={() => setMode('login')} style={{ marginTop: '10px' }}>Volver a iniciar sesión</button>
                        )}
                    </div>


                    <div className="auth-divider"><span>O ingresá con</span></div>

                    <button className="auth-btn-google" onClick={handleGoogle} type="button">
                        <FcGoogle size={20} /> <span style={{ marginLeft: '10px' }}>Google</span>
                    </button>
                </div>
            </div>
        );
    }

    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Usuario');

    return (
        <div className="account-container dashboard-wrapper">
            <h1 className="dashboard-title">¡Hola, <span style={{ textTransform: 'capitalize' }}>{displayName}</span>!</h1>

            <div className="dashboard-content">
                <div className="dashboard-sidebar">
                    <button className={`dashboard-item ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
                        <span className="item-inner-wrapper">
                            <FaUser className="item-icon" />
                            <span>Datos Personales</span>
                        </span>
                    </button>
                    <button className={`dashboard-item ${activeTab === 'direcciones' ? 'active' : ''}`} onClick={() => setActiveTab('direcciones')}>
                        <span className="item-inner-wrapper">
                            <FaMapMarkerAlt className="item-icon" />
                            <span>Direcciones</span>
                        </span>
                    </button>
                    <button className={`dashboard-item ${activeTab === 'compras' ? 'active' : ''}`} onClick={() => setActiveTab('compras')}>
                        <span className="item-inner-wrapper">
                            <FaShoppingBag className="item-icon" />
                            <span>Compras</span>
                        </span>
                    </button>
                    <button className={`dashboard-item ${activeTab === 'favoritos' ? 'active' : ''}`} onClick={() => setActiveTab('favoritos')}>
                        <span className="item-inner-wrapper">
                            <FaHeart className="item-icon" />
                            <span>Favoritos</span>
                        </span>
                    </button>

                    {isAdmin && (
                        <Link to="/editor" className="dashboard-item admin-item">
                            <span className="item-inner-wrapper">
                                <FaCogs className="item-icon" />
                                <span>Panel de Control</span>
                            </span>
                        </Link>
                    )}

                    <div className="sidebar-divider"></div>

                    <button className="dashboard-item item-logout" onClick={handleLogout}>
                        <span className="item-inner-wrapper">
                            <FaSignOutAlt className="item-icon" />
                            <span>Cerrar sesión</span>
                        </span>
                    </button>
                </div>

                <div className="dashboard-main">
                    {activeTab === 'personal' && <PersonalData userId={user.uid} userEmail={user.email!} isGoogle={user.providerData.some((p: any) => p.providerId === 'google.com')} emailVerified={user.emailVerified} userObj={user} />}
                    {activeTab === 'direcciones' && <AddressManager userId={user.uid} />}
                    {activeTab === 'compras' && <OrdersTab />}
                    {activeTab === 'favoritos' && <FavoritesTab />}
                </div>
            </div>
        </div>
    );
}

// -------------------------
// Subcomponents
// -------------------------

function PersonalData({ userId, userEmail, isGoogle, emailVerified, userObj }: { userId: string, userEmail: string, isGoogle: boolean, emailVerified: boolean, userObj: any }) {
    const [phone, setPhone] = useState('');
    const [isEditingPhone, setIsEditingPhone] = useState(false);
    const [loading, setLoading] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);

    useEffect(() => {
        const fetchUserData = async () => {
            const docRef = doc(db, 'users', userId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                setPhone(snap.data().phone || '');
            }
        };
        fetchUserData();
    }, [userId]);

    const handleSavePhone = async () => {
        if (phone && phone.length < 10) {
            alert("El número de teléfono no es válido");
            return;
        }
        setLoading(true);
        try {
            const docRef = doc(db, 'users', userId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                await setDoc(docRef, { phone });
            } else {
                await updateDoc(docRef, { phone });
            }
            setIsEditingPhone(false);
        } catch (e) {
            console.error("Error al guardar teléfono", e);
        }
        setLoading(false);
    };

    const handleSendVerification = async () => {
        try {
            await sendEmailVerification(userObj);
            setVerificationSent(true);
        } catch (e: any) {
            alert(e.message || "Error al enviar verificación.");
        }
    };

    return (
        <div className="dashboard-section">
            <h2 className="section-title">Datos Personales</h2>

            <div className="data-card">
                <div className="data-row">
                    <div className="data-info">
                        <label>Email</label>
                        <p>{userEmail}</p>
                    </div>
                    {isGoogle || emailVerified ? (
                        <div className="verified-badge">
                            <FaCheckCircle /> Verificado
                        </div>
                    ) : (
                        <div className="action-wrapper">
                            {!verificationSent ? (
                                <button className="btn-verify" onClick={handleSendVerification}>Verificar</button>
                            ) : (
                                <span className="text-muted" style={{ fontSize: '0.9rem' }}>Correo enviado</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="divider" />

                <div className="data-row">
                    <div className="data-info">
                        <label>Celular</label>
                        {isEditingPhone ? (
                            <div className="phone-input-group" style={{ marginTop: '5px' }}>
                                <span className="phone-prefix">+54</span>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Cod. Área + Número"
                                    maxLength={11}
                                    className="phone-edit-input"
                                />
                            </div>
                        ) : (
                            <p>{phone ? `+54 ${phone}` : 'No especificado'}</p>
                        )}
                    </div>
                    <div className="action-wrapper">
                        {isEditingPhone ? (
                            <div className="edit-actions">
                                <button className="icon-btn close" onClick={() => setIsEditingPhone(false)}><FaTimes /></button>
                                <button className="btn-save btn-sm" onClick={handleSavePhone} disabled={loading}>Guardar</button>
                            </div>
                        ) : (
                            <button className="btn-edit-text" onClick={() => setIsEditingPhone(true)}>Editar</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AddressManager({ userId }: { userId: string }) {
    const [addresses, setAddresses] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
        alias: '', calle: '', numero: '', piso: '', depto: '', ciudad: 'Senillosa'
    });

    useEffect(() => {
        const fetchAddresses = async () => {
            const docRef = doc(db, 'users', userId);
            const snap = await getDoc(docRef);
            if (snap.exists() && snap.data().addresses) {
                setAddresses(snap.data().addresses);
            }
        };
        fetchAddresses();
    }, [userId]);

    const handleSaveAddress = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const newAddress = { ...form, id: Date.now().toString(), isMain: addresses.length === 0 };
        const updatedAddresses = [...addresses, newAddress];

        try {
            const docRef = doc(db, 'users', userId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                await setDoc(docRef, { addresses: updatedAddresses });
            } else {
                await updateDoc(docRef, { addresses: updatedAddresses });
            }
            setAddresses(updatedAddresses);
            setShowForm(false);
            setForm({ alias: '', calle: '', numero: '', piso: '', depto: '', ciudad: 'Senillosa' });
        } catch (e) {
            console.error("Error saving address", e);
        }
        setLoading(false);
    };

    const setMainAddress = async (id: string) => {
        const updated = addresses.map(a => ({ ...a, isMain: a.id === id }));
        setAddresses(updated);
        try {
            await updateDoc(doc(db, 'users', userId), { addresses: updated });
        } catch (e) {
            console.error(e);
        }
    };

    const deleteAddress = async (id: string) => {
        const updated = addresses.filter(a => a.id !== id);
        if (updated.length > 0 && addresses.find(a => a.id === id)?.isMain) {
            updated[0].isMain = true;
        }
        setAddresses(updated);
        try {
            await updateDoc(doc(db, 'users', userId), { addresses: updated });
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="dashboard-section">
            <h2 className="section-title">Mis Direcciones</h2>

            {!showForm ? (
                <>
                    {addresses.length === 0 ? (
                        <div className="placeholder-card">
                            <FaMapMarkerAlt size={40} color="#ddd" style={{ marginBottom: '10px' }} />
                            <p>No tienes direcciones guardadas.</p>
                            <button className="btn-primary-dashboard" style={{ marginTop: '15px' }} onClick={() => setShowForm(true)}>Agregar dirección</button>
                        </div>
                    ) : (
                        <div>
                            <div className="address-grid">
                                {addresses.map(addr => (
                                    <div key={addr.id} className={`address-card ${addr.isMain ? 'main-address' : ''}`}>
                                        <div className="address-header">
                                            <h4>{addr.alias || 'Dirección'}</h4>
                                            {addr.isMain ? <FaStar className="main-star tooltip-anchor" title="Principal" /> : (
                                                <button className="btn-set-main" onClick={() => setMainAddress(addr.id)} title="Establecer como principal"><FaStar /></button>
                                            )}
                                        </div>
                                        <p>{addr.calle} {addr.numero}</p>
                                        <p>{addr.piso ? `Piso: ${addr.piso}` : ''} {addr.depto ? `Depto: ${addr.depto}` : ''}</p>
                                        <p>{addr.ciudad}</p>

                                        <button className="btn-delete-addr" onClick={() => deleteAddress(addr.id)}>Eliminar</button>
                                    </div>
                                ))}
                            </div>
                            <button className="btn-primary-dashboard" style={{ marginTop: '20px' }} onClick={() => setShowForm(true)}>+ Añadir otra dirección</button>
                        </div>
                    )}
                </>
            ) : (
                <div className="address-form-wrapper">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3>Nueva Dirección</h3>
                        <button className="icon-btn close" onClick={() => setShowForm(false)}><FaTimes /></button>
                    </div>

                    <form className="dashboard-form" onSubmit={handleSaveAddress}>
                        <div className="form-group-full">
                            <label>Alias (ej. Casa, Trabajo)</label>
                            <input type="text" placeholder="Mi Casa" value={form.alias} onChange={e => setForm({ ...form, alias: e.target.value })} required />
                        </div>
                        <div className="form-row">
                            <div className="form-group-half" style={{ flex: 2 }}>
                                <label>Calle</label>
                                <input type="text" value={form.calle} onChange={e => setForm({ ...form, calle: e.target.value })} required />
                            </div>
                            <div className="form-group-half" style={{ flex: 1 }}>
                                <label>Número / Altura</label>
                                <input type="text" value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} required />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group-half">
                                <label>Piso (Opcional)</label>
                                <input type="text" value={form.piso} onChange={e => setForm({ ...form, piso: e.target.value })} />
                            </div>
                            <div className="form-group-half">
                                <label>Depto (Opcional)</label>
                                <input type="text" value={form.depto} onChange={e => setForm({ ...form, depto: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-group-full">
                            <label>Ciudad / Localidad</label>
                            <input type="text" value={form.ciudad} readOnly className="read-only-input" />
                        </div>
                        <button type="submit" className="btn-primary-dashboard" disabled={loading} style={{ width: '100%', marginTop: '10px' }}>{loading ? 'Guardando...' : 'Guardar'}</button>
                    </form>
                </div>
            )}
        </div>
    );
}

function FavoritesTab() {
    return (
        <div className="dashboard-section">
            <h2 className="section-title">Mis Favoritos</h2>
            <div className="placeholder-card empty-state-card">
                <FaHeart size={50} color="#ffdecc" style={{ marginBottom: '15px' }} />
                <h3>Aún no tienes favoritos</h3>
                <p>Navegá por la tienda y guarda tus productos preferidos.</p>
                <Link to="/" className="btn-primary-dashboard" style={{ marginTop: '15px', display: 'inline-block', textDecoration: 'none' }}>Ir a la tienda</Link>
            </div>
        </div>
    );
}

// -------------------------
// Compras / MyOrders Logic
// -------------------------
interface Order {
    id: string;
    items: any[];
    total: number;
    status: string;
    date: any;
    cliente?: any;
}

function OrdersTab() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedIds = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');

        if (storedIds.length === 0) {
            setOrders([]);
            setLoading(false);
            return;
        }

        const validIds = storedIds
            .map((item: any) => typeof item === 'object' ? (item.id || item.orderId) : item)
            .filter((id: any) => id);

        if (validIds.length === 0) {
            setLoading(false);
            return;
        }

        const chunkArray = (arr: string[], size: number) => {
            const chunks = [];
            for (let i = 0; i < arr.length; i += size) {
                chunks.push(arr.slice(i, i + size));
            }
            return chunks;
        };

        const chunks = chunkArray(validIds, 10);
        const unsubscribers: (() => void)[] = [];
        let chunksLoaded = 0;

        chunks.forEach(chunk => {
            const q = query(collection(db, "orders"), where(documentId(), "in", chunk));
            const unsub = onSnapshot(q, (snapshot) => {
                const chunkOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
                setOrders(prev => {
                    const existing = [...prev];
                    chunkOrders.forEach(newOrder => {
                        const idx = existing.findIndex(o => o.id === newOrder.id);
                        if (idx >= 0) existing[idx] = newOrder;
                        else existing.push(newOrder);
                    });
                    return existing.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
                });
                chunksLoaded++;
                if (chunksLoaded >= chunks.length) setLoading(false);
            }, () => {
                setLoading(false);
            });
            unsubscribers.push(unsub);
        });

        return () => unsubscribers.forEach(unsub => unsub());
    }, []);


    if (loading && orders.length === 0) {
        return (
            <div className="dashboard-section">
                <h2 className="section-title">Mis Compras</h2>
                <div style={{ textAlign: 'center', padding: '40px' }}>Cargando tus pedidos...</div>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="dashboard-section">
                <h2 className="section-title">Mis Compras</h2>
                <div className="placeholder-card empty-state-card">
                    <FaBoxOpen size={50} color="#ffdecc" style={{ marginBottom: '15px' }} />
                    <h3>Aún no has hecho compras</h3>
                    <p>Cuando realices un pedido, podrás hacerle seguimiento desde aquí.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-section">
            <h2 className="section-title">Mis Compras</h2>
            <div className="orders-timeline-view">
                {orders.map(order => (
                    <ComprasCard key={order.id} order={order} />
                ))}
            </div>
        </div>
    );
}

const ComprasCard = ({ order }: { order: Order }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const statusInfo = statusMap[order.status] || { label: order.status, color: '#999' };

    const renderTimeline = (currentStatus: string) => {
        if (currentStatus === 'cancelado') return null;
        const currentIndex = getStepIndex(currentStatus);

        return (
            <div className="timeline-container">
                <div className="timeline-line-bg"></div>
                {steps.map((step, index) => {
                    let statusClass = '';
                    if (index < currentIndex) statusClass = 'completed';
                    if (index === currentIndex) statusClass = 'active';

                    const stepInfo = statusMap[step.key] || { color: '#ccc' };
                    const isActiveOrCompleted = index <= currentIndex;
                    const circleStyle = isActiveOrCompleted
                        ? { borderColor: stepInfo.color }
                        : {};

                    return (
                        <div key={step.key} className={`timeline-step ${statusClass}`}>
                            <div className="timeline-circle" style={{ ...circleStyle }}>
                                {isActiveOrCompleted && index < currentIndex && <FaCheckCircle color={stepInfo.color} size={16} style={{ background: '#fff' }} />}
                            </div>
                            <div className="timeline-label">{step.label}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="compra-card" style={{ cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
            <div className={`compra-header ${isExpanded ? 'expanded' : ''}`} style={{ borderBottom: isExpanded ? '1px solid #f0f0f0' : 'none', paddingBottom: isExpanded ? '20px' : '0', marginBottom: isExpanded ? '25px' : '0' }}>
                <div className="compra-header-left">
                    <div className="compra-icon-wrapper" style={{ backgroundColor: '#e65c00' }}>
                        <FaBoxOpen color="#fff" />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, color: '#333' }}>Pedido #{/^\d+$/.test(order.id) ? order.id : order.id.slice(-6).toUpperCase()}</h4>
                        <span style={{ fontSize: '0.85rem', color: '#666' }}>
                            {order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) : "Fecha desconocida"}
                        </span>
                    </div>
                </div>
                <div className="compra-header-right" style={{ flexDirection: 'row', alignItems: 'center', gap: '15px' }}>
                    <span className="compra-status-badge" style={{ color: statusInfo.color, backgroundColor: `${statusInfo.color}15`, border: `1px solid ${statusInfo.color}30` }}>
                        {statusInfo.label}
                    </span>
                    <span className="compra-total-top">${Math.floor(order.total)}</span>
                    <span style={{ color: '#999', fontSize: '1.2rem', transition: 'transform 0.3s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                        <FaChevronDown />
                    </span>
                </div>
            </div>

            {isExpanded && (
                <div className="compra-details-expanded" onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                    {renderTimeline(order.status)}

                    <div className="compra-products-section">
                        <h5 className="compra-products-title">Productos</h5>
                        {order.items.map((item: any, idx: number) => (
                            <div key={idx} className="compra-product-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <img src={item.image || "https://via.placeholder.com/50"} alt={item.name} className="compra-product-img" />
                                    <div>
                                        <h6 style={{ margin: 0, fontSize: '0.95rem' }}>{item.name}</h6>
                                        <span style={{ fontSize: '0.85rem', color: '#666' }}>{item.variant ? item.variant : ''} Cant: {item.quantity}</span>
                                    </div>
                                </div>
                                <span className="compra-product-price">${Math.ceil(item.price * (item.quantity || 1))}</span>
                            </div>
                        ))}
                    </div>

                    <div className="compra-footer-info">
                        <div className="compra-info-col">
                            <span className="compra-info-label">Envío</span>
                            <span className="compra-info-value">{order.cliente?.direccion || 'A coordinar'}</span>
                        </div>
                        <div className="compra-info-col">
                            <span className="compra-info-label">Pago</span>
                            <span className="compra-info-value" style={{ textTransform: 'capitalize' }}>{order.cliente?.metodoPago || 'Transferencia'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
