type PendingSegment = { key: string; session: string; sequence: number; audio: Blob };

async function queueTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("cbb-consultations", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("segments", { keyPath: "key" }).createIndex("session", "session");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("segments", mode);
      const request = operation(transaction.objectStore("segments"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function queueSegment(session: string, sequence: number, audio: Blob) {
  return queueTransaction("readwrite", (store) => store.put({ key: session + "/" + sequence, session, sequence, audio }));
}

export function pendingSegments(session: string) {
  return queueTransaction<PendingSegment[]>("readonly", (store) => store.index("session").getAll(session));
}

export function removeSegment(key: string) {
  return queueTransaction("readwrite", (store) => store.delete(key));
}
