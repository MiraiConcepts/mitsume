/** Plain-JSON shapes of the Yjs notes doc (what toJSON() yields). */

/** A leaf (one notepad + one canvas) as the rail lists it. */
export type LeafMeta = {
  id: string;
  /** Basil icon name shown in the LeafBar (see constants/icon-paths). */
  icon: string;
  createdAt: number;
  /** Rail position: the stored order, or createdAt for a leaf never moved. */
  order: number;
};

/** Where a card sits on its leaf's canvas: world coordinates, z stacks newest-on-top. */
type Placed = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

/**
 * One image card (x/y/w/h grid-snapped). Bytes live in the blob store keyed
 * by SHA-256 — the doc only ever references hashes (originals are kept
 * server-side for future view/export; the canvas renders the display
 * rendition). Images predate text cards, so `kind` is absent on old ones.
 */
export type ImageItem = Placed & {
  kind?: 'image';
  displayHash: string;
  /** Mime of the display rendition (its bytes may be re-encoded WebP). */
  displayMime: string;
  /** Natural pixel size of the display rendition. */
  displayW: number;
  displayH: number;
  originalHash: string;
  originalMime: string;
  originalSize: number;
};

/** One text card — a chunk of the leaf's notes (its Y.Text, as a string). */
export type TextItem = Placed & {
  kind: 'text';
  text: string;
};

/** A card on a leaf's canvas, which is also one chunk of its notes. */
export type CanvasItem = ImageItem | TextItem;

export const isTextItem = (item: CanvasItem): item is TextItem =>
  item.kind === 'text';

/** toJSON() of a leaf's items map: itemId → item. */
export type CanvasItems = Record<string, CanvasItem>;

/** The blob-derived fields of an ImageItem (position/z added by the caller). */
export type IngestedImage = Pick<
  ImageItem,
  | 'displayHash'
  | 'displayMime'
  | 'displayW'
  | 'displayH'
  | 'originalHash'
  | 'originalMime'
  | 'originalSize'
>;
