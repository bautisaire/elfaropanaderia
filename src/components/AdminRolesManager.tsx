import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';
import { FaTrash, FaUserPlus, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useCart } from '../context/CartContext';

interface AdminRole {
  email: string;
  dashboard: boolean;
  orders: boolean;
  orders_can_cancel: boolean;
  orders_can_modify: boolean;
  orders_can_change_payment: boolean;
  orders_can_assign_deliveries: boolean;
  orders_can_edit_prices: boolean;
  pos_sales: boolean;
  store_editor: boolean;
  costs: boolean;
  bills?: boolean;
  stock: boolean;
  settings: boolean;
  employees: boolean;
  notes?: boolean;
  raffle: boolean;
  is_rider: boolean;
  auto_assign_orders?: boolean;
  primary_name?: string;
  secondary_profile?: { name?: string } & Partial<Record<string, boolean>>;
}

const PERMISSIONS_MAP = [
  { key: 'dashboard', label: 'Dashboard (Gráficos y Resumen)' },
  { key: 'orders', label: 'Ventas (Deliveries)' },
  { key: 'orders_can_cancel', label: '↳ Permitir cancelar pedidos' },
  { key: 'orders_can_modify', label: '↳ Permitir modificar pedidos' },
  { key: 'orders_can_change_payment', label: '↳ Permitir cambiar método de pago' },
  { key: 'orders_can_assign_deliveries', label: '↳ Permitir asignar deliveries a riders' },
  { key: 'orders_can_edit_prices', label: '↳ Permitir editar precios de productos (POS y Pedidos)' },
  { key: 'pos_sales', label: 'Ventas POS (Punto de Venta Local)' },
  { key: 'notes', label: 'Notas y Apuntes' },
  { key: 'store_editor', label: 'Editor de Tienda (Banners, etc.)' },
  { key: 'costs', label: 'Productos, Costos y Recetas' },
  { key: 'bills', label: 'Gastos y Tickets' },
  { key: 'stock', label: 'Gestión de Stock' },
  { key: 'raffle', label: 'Sorteos' },
  { key: 'settings', label: 'Configuración (Delivery, etc.)' },
  { key: 'is_rider', label: 'Rol: Repartidor (Rider)' },
  { key: 'auto_assign_orders', label: '↳ Auto-asignar pedidos delivery (si es Rider)' }
];

