const STORAGE_KEY = 'admin_test_mode_enabled';

export const getAdminEmails = (): string[] =>
    (import.meta.env.VITE_ADMIN_EMAIL || '')
        .split(',')
        .map((e: string) => e.trim())
        .filter(Boolean);

export const isSuperAdminEmail = (email: string | null | undefined): boolean =>
    !!email && getAdminEmails().includes(email);

export const isTestModeEnabled = (): boolean =>
    typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';

export const setTestModeEnabled = (enabled: boolean): void => {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('admin_test_mode_changed'));
};

/** Si está activo, los pedidos creados por este dispositivo no alertan ni imprimen. */
export const shouldMarkOrderAsTest = (): boolean => isTestModeEnabled();
