import { useEffect, useRef, useState } from "react";
import { useScrolled } from "../utils/useScrolled";
import "./CategoryNav.css";

interface CategoryNavProps {
    categories: string[]; // ya filtradas y ordenadas
}

export const categoryAnchorId = (category: string) => category.replace(/\s+/g, "-");

export default function CategoryNav({ categories }: CategoryNavProps) {
    const [active, setActive] = useState<string | null>(null);
    const scrolled = useScrolled(40);
    const trackRef = useRef<HTMLDivElement>(null);
    const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

    useEffect(() => {
        document.body.classList.add("has-category-nav");
        return () => document.body.classList.remove("has-category-nav");
    }, []);

    // Categoría "en pantalla": la última cuya sección ya llegó a la franja superior de la
    // pantalla (se anticipa: cuenta como actual cuando su título pasa el 40% del alto).
    useEffect(() => {
        if (categories.length === 0) return;
        const update = () => {
            const line = window.innerHeight * 0.4;
            let current = categories[0];
            for (const c of categories) {
                const el = document.getElementById(categoryAnchorId(c));
                if (el && el.getBoundingClientRect().top <= line) current = c;
            }
            setActive(current);
        };
        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [categories]);

    // Mantener el chip activo a la vista dentro del carrusel.
    useEffect(() => {
        if (!active || !trackRef.current) return;
        const chip = trackRef.current.querySelector<HTMLElement>(`[data-chip="${CSS.escape(active)}"]`);
        if (!chip) return;
        const track = trackRef.current;
        const target = chip.offsetLeft - (track.clientWidth - chip.offsetWidth) / 2;
        track.scrollTo({ left: target, behavior: "smooth" });
    }, [active]);

    const goTo = (category: string) => {
        if (drag.current.moved) return;
        document.getElementById(categoryAnchorId(category))?.scrollIntoView({ behavior: "smooth", block: "start" });
        setActive(category);
    };

    // Arrastrar con el mouse (en touch ya es scroll nativo).
    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType !== "mouse" || !trackRef.current) return;
        drag.current = { down: true, startX: e.clientX, startScroll: trackRef.current.scrollLeft, moved: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d.down || !trackRef.current) return;
        const dx = e.clientX - d.startX;
        if (Math.abs(dx) > 5) d.moved = true;
        trackRef.current.scrollLeft = d.startScroll - dx;
    };
    const endDrag = () => {
        drag.current.down = false;
        // el click posterior al arrastre se ignora; se resetea en el siguiente tick
        setTimeout(() => { drag.current.moved = false; }, 0);
    };

    if (categories.length === 0) return null;

    return (
        <div className={`category-nav ${scrolled ? "" : "at-top"}`}>
            <div
                className="category-nav-track"
                ref={trackRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerLeave={endDrag}
            >
                {categories.map(c => (
                    <button
                        key={c}
                        data-chip={c}
                        className={`category-nav-chip ${active === c ? "active" : ""}`}
                        onClick={() => goTo(c)}
                    >
                        {c}
                    </button>
                ))}
            </div>
        </div>
    );
}
