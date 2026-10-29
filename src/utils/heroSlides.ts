// Modelo compartido de la portada (hero) de la tienda.
// Cada slide = imagen de fondo + líneas de texto con color + botones opcionales.
// Los slides viejos (title/subtitle/buttonText/buttonLink) se convierten al vuelo.

export type HeroTextKind = "eyebrow" | "title" | "subtitle";

export interface HeroTextLine {
    id: string;
    kind: HeroTextKind;
    text: string;
    color: string;
}

export interface HeroButton {
    id: string;
    text: string;
    link: string;
    isRaffle?: boolean;
    bgColor: string;
    textColor: string;
}

export interface HeroSlide {
    id: string;
    imageUrl: string;
    texts: HeroTextLine[];
    buttons: HeroButton[];
    overlay: number; // 0-80: opacidad del oscurecido sobre la imagen
    animation: "zoom-in" | "zoom-out";
    active?: boolean;
    order?: number;
    title?: string; // espejo del primer título, para listados
}

export interface HeroCard {
    id: string;
    imageUrl: string;
    link?: string;
    alt?: string;
    active?: boolean;
    order?: number;
    slideIds?: string[]; // slides donde se muestra; vacío/ausente = en todos
}

export const HERO_PALETTE = [
    "#ffffff", "#111827", "#d63336", "#d35400",
    "#eab308", "#fdf6e3", "#16a34a", "#2563eb",
];

export const newId = () => Math.random().toString(36).slice(2, 10);

export const makeText = (kind: HeroTextKind = "title"): HeroTextLine => ({
    id: newId(),
    kind,
    text: "",
    color: "#ffffff",
});

export const makeButton = (): HeroButton => ({
    id: newId(),
    text: "Ver Productos",
    link: "",
    isRaffle: false,
    bgColor: "#d63336",
    textColor: "#ffffff",
});

export function normalizeSlide(raw: any): HeroSlide {
    let texts: HeroTextLine[];
    if (Array.isArray(raw.texts)) {
        texts = raw.texts;
    } else {
        texts = [];
        if (raw.title) texts.push({ id: newId(), kind: "title", text: raw.title, color: "#ffffff" });
        if (raw.subtitle) texts.push({ id: newId(), kind: "subtitle", text: raw.subtitle, color: "#ffffff" });
    }

    let buttons: HeroButton[];
    if (Array.isArray(raw.buttons)) {
        buttons = raw.buttons;
    } else if (raw.showButton) {
        buttons = [{
            id: newId(),
            text: raw.buttonText || (raw.isRaffleButton ? "Ver Sorteo" : "Ver Productos"),
            link: raw.buttonLink || "",
            isRaffle: !!raw.isRaffleButton,
            bgColor: "#d35400",
            textColor: "#ffffff",
        }];
    } else {
        buttons = [];
    }

    return {
        id: raw.id,
        imageUrl: raw.imageUrl || "",
        texts,
        buttons,
        overlay: typeof raw.overlay === "number" ? raw.overlay : 40,
        animation: raw.animation === "zoom-out" ? "zoom-out" : "zoom-in",
        active: raw.active,
        order: raw.order,
        title: raw.title,
    };
}
