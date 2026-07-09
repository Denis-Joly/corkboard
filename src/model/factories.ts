import { nanoid } from 'nanoid';
import {
  SCHEMA_VERSION,
  type AssetRef,
  type BoardDocument,
  type CardColor,
  type Connection,
  type FileCard,
  type ImageCard,
  type TextCard,
} from './schema';

export const APP_VERSION = '0.1.0';

export const ID_LENGTH = 12;
export const newId = () => nanoid(ID_LENGTH);

const now = () => new Date().toISOString();

export const DEFAULT_TEXT_WIDTH = 240;
export const DEFAULT_TEXT_HEIGHT = 56;
export const DEFAULT_FILE_WIDTH = 220;
export const DEFAULT_FILE_HEIGHT = 64;
export const MAX_IMAGE_INITIAL_WIDTH = 320;
export const Z_GAP = 10;

export function newBoard(name: string): BoardDocument {
  const ts = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    id: newId(),
    name,
    createdAt: ts,
    modifiedAt: ts,
    viewport: { x: 0, y: 0, zoom: 1 },
    cards: [],
    connections: [],
  };
}

interface CardSeed {
  x: number;
  y: number;
  z: number;
  color?: CardColor | string;
}

export function newTextCard(seed: CardSeed, text = ''): TextCard {
  return {
    id: newId(),
    type: 'text',
    x: seed.x,
    y: seed.y,
    w: DEFAULT_TEXT_WIDTH,
    h: DEFAULT_TEXT_HEIGHT,
    color: seed.color ?? 'paper',
    z: seed.z,
    createdAt: now(),
    text,
    style: 'note',
  };
}

export function newImageCard(
  seed: CardSeed,
  asset: AssetRef,
  naturalW: number,
  naturalH: number,
): ImageCard {
  const w = Math.min(naturalW, MAX_IMAGE_INITIAL_WIDTH);
  const h = naturalW > 0 ? Math.round((w / naturalW) * naturalH) : w;
  return {
    id: newId(),
    type: 'image',
    x: seed.x,
    y: seed.y,
    w,
    h: Math.max(h, 24),
    color: seed.color ?? 'paper',
    z: seed.z,
    createdAt: now(),
    asset,
    naturalW,
    naturalH,
  };
}

export function newFileCard(seed: CardSeed, asset: AssetRef): FileCard {
  return {
    id: newId(),
    type: 'file',
    x: seed.x,
    y: seed.y,
    w: DEFAULT_FILE_WIDTH,
    h: DEFAULT_FILE_HEIGHT,
    color: seed.color ?? 'paper',
    z: seed.z,
    createdAt: now(),
    asset,
  };
}

export function newConnection(from: string, to: string): Connection {
  return {
    id: newId(),
    from,
    to,
    label: null,
    color: null,
    kind: 'string',
    createdAt: now(),
  };
}
