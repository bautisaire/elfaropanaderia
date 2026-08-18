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

/** Samples real frame rate for `sampleMs` via requestAnimationFrame. */
function measureFps(sampleMs = 800): Promise<number> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "undefined") {
            resolve(60);
            return;
        }

        let frameCount = 0;
        let start: number | null = null;

        const tick = (time: number) => {
            if (start === null) start = time;
            frameCount++;
            const elapsed = time - start;
            if (elapsed < sampleMs) {
                requestAnimationFrame(tick);
            } else {
                resolve((frameCount / elapsed) * 1000);
            }
        };

        requestAnimationFrame(tick);
    });
}

/**
 * Measures actual frame rate and upgrades <html> to low-power if it comes in
 * under 60fps — catches devices that pass the RAM/core checks on paper but
 * are still slow in practice (throttled, old GPU, background load, etc).
 * Runs once, asynchronously, scheduled for whenever the main thread is idle
 * so it doesn't compete with initial page load/render.
 *
 * Skips the measurement while the tab is hidden/backgrounded: browsers
 * throttle or pause requestAnimationFrame for background tabs, which would
 * otherwise read as a false "low fps" for a perfectly capable device.
 */
export function scheduleFpsLowPowerCheck(): void {
    if (typeof window === "undefined") return;

    const run = async () => {
        if (document.documentElement.classList.contains("low-power")) return;
        if (document.hidden) return;

        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
        const fps = await Promise.race([measureFps(), timeout]);

        if (fps !== null && fps < 60 && !document.hidden) {
            document.documentElement.classList.add("low-power");
        }
    };

    if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(run, { timeout: 3000 });
    } else {
        setTimeout(run, 1500);
    }
}
