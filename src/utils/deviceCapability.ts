/**
 * Heuristic for low-end devices: RAM or CPU cores at/below the threshold.
 * navigator.deviceMemory / hardwareConcurrency are only reliably available on
 * Chromium-based mobile browsers, which covers the phones this matters for.
 */
export function isLowPowerDevice(): boolean {
    if (typeof navigator === "undefined") return false;

    const memory = (navigator as any).deviceMemory;
    if (typeof memory === "number" && memory <= 2) return true;

    const cores = navigator.hardwareConcurrency;
    if (typeof cores === "number" && cores <= 4) return true;

    return false;
}

/** Marks <html> as low-power as early as possible, before first paint. */
export function applyLowPowerClass(): void {
    if (typeof document === "undefined") return;
    if (isLowPowerDevice()) {
        document.documentElement.classList.add("low-power");
    }
}
