import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Continuity photos. Kept in this browser's IndexedDB, not in project data:
 * a day of photos is tens of megabytes, and project data is JSON that syncs
 * on every change. The photos stay on the iPad or phone that took them.
 */

export interface ContinuityPhoto {
  id: string;
  projectId: string;
  /** The SceneShoot key. */
  scene: string;
  caption: string;
  at: number;
  blob: Blob;
}

interface PhotoDB extends DBSchema {
  photos: { key: string; value: ContinuityPhoto; indexes: { byScene: [string, string] } };
}

let dbPromise: Promise<IDBPDatabase<PhotoDB>> | null = null;

function db(): Promise<IDBPDatabase<PhotoDB>> {
  dbPromise ??= openDB<PhotoDB>('aplus-shoot-photos', 1, {
    upgrade(database) {
      const store = database.createObjectStore('photos', { keyPath: 'id' });
      store.createIndex('byScene', ['projectId', 'scene']);
    },
  });
  return dbPromise;
}

export async function listPhotos(projectId: string, scene: string): Promise<ContinuityPhoto[]> {
  const all = await (await db()).getAllFromIndex('photos', 'byScene', [projectId, scene]);
  return all.sort((a, b) => a.at - b.at);
}

export async function savePhoto(photo: ContinuityPhoto): Promise<void> {
  await (await db()).put('photos', photo);
}

export async function deletePhoto(id: string): Promise<void> {
  await (await db()).delete('photos', id);
}

/**
 * A camera photo made small enough to keep hundreds of: the long side at most
 * `max` pixels, as JPEG. An iPad photo is 3–4 MB; this is around 200 kB, and
 * still sharp enough to match a collar or a glass of water.
 */
export async function shrinkImage(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ?? file;
  } catch {
    // A format the browser cannot decode here (HEIC on an old Safari): keep the original.
    return file;
  }
}
