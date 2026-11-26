// Links de navegación según el teléfono: en iPhone/iPad abre Apple Maps (la app nativa),
// en Android y compu abre Google Maps.

export const isAppleDevice = (): boolean => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    // iPadOS se presenta como "Macintosh" pero tiene pantalla táctil
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
};

/** Link a unas coordenadas GPS. */
export const mapsLinkForCoords = (lat: number, lng: number): string =>
    isAppleDevice()
        ? `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Link a una dirección de texto (se completa con la localidad). */
export const mapsLinkForAddress = (direccion: string): string => {
    const query = encodeURIComponent(`${direccion}, Senillosa, Neuquen, Argentina`);
    return isAppleDevice()
        ? `https://maps.apple.com/?q=${query}`
        : `https://www.google.com/maps/search/?api=1&query=${query}`;
};
