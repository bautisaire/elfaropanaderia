import {
  onSnapshot,
  DocumentReference,
  Query,
  DocumentSnapshot,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";

const FRESH_SNAPSHOT_TIMEOUT_MS = 3000;

/**
 * Como Firestore corre con persistentLocalCache, un onSnapshot normal dispara
 * primero con datos viejos del caché local (IndexedDB) y recién después con
 * los datos reales del servidor, causando que la tienda aparezca cerrada/con
 * stock viejo por unos segundos hasta que "salta" al valor correcto.
 * Este wrapper ignora ese primer snapshot de caché y espera la confirmación
 * del servidor, con un timeout de respaldo por si no hay conexión.
 */
export function onFreshSnapshot<T extends DocumentData = DocumentData>(
  ref: DocumentReference<T>,
  onData: (snapshot: DocumentSnapshot<T>) => void,
  onError?: (error: Error) => void
): () => void;
export function onFreshSnapshot<T extends DocumentData = DocumentData>(
  ref: Query<T>,
  onData: (snapshot: QuerySnapshot<T>) => void,
  onError?: (error: Error) => void
): () => void;
export function onFreshSnapshot(
  ref: DocumentReference<any> | Query<any>,
  onData: (snapshot: any) => void,
  onError?: (error: Error) => void
): () => void {
  let hasServerData = false;
  let pendingCached: any = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const unsub = onSnapshot(
    ref as any,
    { includeMetadataChanges: true },
    (snapshot: any) => {
      if (snapshot.metadata.fromCache && !hasServerData) {
        pendingCached = snapshot;
        if (!timeoutId) {
          timeoutId = setTimeout(() => {
            if (pendingCached && !hasServerData) {
              onData(pendingCached);
            }
          }, FRESH_SNAPSHOT_TIMEOUT_MS);
        }
        return;
      }
      clearPendingTimeout();
      hasServerData = true;
      onData(snapshot);
    },
    onError as any
  );

  return () => {
    clearPendingTimeout();
    unsub();
  };
}
