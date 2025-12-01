import React, { useEffect, useState } from "react";
import "./Editor.css";
// 1. Agregamos auth y googleProvider a los imports
import { db, storage, auth, googleProvider } from "../firebase/firebaseConfig";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
// 2. Importamos funciones de Auth
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import OrdersManager from "../components/OrdersManager";
import { compressImage } from "../utils/imageUtils";

interface Product {
  id?: string;
  nombre: string;
  precio: number;
  categoria: string;
  descripcion: string;
  img: string;
  images?: string[];
  stock: boolean;
  variants?: {
    name: string;
    stock: boolean;
  }[];
}

// 🔴 CONFIGURACIÓN: Reemplaza esto con tu email real de Google
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

export default function Editor() {
  // 3. Reemplazamos el estado "logged" por "currentUser"
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true); // Loader inicial mientras verifica sesión

  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Cambiado a false inicial para no chocar con checkingAuth
  const [activeTab, setActiveTab] = useState<"products" | "orders">("products");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // 4. EFECTO: Escuchar cambios de sesión en Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) {
        setCurrentUser(user);
        // Si entra, cargamos productos automáticamente
      } else {
        setCurrentUser(null);
      }
      setCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Cargar productos solo si hay usuario logueado
  useEffect(() => {
    if (currentUser && activeTab === "products") {
      reloadProducts();
    }
  }, [currentUser, activeTab]);

  // 5. LOGIN CON GOOGLE
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user.email !== ADMIN_EMAIL) {
        await signOut(auth);
        alert("⛔ Acceso denegado: Este email no tiene permisos de administrador.");
      }
      // Si es correcto, el useEffect de arriba lo detectará
    } catch (error) {
      console.error("Error login:", error);
      setMessage("Error al iniciar sesión con Google");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setProducts([]); // Limpiar datos al salir
  };

  const reloadProducts = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "products"));
      const prods: Product[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          images: data.images || (data.img ? [data.img] : [])
        } as Product;
      });
      setProducts(prods);
      setLoading(false);
    } catch (error) {
      console.error("Error loading products:", error);
      setLoading(false);
      setMessage("Error al cargar productos");
    }
  };

  const addProduct = async () => {
    const newProd: Product = {
      nombre: "Nuevo Producto",
      precio: 0,
      categoria: "General",
      descripcion: "Descripción...",
      img: "https://via.placeholder.com/150",
      images: ["https://via.placeholder.com/150"],
      stock: true,
      variants: []
    };
    try {
      await addDoc(collection(db, "products"), newProd);
      reloadProducts();
      setMessage("Producto agregado");
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      console.error("Error adding product:", error);
      setMessage("Error al agregar");
    }
  };

  const updateProduct = async (id: string, patch: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    try {
      const docRef = doc(db, "products", id);
      await updateDoc(docRef, patch);
    } catch (error) {
      console.error("Error updating product:", error);
      setMessage("Error al actualizar");
      reloadProducts();
    }
  };

  const removeProduct = async (id: string) => {
    if (!confirm("Eliminar producto?")) return;
    try {
      await deleteDoc(doc(db, "products", id));
      reloadProducts();
      setMessage("Producto eliminado");
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      console.error("Error deleting product:", error);
      setMessage("Error al eliminar");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, productId: string, currentImages: string[]) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingId(productId);
    try {
      const newImageUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedBlob = await compressImage(file);
        const storageRef = ref(storage, `products/${productId}/${Date.now()}_${file.name.split('.')[0]}.webp`);
        await uploadBytes(storageRef, compressedBlob);
        const downloadURL = await getDownloadURL(storageRef);
        newImageUrls.push(downloadURL);
      }

      const updatedImages = [...currentImages, ...newImageUrls];
      await updateProduct(productId, {
        images: updatedImages,
        img: updatedImages[0]
      });

      setMessage("Imágenes actualizadas");
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      console.error("Error uploading image:", error);
      setMessage("Error al subir imagen");
    } finally {
      setUploadingId(null);
    }
  };

  const removeImage = async (productId: string, imageUrl: string, currentImages: string[]) => {
    if (!confirm("¿Eliminar esta imagen?")) return;
    const updatedImages = currentImages.filter(img => img !== imageUrl);
    if (updatedImages.length === 0) {
      updatedImages.push("https://via.placeholder.com/150");
    }
    await updateProduct(productId, {
      images: updatedImages,
      img: updatedImages[0]
    });
  };

  // 6. RENDERIZADO CON PROTECCIÓN DE RUTA
  if (checkingAuth) {
    return <div style={{ marginTop: '100px', textAlign: 'center', fontSize: '1.2rem' }}>Verificando credenciales...</div>;
  }

  return (
    <div className="editor-page" style={{ marginTop: '100px' }}>
      {!currentUser ? (
        // --- VISTA DE LOGIN (SOLO GOOGLE) ---
        <div className="editor-login" style={{ textAlign: 'center', maxWidth: '400px', margin: '0 auto', padding: '40px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '12px' }}>
          <h2 style={{ marginBottom: '10px' }}>Panel de Administración</h2>
          <p style={{ marginBottom: '30px', color: '#666' }}>Acceso exclusivo para personal autorizado</p>

          <button
            onClick={handleLogin}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px',
              fontSize: '1rem',
              backgroundColor: '#fff',
              color: '#3c4043',
              border: '1px solid #dadce0',
              boxShadow: 'none'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" /><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" /><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" /><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.272C4.672 5.141 6.656 3.58 9 3.58z" fill="#EA4335" /></svg>
            Entrar con Google
          </button>

          {message && <div className="editor-msg" style={{ marginTop: '20px', color: 'red' }}>{message}</div>}
        </div>
      ) : (
        // --- VISTA DEL EDITOR (Tu código original) ---
        <div className="editor-layout">
          <aside className="editor-sidebar">
            <div style={{ padding: '20px', borderBottom: '1px solid #eee', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Panel Admin</h3>
              <small style={{ color: '#888' }}>{currentUser.email}</small>
            </div>
            <nav>
              <button
                className={activeTab === "products" ? "active" : ""}
                onClick={() => setActiveTab("products")}
              >
                📦 Productos
              </button>
              <button
                className={activeTab === "orders" ? "active" : ""}
                onClick={() => setActiveTab("orders")}
              >
                📋 Pedidos
              </button>
              <button onClick={handleLogout} className="btn-logout">
                🚪 Salir
              </button>
            </nav>
          </aside>

          <main className="editor-content">
            {activeTab === "orders" ? (
              <OrdersManager />
            ) : (
              <div className="editor-panel">
                <header className="editor-header">
                  <h2>Editor de Productos</h2>
                  <div>
                    <button onClick={addProduct} className="btn-secondary">Agregar producto</button>
                    <button onClick={reloadProducts} className="btn-primary">Recargar</button>
                  </div>
                </header>

                {message && <div className="editor-msg">{message}</div>}
                {loading ? (
                  <div>Cargando productos...</div>
                ) : (
                  <div className="product-list">
                    {products.map((p) => (
                      <div className="product-edit-card" key={p.id}>
                        <div className="prod-row">
                          <label>ID: {p.id}</label>
                        </div>

                        <div className="prod-row">
                          <label>Nombre</label>
                          <input
                            value={p.nombre}
                            onChange={e => p.id && updateProduct(p.id, { nombre: e.target.value })}
                          />
                        </div>

                        <div className="prod-row">
                          <label>Precio</label>
                          <input
                            type="number"
                            value={p.precio}
                            onChange={e => p.id && updateProduct(p.id, { precio: Number(e.target.value || 0) })}
                          />
                        </div>

                        <div className="prod-row">
                          <label>Categoría</label>
                          <input
                            value={p.categoria}
                            onChange={e => p.id && updateProduct(p.id, { categoria: e.target.value })}
                          />
                        </div>

                        <div className="prod-row">
                          <label>Descripción</label>
                          <textarea
                            value={p.descripcion}
                            onChange={e => p.id && updateProduct(p.id, { descripcion: e.target.value })}
                          />
                        </div>

                        {/* SECCIÓN DE IMÁGENES MÚLTIPLES PRESERVADA */}
                        <div className="prod-row" style={{ alignItems: 'flex-start' }}>
                          <label>Imágenes</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                              {p.images?.map((img, idx) => (
                                <div key={idx} style={{ position: 'relative', width: '80px', height: '80px' }}>
                                  <img src={img} alt={`img-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                                  <button
                                    onClick={() => p.id && removeImage(p.id, img, p.images || [])}
                                    style={{
                                      position: 'absolute', top: '-5px', right: '-5px',
                                      background: 'red', color: 'white', border: 'none',
                                      borderRadius: '50%', width: '20px', height: '20px',
                                      cursor: 'pointer', fontSize: '12px', display: 'flex',
                                      alignItems: 'center', justifyContent: 'center'
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>

                            <label className="btn-secondary" style={{ width: 'auto', textAlign: 'center', cursor: 'pointer', fontSize: '0.9rem', display: 'inline-block' }}>
                              {uploadingId === p.id ? "⏳ Subiendo..." : "📷 Agregar Fotos"}
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e) => p.id && handleImageUpload(e, p.id, p.images || [])}
                                disabled={uploadingId === p.id}
                              />
                            </label>
                          </div>
                        </div>

                        <div className="prod-row" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                          <label style={{ width: 'auto' }}>En Stock:</label>
                          <input
                            type="checkbox"
                            checked={p.stock}
                            onChange={e => p.id && updateProduct(p.id, { stock: e.target.checked })}
                            style={{ width: 'auto' }}
                          />
                        </div>

                        {/* SECCIÓN DE VARIANTES */}
                        <div className="prod-row">
                          <label>Variantes (Opcional)</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {p.variants?.map((v, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                  placeholder="Nombre (ej. Vainilla)"
                                  value={v.name}
                                  onChange={(e) => {
                                    const newVariants = [...(p.variants || [])];
                                    newVariants[idx].name = e.target.value;
                                    p.id && updateProduct(p.id, { variants: newVariants });
                                  }}
                                  style={{ flex: 1 }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', width: 'auto' }}>
                                  <input
                                    type="checkbox"
                                    checked={v.stock}
                                    onChange={(e) => {
                                      const newVariants = [...(p.variants || [])];
                                      newVariants[idx].stock = e.target.checked;
                                      p.id && updateProduct(p.id, { variants: newVariants });
                                    }}
                                    style={{ width: 'auto' }}
                                  />
                                  Stock
                                </label>
                                <button
                                  className="btn-danger"
                                  style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                  onClick={() => {
                                    const newVariants = p.variants?.filter((_, i) => i !== idx);
                                    p.id && updateProduct(p.id, { variants: newVariants });
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button
                              className="btn-secondary"
                              style={{ width: 'fit-content', fontSize: '0.9rem', padding: '6px 12px' }}
                              onClick={() => {
                                const newVariants = [...(p.variants || []), { name: "", stock: true }];
                                p.id && updateProduct(p.id, { variants: newVariants });
                              }}
                            >
                              + Agregar Variante
                            </button>
                          </div>
                        </div>

                        <div className="prod-actions">
                          <button onClick={() => p.id && removeProduct(p.id)} className="btn-danger">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}