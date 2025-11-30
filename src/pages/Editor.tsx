
import React, { useEffect, useState } from "react";
import "./Editor.css";
import { db } from "../firebase/firebaseConfig";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import OrdersManager from "../components/OrdersManager";

interface Product {
  id?: string;
  nombre: string;
  precio: number;
  categoria: string;
  descripcion: string;
  img: string;
  stock: boolean;
}

const AUTH_USER = "misa";
const AUTH_PASS = "litux741";

export default function Editor() {
  const [logged, setLogged] = useState<boolean>(() => {
    return sessionStorage.getItem("editor-auth") === "1";
  });
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"products" | "orders">("products");

  // Cargar productos desde Firebase
  useEffect(() => {
    if (!logged) return;
    if (activeTab === "products") {
      reloadProducts();
    }
  }, [logged, activeTab]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (user === AUTH_USER && pass === AUTH_PASS) {
      sessionStorage.setItem("editor-auth", "1");
      setLogged(true);
      setMessage(null);
    } else {
      setMessage("Credenciales incorrectas");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("editor-auth");
    setLogged(false);
    setUser("");
    setPass("");
  };

  const reloadProducts = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "products"));
      const prods: Product[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Product));
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
      stock: true
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
    // Optimistic update
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

    try {
      const docRef = doc(db, "products", id);
      await updateDoc(docRef, patch);
      // No need to reload full list if optimistic update worked, but good for sync
      // reloadProducts(); 
    } catch (error) {
      console.error("Error updating product:", error);
      setMessage("Error al actualizar");
      reloadProducts(); // Revert on error
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

  return (
    <div className="editor-page" style={{ marginTop: '100px' }}>
      {!logged ? (
        <form className="editor-login" onSubmit={handleLogin}>
          <h2>Editor (acceso restringido)</h2>
          <div className="form-row">
            <label>Usuario</label>
            <input value={user} onChange={e => setUser(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Contraseña</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary">Entrar</button>
          </div>
          {message && <div className="editor-msg">{message}</div>}
        </form>
      ) : (
        <div className="editor-layout">
          <aside className="editor-sidebar">
            <h3>Panel Admin</h3>
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

                        <div className="prod-row">
                          <label>Imagen (URL)</label>
                          <input
                            value={p.img}
                            onChange={e => p.id && updateProduct(p.id, { img: e.target.value })}
                          />
                          {p.img && <img src={p.img} alt="preview" style={{ height: '50px', objectFit: 'cover', marginTop: '5px' }} />}
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
