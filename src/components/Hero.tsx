import { useEffect, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import "./Hero.css";

interface HeroSlide {
    id: string;
    title: string;
    subtitle: string;
    imageUrl: string;
    showButton: boolean;
    buttonText?: string;
    buttonLink?: string; // URL or Anchor
    animation: "zoom-in" | "zoom-out";
    active?: boolean;
}

export default function Hero() {
    const [slides, setSlides] = useState<HeroSlide[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);

    // Swipe/Drag States
    const [touchStartX, setTouchStartX] = useState<number | null>(null);
    const [touchEndX, setTouchEndX] = useState<number | null>(null);

    // Initial animation trigger
    useEffect(() => {
        if (slides.length > 0) {
            // Wait slightly after slides are rendered so the CSS transition triggers
            const timer = setTimeout(() => setHasStarted(true), 100);
            return () => clearTimeout(timer);
        }
    }, [slides]);

    useEffect(() => {
        const fetchSlides = async () => {
            try {
                // Fetch slides
                const q = query(collection(db, "hero_slides"));
                const querySnapshot = await getDocs(q);
                const fetchedSlides = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })) as (HeroSlide & { order?: number })[];

                if (fetchedSlides.length > 0) {
                    // Sort by the new order field, defaulting to 0 if missing
                    fetchedSlides.sort((a, b) => (a.order || 0) - (b.order || 0));
                    setSlides(fetchedSlides.filter(s => s.active !== false));
                }
            } catch (error) {
                console.error("Error loading hero slides:", error);
            }
        };

        fetchSlides();
    }, []);

    useEffect(() => {
        if (slides.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % slides.length);
        }, 10000); // 10 seconds

        // Changing currentIndex clears the interval, so manually swiping resets the 15s timer!
        return () => clearInterval(interval);
    }, [slides.length, currentIndex]);

    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setTouchEndX(null); // Reset end touch
        if ('touches' in e) {
            setTouchStartX(e.touches[0].clientX);
        } else {
            setTouchStartX((e as React.MouseEvent).clientX);
        }
    };

    const onTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e) {
            setTouchEndX(e.touches[0].clientX);
        } else {
            if (touchStartX !== null) {
                setTouchEndX((e as React.MouseEvent).clientX);
            }
        }
    };

    const onTouchEnd = () => {
        if (!touchStartX || !touchEndX) return;
        const distance = touchStartX - touchEndX;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            setCurrentIndex(prev => (prev + 1) % slides.length);
        } else if (isRightSwipe) {
            setCurrentIndex(prev => (prev === 0 ? slides.length - 1 : prev - 1));
        }

        setTouchStartX(null);
        setTouchEndX(null);
    };

    if (slides.length === 0) return null;

    return (
        <div
            className="hero-container"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseDown={onTouchStart}
            onMouseMove={onTouchMove}
            onMouseUp={onTouchEnd}
            onMouseLeave={onTouchEnd}
            style={{ cursor: slides.length > 1 ? (touchStartX !== null ? 'grabbing' : 'grab') : 'default' }}
        >
            {slides.map((slide, index) => (
                <div
                    key={slide.id}
                    className={`hero-slide ${index === currentIndex ? "active" : ""} ${hasStarted ? "started" : ""}`}
                >
                    <img
                        src={slide.imageUrl}
                        alt={slide.title}
                        className={`hero-image ${slide.animation}`}
                        {...(index === 0 ? { fetchPriority: "high" } : {})}
                        draggable={false} // Prevent browser default image dragging
                    />
                    <div className="hero-content">
                        <h1 className="hero-title-text">{slide.title}</h1>
                        {slide.subtitle && <p className="hero-subtitle">{slide.subtitle}</p>}
                        {slide.showButton && (
                            slide.buttonLink ? (
                                <a
                                    href={slide.buttonLink}
                                    className="hero-button"
                                    target={slide.buttonLink.startsWith('http') ? "_blank" : "_self"}
                                    rel={slide.buttonLink.startsWith('http') ? "noopener noreferrer" : ""}
                                    style={{ textDecoration: 'none', display: 'inline-block' }}
                                    draggable={false}
                                >
                                    {slide.buttonText || "Ver Productos"}
                                </a>
                            ) : (
                                <button className="hero-button">
                                    {slide.buttonText || "Ver Productos"}
                                </button>
                            )
                        )}
                    </div>
                </div>
            ))}

            {/* Indicators */}
            {slides.length > 1 && (
                <div className="hero-indicators">
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            className={`indicator ${index === currentIndex ? "active" : ""}`}
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent drag from triggering
                                setCurrentIndex(index);
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
