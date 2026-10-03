import {
  DECAY_DECELERATION,
  FOCUS_MARGIN,
  GRID,
  PASTE_MAX_EDGE,
  ZOOM_MAX,
  ZOOM_MIN,
  chooseFocusTarget,
  clampZoom,
  imageSizeFor,
  pasteRectFor,
  placeBelow,
  projectDecay,
  resizeRect,
  resizeRectFree,
  screenToWorld,
  snap,
  snapSize,
  worldToScreen,
  zoomAtPoint,
} from './canvas-math';

describe('snap', () => {
  it('rounds to the nearest grid multiple', () => {
    expect(snap(0)).toBe(0);
    expect(snap(15)).toBe(0);
    expect(snap(16)).toBe(GRID);
    expect(snap(-17)).toBe(-GRID);
    expect(snap(95)).toBe(3 * GRID);
  });

  it('snapSize never drops below one cell', () => {
    expect(snapSize(1)).toBe(GRID);
    expect(snapSize(0)).toBe(GRID);
    expect(snapSize(100)).toBe(96);
  });
});

describe('clampZoom', () => {
  it('clamps to the zoom range', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});

describe('screenToWorld / worldToScreen', () => {
  it('round-trips a point through the camera', () => {
    const camera = { x: 120, y: -60, zoom: 1.5 };
    const p = { x: 333, y: 77 };
    const back = worldToScreen(camera, screenToWorld(camera, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe('zoomAtPoint', () => {
  it('keeps the world point under the cursor fixed', () => {
    const camera = { x: 100, y: 50, zoom: 1 };
    const cursor = { x: 300, y: 200 };
    const before = screenToWorld(camera, cursor);
    const zoomed = zoomAtPoint(camera, cursor, 2);
    const after = screenToWorld(zoomed, cursor);
    expect(zoomed.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('holds the invariant when the requested zoom is clamped', () => {
    const camera = { x: -40, y: 10, zoom: 2 };
    const cursor = { x: 10, y: 500 };
    const before = screenToWorld(camera, cursor);
    const zoomed = zoomAtPoint(camera, cursor, 999);
    const after = screenToWorld(zoomed, cursor);
    expect(zoomed.zoom).toBe(ZOOM_MAX);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe('resizeRect', () => {
  const rect = { x: 64, y: 96, w: 128, h: 64 };

  it('se: grows width to the snapped size, height follows aspect, origin fixed', () => {
    const r = resizeRect(rect, 'se', 70); // 128+70=198 → snaps to 192
    expect(r).toEqual({ x: 64, y: 96, w: 192, h: 96 });
  });

  it('nw: opposite corner stays fixed (x/y shift by the delta)', () => {
    const r = resizeRect(rect, 'nw', 64); // dragging left edge right → shrink
    expect(r.w).toBe(64);
    expect(r.h).toBe(32);
    // bottom-right corner unchanged:
    expect(r.x + r.w).toBe(rect.x + rect.w);
    expect(r.y + r.h).toBe(rect.y + rect.h);
  });

  it('never shrinks below one grid cell', () => {
    const r = resizeRect(rect, 'se', -1000);
    expect(r.w).toBe(GRID);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });

  it('ne: keeps bottom-left fixed', () => {
    const r = resizeRect(rect, 'ne', 64); // 128+64=192 exact
    expect(r.w).toBe(192);
    expect(r.x).toBe(rect.x);
    expect(r.y + r.h).toBe(rect.y + rect.h);
  });
});

describe('resizeRectFree', () => {
  const rect = { x: 64, y: 96, w: 128, h: 64 };

  it('follows the pointer exactly (no snapping), aspect locked', () => {
    const r = resizeRectFree(rect, 'se', 70);
    expect(r.w).toBeCloseTo(198);
    expect(r.h).toBeCloseTo(99);
    expect(r.x).toBe(64);
    expect(r.y).toBe(96);
  });

  it('keeps the opposite corner fixed for nw', () => {
    const r = resizeRectFree(rect, 'nw', 30);
    expect(r.x + r.w).toBeCloseTo(rect.x + rect.w);
    expect(r.y + r.h).toBeCloseTo(rect.y + rect.h);
  });

  it('floors at one grid cell', () => {
    const r = resizeRectFree(rect, 'se', -1000);
    expect(r.w).toBe(GRID);
  });
});

describe('pasteRectFor', () => {
  const viewport = { w: 800, h: 600 };
  const origin = { x: 0, y: 0, zoom: 1 };

  it('caps the long edge and preserves aspect ratio', () => {
    const rect = pasteRectFor({ w: 3000, h: 1500 }, viewport, origin);
    expect(rect.w).toBe(PASTE_MAX_EDGE);
    expect(rect.h).toBe(Math.round(rect.w * (1500 / 3000)));
  });

  it('keeps small images at (snapped) natural size', () => {
    const rect = pasteRectFor({ w: 100, h: 50 }, viewport, origin);
    expect(rect.w).toBe(96); // 100 snapped
    expect(rect.h).toBe(48);
  });

  it('snaps position and centers in the viewport', () => {
    const rect = pasteRectFor({ w: 320, h: 320 }, viewport, origin);
    expect(rect.x % GRID).toBe(0);
    expect(rect.y % GRID).toBe(0);
    // viewport center (400, 300) minus half of 320 → (240, 140) → snapped (256, 128)
    expect(rect.x).toBe(256);
    expect(rect.y).toBe(128);
  });

  it('never produces a zero-height rect for extreme aspect ratios', () => {
    const rect = pasteRectFor({ w: 1000, h: 4 }, viewport, origin);
    expect(rect.h).toBeGreaterThanOrEqual(1);
  });

  it('respects the camera when centering', () => {
    const camera = { x: -1000, y: 0, zoom: 2 };
    const rect = pasteRectFor({ w: 64, h: 64 }, viewport, camera);
    // world center = ((400 − (−1000))/2, (300 − 0)/2) = (700, 150)
    expect(rect.x).toBe(snap(700 - 32));
    expect(rect.y).toBe(snap(150 - 32));
  });
});

describe('projectDecay', () => {
  it('matches the decay curve integral (~0.4995·v for d=0.998)', () => {
    expect(DECAY_DECELERATION).toBe(0.998); // reanimated withDecay default
    expect(projectDecay(1000)).toBeCloseTo(499.5, 0);
  });

  it('is odd-symmetric and zero at rest', () => {
    expect(projectDecay(0)).toBe(0);
    expect(projectDecay(-800)).toBeCloseTo(-projectDecay(800));
  });
});

describe('chooseFocusTarget', () => {
  // Landing viewport at zoom 1 covers world [0..800]×[0..600];
  // margin box [48..752]×[48..552]; per-axis pull cap 400/300.
  const viewport = { w: 800, h: 600 };
  const natural = { x: 0, y: 0, zoom: 1 };

  it('returns null on an empty canvas', () => {
    expect(chooseFocusTarget(natural, viewport, [])).toBeNull();
  });

  it('returns null before the viewport has been measured', () => {
    const items = [{ x: 100, y: 100, w: 50, h: 50 }];
    expect(chooseFocusTarget(natural, { w: 0, h: 0 }, items)).toBeNull();
  });

  it('returns null when the nearest image is already fully in view', () => {
    const items = [{ x: 100, y: 100, w: 200, h: 150 }];
    expect(chooseFocusTarget(natural, viewport, items)).toBeNull();
  });

  it('keeps the natural landing when the nearest image is framed, even if a farther one is clipped', () => {
    const items = [
      { x: 300, y: 250, w: 100, h: 100 }, // framed, nearest
      { x: 900, y: 280, w: 120, h: 40 }, // clipped, farther
    ];
    expect(chooseFocusTarget(natural, viewport, items)).toBeNull();
  });

  it('nudges a half-clipped image inside the margin (overshoot correction)', () => {
    const items = [{ x: 700, y: 200, w: 200, h: 150 }];
    // right edge 900 → margin limit 752 ⇒ dx = −148, y already fine
    expect(chooseFocusTarget(natural, viewport, items)).toEqual({
      x: -148,
      y: 0,
      zoom: 1,
    });
  });

  it('pulls a just-off-screen image into view (undershoot correction)', () => {
    const items = [{ x: 850, y: 200, w: 100, h: 100 }];
    // right edge 950 → 752 ⇒ dx = −198
    expect(chooseFocusTarget(natural, viewport, items)).toEqual({
      x: -198,
      y: 0,
      zoom: 1,
    });
  });

  it('ignores images beyond the search reach', () => {
    const items = [{ x: 1450, y: 250, w: 100, h: 100 }]; // center 1100px out
    expect(chooseFocusTarget(natural, viewport, items)).toBeNull();
  });

  it('gives up rather than pull more than the cap', () => {
    const items = [{ x: 1100, y: 200, w: 100, h: 100 }]; // needs a 448px pull
    expect(chooseFocusTarget(natural, viewport, items)).toBeNull();
  });

  it('falls through to a neighbour when the nearest needs an over-cap pull', () => {
    const items = [
      { x: 380, y: -270, w: 40, h: 40 }, // nearest, needs dy=318 > 300 cap
      { x: 900, y: 280, w: 120, h: 40 }, // farther, dx=−268 fits
    ];
    expect(chooseFocusTarget(natural, viewport, items)).toEqual({
      x: -268,
      y: 0,
      zoom: 1,
    });
  });

  it('leaves an axis alone when the image is wider than the viewport', () => {
    const items = [{ x: -100, y: 700, w: 1000, h: 100 }];
    // x oversized (1000 > 800−2·margin) ⇒ untouched; bottom 800 → 552 ⇒ −248
    expect(chooseFocusTarget(natural, viewport, items)).toEqual({
      x: 0,
      y: -248,
      zoom: 1,
    });
  });

  it('frames in screen space at any zoom', () => {
    const zoomed = { x: -200, y: 0, zoom: 2 };
    const items = [{ x: 380, y: 50, w: 100, h: 100 }];
    // screen rect x 560..760 → right limit 752 ⇒ dx = −8; y fits
    expect(chooseFocusTarget(zoomed, viewport, items)).toEqual({
      x: -208,
      y: 0,
      zoom: 2,
    });
  });

  it('honors the margin exactly', () => {
    const items = [{ x: -60, y: 200, w: 100, h: 100 }];
    const target = chooseFocusTarget(natural, viewport, items);
    // left edge lands exactly on the margin: −60 + dx = FOCUS_MARGIN
    expect(target).toEqual({ x: FOCUS_MARGIN + 60, y: 0, zoom: 1 });
  });
});

describe('imageSizeFor', () => {
  it('caps the long edge and keeps the aspect ratio', () => {
    const size = imageSizeFor({ w: 2000, h: 1000 });
    expect(size.w).toBe(PASTE_MAX_EDGE);
    expect(size.h).toBe(PASTE_MAX_EDGE / 2);
  });
});

describe('placeBelow', () => {
  const size = { w: 256, h: 128 };

  it('starts one cell in from the origin with nothing above', () => {
    expect(placeBelow(null, size, [])).toEqual({ x: GRID, y: GRID, ...size });
  });

  it('lands one cell below its anchor, on the grid', () => {
    const anchor = { x: 64, y: 0, w: 300, h: 100 };
    const rect = placeBelow(anchor, size, [anchor]);
    expect(rect.x).toBe(64);
    expect(rect.y).toBe(Math.ceil((100 + GRID) / GRID) * GRID);
  });

  it('is pushed down past cards in the way', () => {
    const anchor = { x: 0, y: 0, w: 256, h: 128 };
    const blocker = { x: 100, y: 160, w: 200, h: 200 };
    const rect = placeBelow(anchor, size, [anchor, blocker]);
    expect(rect.y).toBeGreaterThanOrEqual(blocker.y + blocker.h);
    expect(rect.y % GRID).toBe(0);
  });
});
