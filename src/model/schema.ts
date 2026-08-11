/**
 * The board document — the on-disk contract. This file is the product:
 * boards must still open in years, across app versions and sync services.
 *
 * Compatibility contract (binding on all future work):
 * 1. Additive changes NEVER bump SCHEMA_VERSION (new optional fields,
 *    new tokens, new card types are additive).
 * 2. Readers are tolerant and round-trip-safe: unknown keys are kept in
 *    memory and written back; an old app never strips a newer app's fields.
 * 3. Unknown card `type` / connection `kind` render as inert placeholders
 *    and serialize back verbatim.
 * 4. schemaVersion > SCHEMA_VERSION → open read-only, never save over it.
 * 5. schemaVersion < SCHEMA_VERSION → migration ladder, snapshot first.
 * 6. Invariants are repaired, not rejected, on load.
 *
 * No React Flow or Tauri concepts belong in here, ever.
 */

export const SCHEMA_VERSION = 1;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardDocument {
  schemaVersion: number;
  /** Written by whichever app version saves; diagnostics only. */
  appVersion: string;
  /** nanoid(12) — immutable identity; folder names drift (Finder, sync). */
  id: string;
  /** Display cache; refreshed from the folder name on load. */
  name: string;
  createdAt: string;
  /** Bumped on every save (not on every edit). */
  modifiedAt: string;
  /** Cosmetic restore; excluded from undo history. */
  viewport: Viewport;
  cards: Card[];
  connections: Connection[];
  /** Escape hatch for future data; round-tripped verbatim. */
  meta?: Record<string, unknown>;
}

export const CARD_COLORS = ['paper', 'yellow', 'pink', 'blue', 'green', 'orange'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const TEXT_STYLES = ['note', 'sticky', 'heading'] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export interface CardBase {
  id: string;
  /** 'text' | 'frame' | 'image' | 'file' | future types (rendered as UnknownNode). */
  type: string;
  /** Canvas (flow) coordinates = CSS px at zoom 1; top-left corner. */
  x: number;
  y: number;
  /** Always explicit — the loader never waits on measurement. */
  w: number;
  h: number;
  /** Color token, never a hex value — palette/dark mode evolve freely. */
  color: CardColor | string;
  /** Stacking order; sparse ints (gap 10), bumped to front on drag. */
  z: number;
  /**
   * Opaque group tag; cards sharing a value select and move together.
   * Absent = ungrouped. Never written when unset, so boards that never
   * group stay byte-identical. Old app versions carry it through
   * verbatim and simply drag cards individually.
   */
  group?: string;
  createdAt: string;
}

export interface TextCard extends CardBase {
  type: 'text';
  /** Markdown source; newlines preserved. */
  text: string;
  /** Unknown values render as 'note'. */
  style: TextStyle | string;
  /** Optional so untouched legacy boards remain byte-identical. Unknown values render left. */
  textAlign?: TextAlign | string;
}

/** A visual boundary around a grouped set of cards. */
export interface FrameCard extends CardBase {
  type: 'frame';
  /** Short editable label shown in the frame header. */
  title: string;
}

export interface AssetRef {
  /** Board-relative POSIX path, e.g. "assets/3f9a1c07e2b44d10_x.png". Never absolute. */
  path: string;
  originalName: string;
  byteSize: number;
  /** Full hex digest; the asset filename prefix is its first 16 chars. */
  sha256: string;
  addedAt: string;
}

export interface ImageCard extends CardBase {
  type: 'image';
  asset: AssetRef;
  /** Probed at import in Rust — correct aspect before the image decodes. */
  naturalW: number;
  naturalH: number;
}

export interface FileCard extends CardBase {
  type: 'file';
  asset: AssetRef;
}

/**
 * A card whose `type` this app version doesn't know. Kept movable and
 * serialized back verbatim (all extra fields preserved by the loader).
 */
export interface UnknownCard extends CardBase {
  [key: string]: unknown;
}

export type Card = TextCard | FrameCard | ImageCard | FileCard | UnknownCard;

export const CONNECTION_KINDS = ['string', 'dashed'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const STRING_COLORS = ['red', 'ocher', 'blue', 'green', 'violet', 'graphite'] as const;
export type StringColor = (typeof STRING_COLORS)[number];

/** A point on a card, as fractions of its rect (0..1 from the top-left corner). */
export interface AnchorPoint {
  x: number;
  y: number;
}

export interface Connection {
  id: string;
  /** Card ids only — no handle/port ids persisted; the view computes attachment. */
  from: string;
  to: string;
  /**
   * Where the string is pinned on the `from`/`to` card, as fractions of
   * that card's rect (so a pin on a map city survives image resizing).
   * Absent or null = legacy floating attachment: the view aims at the
   * card perimeter, exactly as before this field existed. Never written
   * when unset, so boards that never pin stay byte-identical.
   *
   * Same-card connections (from === to) stay unsupported even with
   * anchors: every shipped validator drops self-connections on load, so
   * creating them would silently lose data in older app versions.
   */
  fromAnchor?: AnchorPoint | null;
  toAnchor?: AnchorPoint | null;
  label: string | null;
  /** Color token; null = the default red string. */
  color: string | null;
  /** Unknown kinds render as 'string'. */
  kind: ConnectionKind | string;
  createdAt: string;
}

export function isTextCard(card: Card): card is TextCard {
  return card.type === 'text';
}

export function isImageCard(card: Card): card is ImageCard {
  return card.type === 'image';
}

export function isFrameCard(card: Card): card is FrameCard {
  return card.type === 'frame';
}

export function isFileCard(card: Card): card is FileCard {
  return card.type === 'file';
}

export function isKnownCardType(card: Card): boolean {
  return (
    card.type === 'text' ||
    card.type === 'frame' ||
    card.type === 'image' ||
    card.type === 'file'
  );
}
