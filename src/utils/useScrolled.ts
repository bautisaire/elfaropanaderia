import { useEffect, useState } from "react";

/** true cuando la página bajó más de `threshold` px. Solo re-renderiza al cruzar el umbral. */
export function useScrolled(threshold = 40) {
    const [scrolled, setScrolled] = useState(() => typeof window !== "undefined" && window.scrollY > threshold);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > threshold);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [threshold]);

    return scrolled;
}
