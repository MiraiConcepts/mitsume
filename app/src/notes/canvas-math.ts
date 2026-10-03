/**
 * Pure 2D camera + grid math for the notes canvas.
 * Convention: screen = world * zoom + (camera.x, camera.y), so the camera is
 * the translate applied to a top-left-origin scaled layer.
 */

export const GRID = 32;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/** Long-edge cap (world px) for newly pasted images. */
export const PASTE_MAX_EDGE = 640;

export type Camera = { x: number; y: number; zoom: number };
export type Point = { x: number; y: number };
export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const snap = (v: number): number => Math.round(v / GRID) * GRID;

/** Snap a length to the grid, never below one cell. */
export const snapSize = (v: number): number => Math.max(GRID, snap(v));

export const clampZoom = (zoom: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

export const screenToWorld = (camera: Camera, p: Point): Point => ({
  x: (p.x - camera.x) / camera.zoom,
  y: (p.y - camera.y) / camera.zoom,
});

export const worldToScreen = (camera: Camera, p: Point): Point => ({
  x: p.x * camera.zoom + camera.x,
  y: p.y * camera.zoom + camera.y,
});

/**
 * Zoom keeping the world point under `p` (viewport coords) fixed on screen:
 * t' = p − (p − t)·(z'/z).
 */
export const zoomAtPoint = (
  camera: Camera,
  p: Point,
  rawZoom: number
): Camera => {
  const zoom = clampZoom(rawZoom);
  const ratio = zoom / camera.zoom;
  return {
    x: p.x - (p.x - camera.x) * ratio,
    y: p.y - (p.y - camera.y) * ratio,
    zoom,
  };
};

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Aspect-locked corner resize: the horizontal drag component drives a snapped
 * width (one degree of freedom), height follows the exact aspect ratio, and
 * the rect's opposite corner stays fixed.
 */
export const resizeRect = (
  rect: Rect,
  corner: Corner,
  dxWorld: number
): Rect => {
  const aspect = rect.h / rect.w;
  const sign = corner === 'ne' || corner === 'se' ? 1 : -1;
  const w = snapSize(rect.w + sign * dxWorld);
  const h = Math.max(1, Math.round(w * aspect));
  return {
    x: corner === 'nw' || corner === 'sw' ? rect.x + (rect.w - w) : rect.x,
    y: corner === 'nw' || corner === 'ne' ? rect.y + (rect.h - h) : rect.y,
    w,
    h,
  };
};

/**
 * Free (unsnapped) aspect-locked corner resize — the mid-gesture twin of
 * resizeRect: the image follows the pointer exactly; the grid is enforced
 * only on release (resizeRect). Width still floors at one cell.
 */
export const resizeRectFree = (
  rect: Rect,
  corner: Corner,
  dxWorld: number
): Rect => {
  const aspect = rect.h / rect.w;
  const sign = corner === 'ne' || corner === 'se' ? 1 : -1;
  const w = Math.max(GRID, rect.w + sign * dxWorld);
  const h = Math.max(1, w * aspect);
  return {
    x: corner === 'nw' || corner === 'sw' ? rect.x + (rect.w - w) : rect.x,
    y: corner === 'nw' || corner === 'ne' ? rect.y + (rect.h - h) : rect.y,
    w,
    h,
  };
};

/** reanimated withDecay's deceleration — per-millisecond velocity retention. */
export const DECAY_DECELERATION = 0.998;
/** Screen-px inset an image is nudged inside on a focused fling landing. */
export const FOCUS_MARGIN = 48;
/** Candidate search: landing viewport expanded by this fraction per side. */
export const FOCUS_SEARCH_FACTOR = 0.5;
/** Max landing correction per axis, as a fraction of the viewport size. */
export const FOCUS_MAX_PULL = 0.5;

/**
 * Rest displacement of a decay released at `velocity` (px/s) — the integral
 * of withDecay's velocity curve v(t) = v0 · d^t (t in ms).
 */
export const projectDecay = (velocity: number): number =>
  velocity / (1000 * Math.log(1 / DECAY_DECELERATION));

/** Minimal translation putting [pos, pos+size] inside the margin box. */
const nudge = (pos: number, size: number, span: number): number => {
  if (size > span - 2 * FOCUS_MARGIN) return 0; // oversized: leave the axis
  if (pos < FOCUS_MARGIN) return FOCUS_MARGIN - pos;
  const limit = span - FOCUS_MARGIN;
  if (pos + size > limit) return limit - (pos + size);
  return 0;
};

/**
 * Content-aware fling landing: given the camera where a pan release would
 * naturally rest, find the item nearest the landing viewport and return the
 * minimally corrected camera that brings it fully into view (FOCUS_MARGIN
 * inset). Null ⇒ keep the natural landing: no item near enough, the nearest
 * one is already fully visible, or every fix exceeds FOCUS_MAX_PULL.
 * Candidates are tried nearest-first, so an over-cap pull to one item can
 * still fall through to a neighbour. Translation only — zoom is unchanged.
 */
export const chooseFocusTarget = (
  natural: Camera,
  viewport: Size,
  items: readonly Rect[]
): Camera | null => {
  if (viewport.w <= 0 || viewport.h <= 0) return null;
  const topLeft = screenToWorld(natural, { x: 0, y: 0 });
  const worldW = viewport.w / natural.zoom;
  const worldH = viewport.h / natural.zoom;
  const cx = topLeft.x + worldW / 2;
  const cy = topLeft.y + worldH / 2;
  const reach = 0.5 + FOCUS_SEARCH_FACTOR;
  const candidates = items
    .map((rect) => ({
      rect,
      dx: rect.x + rect.w / 2 - cx,
      dy: rect.y + rect.h / 2 - cy,
    }))
    .filter(
      (c) =>
        Math.abs(c.dx) <= worldW * reach && Math.abs(c.dy) <= worldH * reach
    )
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  for (const { rect } of candidates) {
    const dx = nudge(
      rect.x * natural.zoom + natural.x,
      rect.w * natural.zoom,
      viewport.w
    );
    const dy = nudge(
      rect.y * natural.zoom + natural.y,
      rect.h * natural.zoom,
      viewport.h
    );
    if (dx === 0 && dy === 0) return null; // nearest content already framed
    if (
      Math.abs(dx) <= viewport.w * FOCUS_MAX_PULL &&
      Math.abs(dy) <= viewport.h * FOCUS_MAX_PULL
    )
      return { x: natural.x + dx, y: natural.y + dy, zoom: natural.zoom };
  }
  return null;
};

/**
 * World size for a pasted image: long edge capped at PASTE_MAX_EDGE, width
 * snapped to the grid with height following the exact aspect ratio (strict
 * aspect lock beats double-snapped drift).
 */
export const imageSizeFor = (natural: Size): Size => {
  const cap = Math.min(1, PASTE_MAX_EDGE / Math.max(natural.w, natural.h));
  const w = snapSize(natural.w * cap);
  return { w, h: Math.max(1, Math.round(w * (natural.h / natural.w))) };
};

/**
 * World rect for an image pasted onto the canvas: imageSizeFor, centered in
 * the viewport with the top-left corner snapped.
 */
export const pasteRectFor = (
  natural: Size,
  viewport: Size,
  camera: Camera
): Rect => {
  const { w, h } = imageSizeFor(natural);
  const center = screenToWorld(camera, {
    x: viewport.w / 2,
    y: viewport.h / 2,
  });
  return { x: snap(center.x - w / 2), y: snap(center.y - h / 2), w, h };
};

/** Next grid line at or below v (bottoms of aspect-locked images are off-grid). */
const snapUp = (v: number): number => Math.ceil(v / GRID) * GRID;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where a card added from the notes lands: one grid cell below `anchor` (the
 * card of the chunk above it), or at the origin when there is none, then
 * pushed down past any card it would cover. "The origin" is one cell in from
 * the world origin, so a first card isn't flush against the canvas edge.
 * Snapped, so it sits on the grid like everything else.
 */
export const placeBelow = (
  anchor: Rect | null,
  size: Size,
  others: readonly Rect[]
): Rect => {
  const rect = {
    x: anchor ? snap(anchor.x) : GRID,
    y: anchor ? snapUp(anchor.y + anchor.h + GRID) : GRID,
    w: size.w,
    h: size.h,
  };
  // Each pass clears one blocker; bounded so a pathological layout can't spin.
  for (let pass = 0; pass <= others.length; pass += 1) {
    const blocker = others.find((other) => overlaps(rect, other));
    if (!blocker) break;
    rect.y = snapUp(blocker.y + blocker.h + GRID);
  }
  return rect;
};
