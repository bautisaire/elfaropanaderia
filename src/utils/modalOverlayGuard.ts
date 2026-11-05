// Evita que los modales se cierren por un click accidental en el fondo.
// Solo se cierran con el botón Cancelar/Cerrar o con la tecla Escape.

const OVERLAY_CLASS = /(^|-)overlay$/;
const IGNORED = new Set(['mobile-overlay']);

let allowOverlayClick = false;

const isModalOverlay = (el: Element | null): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement)) return false;
    // Un overlay sin contenido (ej. backdrop del carrito inferior) no es un modal.
    if (el.childElementCount === 0) return false;
    return Array.from(el.classList).some((c) => OVERLAY_CLASS.test(c) && !IGNORED.has(c));
};

const getOverlays = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[class*="overlay"]')).filter(isModalOverlay);

export function installModalOverlayGuard() {
    document.addEventListener(
        'click',
        (e) => {
            if (allowOverlayClick) return;
            const target = e.target as Element | null;
            if (target && target === e.currentTarget) return;
            if (isModalOverlay(target)) {
                e.stopPropagation();
            }
        },
        true
    );

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const overlays = getOverlays();
        const top = overlays[overlays.length - 1];
        if (!top) return;
        // Espera a que los handlers propios del modal (si tienen) corran primero.
        setTimeout(() => {
            if (!top.isConnected) return;
            allowOverlayClick = true;
            try {
                top.click();
            } finally {
                allowOverlayClick = false;
            }
        }, 0);
    });
}
