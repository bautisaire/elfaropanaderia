export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`timeout: ${label} no respondió en ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Deja de esperar una promesa que tarda demasiado. getDoc/setDoc de Firestore y
 * httpsCallable pueden quedarse esperando indefinidamente con mala señal o al volver
 * al navegador desde otra app (la conexión murió pero el SDK todavía no se enteró),
 * y en el checkout eso dejaba al cliente mirando "Confirmando tu pedido..." para siempre.
 * La promesa original no se cancela: sigue corriendo, solo dejamos de esperarla.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
