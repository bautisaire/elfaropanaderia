import { useEffect, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { HeroCard, HeroSlide, normalizeSlide } from "../utils/heroSlides";
import "./Hero.css";

interface HeroProps {
    onRaffleClick?: () => void;
    activeRaffle?: any;
}

const isExternal = (link: string) => /^https?:\/\//i.test(link);

export default function Hero({ onRaffleClick, activeRaffle }: HeroProps) {
    const [slides, setSlides] = useState<HeroSlide[]>([]);
    const [cards, setCards] = useState<HeroCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);

    // Swipe/Drag States
    const [touchStartX, setTouchStartX] = useState<number | null>(null);
    const [touchEndX, setTouchEndX] = useState<number | null>(null);

    useEffect(() => {
        if (slides.length > 0) {
            const timer = setTimeout(() => setHasStarted(true), 100);
            return () => clearTimeout(timer);
        }
    }, [slides]);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const snap = await getDocs(query(collection(db, "hero_slides")));
                const fetched = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }) as any)
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .filter(s => s.active !== false)
                    .map(normalizeSlide);
                setSlides(fetched);
            } catch (error) {
                console.error("Error loading hero slides:", error);
            }
            try {
                const snap = await getDocs(query(collection(db, "hero_cards")));
                const fetched = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }) as HeroCard)
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .filter(c => c.active !== false && c.imageUrl);
                setCards(fetched);
            } catch (error) {
                console.error("Error loading hero cards:", error);
            }
        };
        fetchAll();
    }, []);

    const visible = slides.length > 0 || cards.length > 0;

    // El header / menú inferior se adaptan cuando hay portada con fondo.
    useEffect(() => {
        if (!visible) return;
        document.body.classList.add("has-cover-hero");
        return () => document.body.classList.remove("has-cover-hero");
    }, [visible]);

    useEffect(() => {
        if (slides.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % slides.length);
        }, 10000);
        return () => clearInterval(interval);
    }, [slides.length, currentIndex]);

    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setTouchEndX(null);
        setTouchStartX('touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX);
    };

    const onTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e) setTouchEndX(e.touches[0].clientX);
        else if (touchStartX !== null) setTouchEndX((e as React.MouseEvent).clientX);
    };

    const onTouchEnd = () => {
        if (!touchStartX || !touchEndX) { setTouchStartX(null); return; }
        const distance = touchStartX - touchEndX;
        if (distance > minSwipeDistance) setCurrentIndex(prev => (prev + 1) % slides.length);
        else if (distance < -minSwipeDistance) setCurrentIndex(prev => (prev === 0 ? slides.length - 1 : prev - 1));
        setTouchStartX(null);
        setTouchEndX(null);
    };

    if (!visible) return null;

    const swipeable = slides.length > 1;

    return (
        <section className={`hero-container ${slides.length === 0 ? "no-bg" : ""}`}>
            {/* Fondo (cubre textos y cartas) */}
            <div className="hero-bg">
                {slides.map((slide, index) => (
                    <div
                        key={slide.id}
                        className={`hero-bg-slide ${index === currentIndex ? "active" : ""} ${hasStarted ? "started" : ""}`}
                    >
                        {slide.imageUrl && (
                            <img
                                src={slide.imageUrl}
                                alt=""
                                className={`hero-image ${slide.animation}`}
                                {...(index === 0 ? { fetchPriority: "high" } : {})}
                                draggable={false}
                            />
                        )}
                        <div className="hero-overlay" style={{ background: `rgba(0,0,0,${slide.overlay / 100})` }} />
                    </div>
                ))}
            </div>

            {/* Textos y botones: todos los slides en la misma celda, la altura es la del más alto */}
            {slides.length > 0 && (
                <div
                    className="hero-slides"
                    onTouchStart={swipeable ? onTouchStart : undefined}
                    onTouchMove={swipeable ? onTouchMove : undefined}
                    onTouchEnd={swipeable ? onTouchEnd : undefined}
                    onMouseDown={swipeable ? onTouchStart : undefined}
                    onMouseMove={swipeable ? onTouchMove : undefined}
                    onMouseUp={swipeable ? onTouchEnd : undefined}
                    onMouseLeave={swipeable ? onTouchEnd : undefined}
                    style={{ cursor: swipeable ? (touchStartX !== null ? "grabbing" : "grab") : "default" }}
                >
                    {slides.map((slide, index) => (
                        <div
                            key={slide.id}
                            className={`hero-slide ${index === currentIndex ? "active" : ""} ${hasStarted ? "started" : ""}`}
                        >
                            <div className="hero-content">
                                {slide.texts.filter(t => t.text.trim()).map(t => (
                                    t.kind === "title" ? (
                                        <h1 key={t.id} className="hero-title-text" style={{ color: t.color }}>{t.text}</h1>
                                    ) : t.kind === "eyebrow" ? (
                                        <p key={t.id} className="hero-eyebrow" style={{ color: t.color }}>{t.text}</p>
                                    ) : (
                                        <p key={t.id} className="hero-subtitle" style={{ color: t.color }}>{t.text}</p>
                                    )
                                ))}

                                {slide.buttons.length > 0 && (
                                    <div className="hero-buttons">
                                        {slide.buttons.map(btn => {
                                            const style = { backgroundColor: btn.bgColor, color: btn.textColor };
                                            if (btn.isRaffle) {
                                                if (!activeRaffle || !onRaffleClick) return null;
                                                return (
                                                    <button key={btn.id} onClick={onRaffleClick} className="hero-button" style={style}>
                                                        {btn.text || "Ver Sorteo"}
                                                    </button>
                                                );
                                            }
                                            if (!btn.link) {
                                                return <button key={btn.id} className="hero-button" style={style}>{btn.text}</button>;
                                            }
                                            return (
                                                <a
                                                    key={btn.id}
                                                    href={btn.link}
                                                    className="hero-button"
                                                    style={style}
                                                    target={isExternal(btn.link) ? "_blank" : "_self"}
                                                    rel={isExternal(btn.link) ? "noopener noreferrer" : undefined}
                                                    draggable={false}
                                                >
                                                    {btn.text}
                                                </a>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Indicadores */}
            {slides.length > 1 && (
                <div className="hero-indicators">
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            aria-label={`Slide ${index + 1}`}
                            className={`indicator ${index === currentIndex ? "active" : ""}`}
                            onClick={() => setCurrentIndex(index)}
                        />
                    ))}
                </div>
            )}

            {/* Cartas flotantes */}
            {cards.length > 0 && (
                <div className="hero-cards">
                    <div className="hero-cards-track">
                        {cards.map((card, i) => {
                            const img = (
                                <img src={card.imageUrl} alt={card.alt || ""} draggable={false} loading="lazy" />
                            );
                            const style = { animationDelay: `${(i % 4) * 0.6}s` };
                            return card.link ? (
                                <a
                                    key={card.id}
                                    href={card.link}
                                    className="hero-card"
                                    style={style}
                                    target={isExternal(card.link) ? "_blank" : "_self"}
                                    rel={isExternal(card.link) ? "noopener noreferrer" : undefined}
                                    draggable={false}
                                >
                                    {img}
                                </a>
                            ) : (
                                <div key={card.id} className="hero-card" style={style}>{img}</div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
