import type { Camera } from './canvas-math';

/**
 * Per-canvas viewport (pan+zoom) and last-active leaf id, in localStorage.
 * Device-local state on purpose — it would be noise in the synced doc.
 * Native has no localStorage; everything degrades to no-ops there (V1).
 */

const cameraKey = (canvasId: string) => `mitsume-notes:viewport:${canvasId}`;
// Key predates leaves; kept so the last-open leaf survives the rename.
const ACTIVE_KEY = 'mitsume-notes:active-canvas';
const SAVE_DEBOUNCE_MS = 300;

const storage = (): Storage | null =>
  typeof localStorage === 'undefined' ? null : localStorage;

export function loadCamera(canvasId: string): Camera | null {
  try {
    const raw = storage()?.getItem(cameraKey(canvasId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Camera>;
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.zoom === 'number'
    )
      return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
  } catch {
    // corrupt entry — fall through to default viewport
  }
  return null;
}

/** Leaves deleted this session: a closing canvas must not re-save them. */
const forgotten = new Set<string>();

export function saveCameraNow(canvasId: string, camera: Camera): void {
  if (forgotten.has(canvasId)) return;
  try {
    storage()?.setItem(cameraKey(canvasId), JSON.stringify(camera));
  } catch {
    // quota/private mode — viewport memory is best-effort
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveCameraDebounced(canvasId: string, camera: Camera): void {
  const pending = timers.get(canvasId);
  if (pending) clearTimeout(pending);
  timers.set(
    canvasId,
    setTimeout(() => {
      timers.delete(canvasId);
      saveCameraNow(canvasId, camera);
    }, SAVE_DEBOUNCE_MS)
  );
}

/**
 * Drop a deleted leaf's saved viewport, including the save its canvas makes
 * on the way out (it unmounts after this runs).
 */
export function forgetCamera(canvasId: string): void {
  forgotten.add(canvasId);
  clearTimeout(timers.get(canvasId));
  timers.delete(canvasId);
  try {
    storage()?.removeItem(cameraKey(canvasId));
  } catch {
    // best-effort
  }
}

export function loadActiveLeaf(): string | null {
  return storage()?.getItem(ACTIVE_KEY) ?? null;
}

export function saveActiveLeaf(leafId: string): void {
  try {
    storage()?.setItem(ACTIVE_KEY, leafId);
  } catch {
    // best-effort
  }
}
