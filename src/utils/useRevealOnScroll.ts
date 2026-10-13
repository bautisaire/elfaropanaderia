import { RefObject, useEffect } from "react";
import { isLowPowerDevice } from "./deviceCapability";

const SELECTOR = ".category-title, .products-slider > *";

/** Los títulos y cards de `container` aparecen (fade + subida) al entrar en pantalla. */
export function useRevealOnScroll(container: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const root = container.current;
        if (!root) return;
        if (isLowPowerDevice() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const io = new IntersectionObserver(
            entries => {
                entries.forEach(e => {
                    if (!e.isIntersecting) return;
                    e.target.classList.add("in-view");
                    io.unobserve(e.target);
                });
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
        );

        const seen = new WeakSet<Element>();
        const register = () => {
            root.querySelectorAll<HTMLElement>(SELECTOR).forEach(el => {
                if (seen.has(el)) return;
                seen.add(el);
                const idx = Array.prototype.indexOf.call(el.parentElement?.children ?? [], el);
                el.style.animationDelay = `${(idx % 4) * 70}ms`;
                el.classList.add("reveal");
                io.observe(el);
            });
        };

        register();
        const mo = new MutationObserver(register);
        mo.observe(root, { childList: true, subtree: true });

        return () => {
            mo.disconnect();
            io.disconnect();
        };
    }, [container]);
}
