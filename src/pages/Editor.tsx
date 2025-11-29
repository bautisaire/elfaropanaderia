import React, { useEffect, useState } from "react";
import "./Editor.css";

interface Product {
  id: number;
  name: string;
  price: number;
  image?: string;
  images?: string[];
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

  // Cargar productos desde el backend al iniciar
  useEffect(() => {
    if (!logged) return;
    setLoading(true);
    fetch("http://localhost:3001/api/productos", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [logged]);

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

  const addProduct = async () => {
    const newId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;
    const newProd: Product = { id: newId, name: "Nuevo producto", price: 0, image: "", images: [] };
    await fetch("http://localhost:3001/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newProd),
    });
    reloadProducts();
  };

  const updateProduct = async (id: number, patch: Partial<Product>) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const updated = { ...prod, ...patch };
    await fetch(`http://localhost:3001/api/productos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    reloadProducts();
  };

  const removeProduct = async (id: number) => {
    if (!confirm("Eliminar producto?")) return;
    await fetch(`http://localhost:3001/api/productos/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    reloadProducts();
  };

  const reloadProducts = () => {
    setLoading(true);
    fetch("http://localhost:3001/api/productos")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
        setMessage("Cambios guardados");
        setTimeout(() => setMessage(null), 2000);
      })
      .catch(() => setLoading(false));
  };

  return (
    <div className="editor-page">
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
          <p className="hint">Usuario: <strong>misa</strong> / Pass: <strong>litux741</strong></p>
        </form>
      ) : (
        <div className="editor-panel">
          <header className="editor-header">
            <h2>Editor de Productos</h2>
            <div>
              <button onClick={addProduct} className="btn-secondary">Agregar producto</button>
              <button onClick={reloadProducts} className="btn-primary">Recargar</button>
              <button onClick={handleLogout} className="btn-plain">Salir</button>
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
                    <label>Id</label>
                    <input value={p.id} readOnly />
                  </div>

                  <div className="prod-row">
                    <label>Nombre</label>
                    <input value={p.name} onChange={e => updateProduct(p.id, { name: e.target.value })} />
                  </div>

                  <div className="prod-row">
                    <label>Precio</label>
                    <input type="number" value={p.price} onChange={e => updateProduct(p.id, { price: Number(e.target.value || 0) })} />
                  </div>

                  <div className="prod-row">
                    <label>Imagen principal (URL)</label>
                    <input value={p.image || ""} onChange={e => updateProduct(p.id, { image: e.target.value })} />
                  </div>

                  <div className="prod-row">
                    <label>Imágenes (separadas por coma)</label>
                    <input value={(p.images || []).join(",")} onChange={e => {
                      const arr = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                      updateProduct(p.id, { images: arr });
                    }} />
                  </div>

                  <div className="prod-actions">
                    <button onClick={() => removeProduct(p.id)} className="btn-danger">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}