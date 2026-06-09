import React, { useState } from 'react';
import { auth, googleProvider } from '../firebase/firebaseConfig';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithPopup,
} from 'firebase/auth';
import { FcGoogle } from 'react-icons/fc';
import '../pages/MyAccount.css';

interface AuthFormProps {
    onSuccess?: () => void;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
    const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(''); setMsg('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            if (onSuccess) onSuccess();
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(''); setMsg('');

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            setLoading(false);
            return;
        }

        try {
            await createUserWithEmailAndPassword(auth, email, password);
            if (onSuccess) onSuccess();
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
            if (onSuccess) onSuccess();
        } catch (err: any) {
            setError('Error al conectar con Google.');
        }
    };

    return (
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
                    <>
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
                        {mode === 'register' && (
                            <div className="auth-form-group" style={{ position: 'relative' }}>
                                <label style={{ color: error === 'Las contraseñas no coinciden' ? '#ef4444' : 'inherit' }}>
                                    {error === 'Las contraseñas no coinciden' ? 'Las contraseñas no coinciden' : 'Confirmar Contraseña'}
                                </label>
                                <input
                                    type="password"
                                    placeholder="Repite tu contraseña"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                    style={{ borderColor: error === 'Las contraseñas no coinciden' ? '#ef4444' : '' }}
                                />
                            </div>
                        )}
                    </>
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
                    <span className="auth-link-text">¿No tenés cuenta? <button type="button" className="auth-link-btn" onClick={() => { setMode('register'); setError(''); setConfirmPassword(''); }}>Creala aquí.</button></span>
                ) : mode === 'register' ? (
                    <span className="auth-link-text">¿Ya tenés cuenta? <button type="button" className="auth-link-btn" onClick={() => { setMode('login'); setError(''); }}>Iniciá sesión.</button></span>
                ) : (
                    <span className="auth-link-text">¿Recordaste tu contraseña? <button type="button" className="auth-link-btn" onClick={() => { setMode('login'); setError(''); }}>Iniciá sesión.</button></span>
                )}
            </div>

            <div className="auth-divider"><span>O ingresá con</span></div>

            <button className="auth-btn-google" onClick={handleGoogle} type="button">
                <FcGoogle size={20} /> <span style={{ marginLeft: '10px' }}>Google</span>
            </button>
        </div>
    );
}