export default function AdminRolesManager() {
  const { isSuperAdmin } = useCart();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuperAdmin) return;
    
    const unsub = onSnapshot(collection(db, 'admin_roles'), (snap) => {
      const data: AdminRole[] = [];
      snap.forEach((d) => {
        data.push({ email: d.id, ...(d.data() as Omit<AdminRole, 'email'>) });
      });
      setRoles(data);
      setLoading(false);
    });

    return () => unsub();
  }, [isSuperAdmin]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) {
      alert("Ingrese un email válido.");
      return;
    }

    const emailKey = newEmail.trim().toLowerCase();
    
    if (emailKey === 'sairebautista@gmail.com') {
       alert("No puedes modificar los permisos del superadministrador.");
       return;
    }

    try {
      await setDoc(doc(db, 'admin_roles', emailKey), {
        dashboard: false,
        orders: false,
        orders_can_cancel: false,
        orders_can_modify: false,
        orders_can_change_payment: false,
        orders_can_assign_deliveries: false,
        orders_can_edit_prices: false,
        pos_sales: false,
        notes: false,
        store_editor: false,
        costs: false,
        bills: false,
        stock: false,
        settings: false,
        employees: false,
        raffle: false,
        is_rider: false,
        auto_assign_orders: false
      });
      setNewEmail('');
      alert(`Administrador ${emailKey} agregado. Configura sus permisos.`);
      setExpandedEmail(emailKey);
    } catch (err) {
      console.error(err);
      alert("Error al agregar administrador.");
    }
  };

  const handleDeleteAdmin = async (email: string) => {
    if (window.confirm(`¿Estás seguro de quitar acceso a ${email}?`)) {
      try {
        await deleteDoc(doc(db, 'admin_roles', email));
        if (expandedEmail === email) setExpandedEmail(null);
      } catch (err) {
        console.error(err);
        alert("Error al eliminar administrador.");
      }
    }
  };

  const handleTogglePermission = async (email: string, key: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'admin_roles', email), {
        [key]: !currentValue
      });
    } catch (err) {
      console.error('Error toggling permission:', err);
      alert('Error al actualizar permisos');
    }
  };

  const handleToggleSecondaryPermission = async (email: string, key: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'admin_roles', email), { [`secondary_profile.${key}`]: !currentValue });
    } catch (err) {
      console.error('Error toggling secondary permission:', err);
      alert('Error al actualizar permisos');
    }
  };

  const handleEnableSecondary = async (email: string) => {
    const secondary: Record<string, any> = { name: 'Empleado' };
    PERMISSIONS_MAP.forEach(p => { secondary[p.key] = false; });
    try {
      await updateDoc(doc(db, 'admin_roles', email), { secondary_profile: secondary });
    } catch (err) {
      console.error(err);
      alert('Error al habilitar el segundo usuario');
    }
  };

  const handleDisableSecondary = async (email: string) => {
    if (!window.confirm('¿Quitar el segundo usuario de este email?')) return;
    try {
      await updateDoc(doc(db, 'admin_roles', email), { secondary_profile: deleteField() });
    } catch (err) {
      console.error(err);
      alert('Error al quitar el segundo usuario');
    }
  };

  const handleRename = async (email: string, field: 'primary_name' | 'secondary_profile.name', value: string) => {
    const name = value.trim();
    if (!name) return;
    try {
      await updateDoc(doc(db, 'admin_roles', email), { [field]: name });
    } catch (err) {
      console.error(err);
      alert('Error al guardar el nombre');
    }
  };

  const renderToggles = (flags: Partial<Record<string, any>>, onToggle: (key: string, current: boolean) => void) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
      {PERMISSIONS_MAP.map(perm => {
        const isEnabled = flags[perm.key] === true;
        return (
          <div key={perm.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '0.9rem', color: '#334155' }}>{perm.label}</span>
            <div
              onClick={() => onToggle(perm.key, isEnabled)}
              style={{ width: '44px', height: '24px', background: isEnabled ? '#10b981' : '#cbd5e1', borderRadius: '12px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s' }}
            >
              <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: isEnabled ? '22px' : '2px', transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );

  const nameInputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', width: '220px' };

  if (!isSuperAdmin) return null;
  if (loading) return <div>Cargando roles...</div>;

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
        Control de Acceso (RBAC)
      </h3>
      <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
        Administra los correos electrónicos que tienen acceso al panel de control y configura las secciones que pueden visualizar. El superadministrador (sairebautista@gmail.com) tiene acceso total por defecto.
      </p>

      <form onSubmit={handleAddAdmin} style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <input 
          type="email"
          placeholder="nuevo.admin@gmail.com"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          style={{ flexGrow: 1, padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
        />
        <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          <FaUserPlus /> Agregar
        </button>
      </form>

      {loading ? (
        <p>Cargando administradores...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {roles.length === 0 && <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No hay otros administradores configurados.</p>}
          
          {roles.map(role => (
            <div key={role.email} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              
              {/* Header */}
              <div 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: expandedEmail === role.email ? '#f8fafc' : '#fff', cursor: 'pointer', transition: 'background 0.2s' }}
                onClick={() => setExpandedEmail(expandedEmail === role.email ? null : role.email)}
              >
                <div style={{ fontWeight: 'bold', color: '#334155' }}>
                  {role.email}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteAdmin(role.email); }}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' }}
                    title="Eliminar Administrador"
                  >
                    <FaTrash />
                  </button>
                  <span style={{ color: '#64748b' }}>
                    {expandedEmail === role.email ? <FaChevronUp /> : <FaChevronDown />}
                  </span>
                </div>
              </div>

              {/* Body (Permissions Toggles) */}
              {expandedEmail === role.email && (
                <div style={{ padding: '20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '0 0 15px 0' }}>
                    <h4 style={{ margin: 0, color: '#475569', fontSize: '0.95rem' }}>
                      {role.secondary_profile ? 'Usuario 1 — Permisos' : 'Permisos Habilitados'}
                    </h4>
                    {role.secondary_profile && (
                      <input
                        key={`pn-${role.email}-${role.primary_name || ''}`}
                        defaultValue={role.primary_name || 'Administrador'}
                        onBlur={e => handleRename(role.email, 'primary_name', e.target.value)}
                        style={nameInputStyle}
                        placeholder="Nombre del usuario 1"
                      />
                    )}
                  </div>
                  {renderToggles(role, (key, current) => handleTogglePermission(role.email, key, current))}

                  <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px dashed #cbd5e1' }}>
                    {!role.secondary_profile ? (
                      <button
                        onClick={() => handleEnableSecondary(role.email)}
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        + Habilitar segundo usuario en este email
                      </button>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <h4 style={{ margin: 0, color: '#475569', fontSize: '0.95rem' }}>Usuario 2 — Permisos</h4>
                          <input
                            key={`sn-${role.email}-${role.secondary_profile.name || ''}`}
                            defaultValue={role.secondary_profile.name || 'Empleado'}
                            onBlur={e => handleRename(role.email, 'secondary_profile.name', e.target.value)}
                            style={nameInputStyle}
                            placeholder="Nombre del usuario 2"
                          />
                          <button
                            onClick={() => handleDisableSecondary(role.email)}
                            style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}
                          >
                            Quitar segundo usuario
                          </button>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 15px 0' }}>
                          Desde el panel, "Cerrar sesión / Cambiar de usuario" permite alternar. Volver al Usuario 1 pide el código.
                        </p>
                        {renderToggles(role.secondary_profile, (key, current) => handleToggleSecondaryPermission(role.email, key, current))}
                      </>
                    )}
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}