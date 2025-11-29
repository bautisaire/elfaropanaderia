// src/pages/Proximamente.tsx
import { useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, addDoc } from "firebase/firestore";

export default function Proximamente() {
    const [email, setEmail] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [cargando, setCargando] = useState(false);

    const unirseAlista = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        setCargando(true);
        try {
            await addDoc(collection(db, "lista_espera"), {
                email: email,
                fecha: new Date()
            });
            setMensaje("¡Gracias! Te avisaremos cuando salga la primera tanda 🥖");
            setEmail("");
        } catch (error) {
            console.error(error);
            setMensaje("Error al guardar. Intenta de nuevo.");
        }
        setCargando(false);
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🥐</div>
                <h1 style={styles.title}>Estamos Amasando...</h1>
                <p style={styles.subtitle}>
                    Nuestra web está en el horno. <br />
                    Déjanos tu correo para avisarte cuando esté lista.
                </p>

                {!mensaje ? (
                    <form onSubmit={unirseAlista} style={styles.form}>
                        <input
                            type="email"
                            placeholder="tu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={styles.input}
                            required
                        />
                        <button type="submit" style={styles.button} disabled={cargando}>
                            {cargando ? 'Guardando...' : 'Avísame'}
                        </button>
                    </form>
                ) : (
                    <div style={styles.success}>{mensaje}</div>
                )}
            </div>
        </div>
    );
}

// Estilos (puedes moverlos a un css si prefieres)
const styles: { [key: string]: React.CSSProperties } = {
    container: { height: '80vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fdfbf7', fontFamily: 'Arial, sans-serif', color: '#4a4a4a' },
    card: { textAlign: 'center', padding: '40px', maxWidth: '400px', backgroundColor: 'white', borderRadius: '15px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
    title: { fontSize: '2rem', marginBottom: '10px', color: '#d35400' },
    subtitle: { fontSize: '1.1rem', marginBottom: '30px', lineHeight: '1.5' },
    form: { display: 'flex', flexDirection: 'column', gap: '10px' },
    input: { padding: '12px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '1rem' },
    button: { padding: '12px', borderRadius: '5px', border: 'none', backgroundColor: '#d35400', color: 'white', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold' },
    success: { color: '#27ae60', fontWeight: 'bold', marginTop: '20px' }
};
