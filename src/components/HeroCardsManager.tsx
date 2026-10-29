import { useEffect, useState, ChangeEvent } from 'react';
import { db, storage } from '../firebase/firebaseConfig';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../utils/imageUtils';
import { FaTrash, FaPlus, FaSync, FaCamera, FaEye, FaEyeSlash, FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import { HeroCard, HeroSlide, normalizeSlide } from '../utils/heroSlides';
import './HeroManager.css';

export default function HeroCardsManager() {
    const [cards, setCards] = useState<HeroCard[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [slides, setSlides] = useState<HeroSlide[]>([]);

    const fetchCards = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, "hero_cards"));
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }) as HeroCard);
            data.sort((a, b) => (a.order || 0) - (b.order || 0));
            setCards(data);
        } catch (error) {
            console.error(error);
            setMsg("Error cargando cartas.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCards();
        getDocs(collection(db, "hero_slides"))
            .then(snap => {
                const data = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }) as any)
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map(normalizeSlide);
                setSlides(data);
            })
            .catch(error => console.error(error));
    }, []);

    const slideLabel = (s: HeroSlide, i: number) => {
        const title = s.texts.find(t => t.kind === 'title' && t.text.trim())?.text || s.title;
        return title ? `${i + 1}. ${title}` : `Slide ${i + 1}`;
    };

    const toggleSlide = (card: HeroCard, slideId: string) => {
        const current = card.slideIds || [];
        const next = current.includes(slideId) ? current.filter(id => id !== slideId) : [...current, slideId];
        patchCard(card, { slideIds: next });
    };

    const handleAdd = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        try {
            const compressed = await compressImage(file, 1000, 0.85);
            const storageRef = ref(storage, `hero_cards/${Date.now()}_${file.name}.webp`);
            await uploadBytes(storageRef, compressed);
            const imageUrl = await getDownloadURL(storageRef);
            await addDoc(collection(db, "hero_cards"), { imageUrl, link: '', alt: '', active: true, order: cards.length });
            setMsg("Carta agregada");
            fetchCards();
        } catch (error) {
            console.error(error);
            setMsg("Error al subir la carta.");
        } finally {
            setUploading(false);
        }
    };

    const patchCard = async (card: HeroCard, patch: Partial<HeroCard>) => {
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...patch } : c));
        try {
            await updateDoc(doc(db, "hero_cards", card.id), patch);
        } catch (error) {
            console.error(error);
            setMsg("Error al guardar.");
        }
    };

    const handleDelete = async (card: HeroCard) => {
        if (!confirm("¿Eliminar esta carta? Esta acción no se puede deshacer.")) return;
        try {
            await deleteDoc(doc(db, "hero_cards", card.id));
            fetchCards();
        } catch (error) {
            console.error(error);
            setMsg("Error al eliminar");
        }
    };

    const move = async (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= cards.length) return;
        const next = [...cards];
        [next[index], next[target]] = [next[target], next[index]];
        const ordered = next.map((c, i) => ({ ...c, order: i }));
        setCards(ordered);
        try {
            await Promise.all(ordered.map(c => updateDoc(doc(db, "hero_cards", c.id), { order: c.order })));
        } catch (error) {
            console.error(error);
            setMsg("Error al guardar el orden.");
        }
    };

    return (
        <div className="product-manager-container">
            <div className="pm-header">
                <div>
                    <h2>Cartas flotantes</h2>
                    <p>Imágenes que flotan sobre la portada (promos, packs, banners). Se deslizan de costado.</p>
                </div>
                <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {uploading ? <FaSync className="spin" /> : <FaPlus />}
                    {uploading ? "Subiendo..." : "Agregar carta"}
                    <input type="file" hidden accept="image/*" onChange={handleAdd} disabled={uploading} />
                </label>
            </div>

            {msg && <div className="pm-alert">{msg}</div>}

            {loading && cards.length === 0 ? (
                <p>Cargando cartas...</p>
            ) : (
                <div className="hero-grid-list">
                    {cards.map((card, index) => (
                        <div key={card.id} className="hero-admin-card">
                            <div className="hero-card-img" style={{ height: 220 }}>
                                <img src={card.imageUrl} alt="carta" style={{ objectFit: 'contain' }} />
                            </div>
                            <div className="hero-card-body">
                                <input
                                    defaultValue={card.link || ''}
                                    placeholder="Dirección al tocar (opcional): #Productos o https://..."
                                    onBlur={e => e.target.value !== (card.link || '') && patchCard(card, { link: e.target.value.trim() })}
                                />
                                {slides.length > 0 && (
                                    <div style={{ marginTop: 10 }}>
                                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                                            {card.slideIds?.length ? 'Se muestra en:' : 'Se muestra en todos los slides (elegí cuáles):'}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {slides.map((s, i) => {
                                                const on = !!card.slideIds?.includes(s.id);
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => toggleSlide(card, s.id)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: 999,
                                                            fontSize: 12,
                                                            cursor: 'pointer',
                                                            border: `1px solid ${on ? '#d63336' : '#d1d5db'}`,
                                                            background: on ? '#d63336' : '#fff',
                                                            color: on ? '#fff' : '#374151',
                                                        }}
                                                    >
                                                        {slideLabel(s, i)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="hero-card-actions">
                                <button onClick={() => move(index, -1)} className="btn-action" title="Mover antes" disabled={index === 0}><FaArrowLeft /></button>
                                <button onClick={() => move(index, 1)} className="btn-action" title="Mover después" disabled={index === cards.length - 1}><FaArrowRight /></button>
                                <button
                                    onClick={() => patchCard(card, { active: card.active === false })}
                                    className="btn-action"
                                    title={card.active === false ? "Mostrar" : "Ocultar"}
                                    style={{ color: card.active === false ? '#9ca3af' : '#10b981' }}
                                >
                                    {card.active === false ? <FaEyeSlash /> : <FaEye />}
                                </button>
                                <button onClick={() => handleDelete(card)} className="btn-action delete" title="Eliminar"><FaTrash /></button>
                            </div>
                        </div>
                    ))}
                    {cards.length === 0 && !loading && (
                        <div className="empty-state"><FaCamera /> No hay cartas. Agregá la primera con el botón de arriba.</div>
                    )}
                </div>
            )}
        </div>
    );
}
