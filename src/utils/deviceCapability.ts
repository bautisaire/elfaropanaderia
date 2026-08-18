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

// A single busy 800ms window (page still loading images, Firestore
// listeners spinning up, GC pause, etc.) will dip well under 60fps on any
// device, flagship phones included — that's page-load noise, not a hardware
// signal. 45fps sustained across two separate samples is a much safer bar
// for "this device is actually struggling."
const FPS_LOW_POWER_THRESHOLD = 45;

async function sampleFpsOnce(): Promise<number | null> {
    if (document.hidden) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    return Promise.race([measureFps(), timeout]);
}

/**
 * Measures actual frame rate and upgrades <html> to low-power if it's
 * consistently below FPS_LOW_POWER_THRESHOLD — catches devices that pass the
 * RAM/core checks on paper but are still slow in practice (throttled, old
 * GPU, etc). Waits for the page to fully load, then takes two samples a
 * second apart and only flags the device if BOTH come in low, so a single
 * busy moment can't misclassify a capable phone.
 *
 * Skips the measurement while the tab is hidden/backgrounded: browsers
 * throttle or pause requestAnimationFrame for background tabs, which would
 * otherwise read as a false "low fps" for a perfectly capable device.
 */
export function scheduleFpsLowPowerCheck(): void {
    if (typeof window === "undefined") return;

    const run = async () => {
        if (document.documentElement.classList.contains("low-power")) return;

        const first = await sampleFpsOnce();
        if (first === null || first >= FPS_LOW_POWER_THRESHOLD) return;

        // Confirm with a second sample before committing to the classification.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const second = await sampleFpsOnce();
        if (second !== null && second < FPS_LOW_POWER_THRESHOLD) {
            document.documentElement.classList.add("low-power");
        }
    };

    const schedule = () => {
        if ("requestIdleCallback" in window) {
            (window as any).requestIdleCallback(run, { timeout: 3000 });
        } else {
            setTimeout(run, 1500);
        }
    };

    // Wait for the page to actually finish loading first — sampling while
    // images/data are still streaming in is exactly what caused the false
    // positive in the first place.
    if (document.readyState === "complete") {
        setTimeout(schedule, 1000);
    } else {
        window.addEventListener("load", () => setTimeout(schedule, 1000), { once: true });
    }
}
