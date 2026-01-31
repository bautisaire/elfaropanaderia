import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";

// Reusing the same admin email logic as Editor.tsx
// const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim());


declare global {
    interface Window {
        VConsole: any;
        vConsole: any;
    }
}

export default function DebugConsole() {
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user && user.email === 'sairebautista@gmail.com') {
                // User is admin, load vConsole if not already loaded
                if (!window.vConsole) {
                    const script = document.createElement("script");
                    script.src = "https://unpkg.com/vconsole@latest/dist/vconsole.min.js";
                    script.async = true;
                    script.onload = () => {
                        // Initialize vConsole
                        if (window.VConsole) {
                            window.vConsole = new window.VConsole();
                        }
                    };
                    document.head.appendChild(script);
                }
            } else {
                // User is not admin, destroy vConsole if it exists
                if (window.vConsole) {
                    window.vConsole.destroy();
                    window.vConsole = null;
                }
            }
        });

        return () => unsubscribe();
    }, []);

    return null; // This component does not render anything visible itself
}
