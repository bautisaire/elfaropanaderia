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

    useEffect(() => {
        const fetchSlides = async () => {
            try {
                // Fetch slides, ideally ordered by creation time or a custom order field
                // For now, we'll just fetch them.
                const q = query(collection(db, "hero_slides"));
                const querySnapshot = await getDocs(q);
                const fetchedSlides = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as HeroSlide[];

                if (fetchedSlides.length > 0) {
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
        }, 15000); // 15 seconds

        return () => clearInterval(interval);
    }, [slides, currentIndex]);

    if (slides.length === 0) return null;

    return (
        <div className="hero-container">
            {slides.map((slide, index) => (
                <div
                    key={slide.id}
                    className={`hero-slide ${index === currentIndex ? "active" : ""}`}
                >
                    <img
                        src={slide.imageUrl}
                        alt={slide.title}
                        className={`hero-image ${slide.animation}`}
                        {...(index === 0 ? { fetchPriority: "high" } : {})}
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
                            onClick={() => setCurrentIndex(index)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
