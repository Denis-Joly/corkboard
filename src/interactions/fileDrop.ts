/**
 * OS file drops — the flagship gesture.
 *
 * dragDropEnabled stays true, so Tauri's native handler owns ALL drags:
 * onDragDropEvent delivers absolute paths (HTML5 drag events are dead in
 * this webview — platform fact, not a bug). Non-file drags (text/images
 * from a browser) arrive with empty paths and physically cannot carry
 * data; we teach ⌘V instead, at most twice ever.
 */
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  DEFAULT_FILE_HEIGHT,
  DEFAULT_FILE_WIDTH,
  MAX_IMAGE_INITIAL_WIDTH,
  newFileCard,
  newImageCard,
  Z_GAP,
} from '../model/factories';
import { nextZ } from '../model/ops';
import type { AssetRef, Card } from '../model/schema';
import { insertCards } from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { importAsset, type AssetMeta } from '../tauri/commands';
import { dropPointToFlow, type ScreenPoint } from '../tauri/coords';

const TEACH_PASTE_KEY = 'corkboard.teachPasteCount';
const CASCADE_STEP = 28;
const CASCADE_MAX = 6;
const GRID_CELL_W = 260;
const GRID_CELL_H = 200;

let importSeq = 0;

export async function installFileDrop(): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => {
    const ui = useUiStore.getState();
    const payload = event.payload;
    switch (payload.type) {
      case 'enter':
        ui.setDropPreview({
          x: payload.position.x,
          y: payload.position.y,
          count: payload.paths.length,
        });
        break;
      case 'over': {
        const current = useUiStore.getState().dropPreview;
        ui.setDropPreview({
          x: payload.position.x,
          y: payload.position.y,
          count: current?.count ?? 0,
        });
        break;
      }
      case 'drop':
        ui.setDropPreview(null);
        void handleDrop(payload.paths, payload.position);
        break;
      case 'leave':
        ui.setDropPreview(null);
        break;
    }
  });
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** First few cascade diagonally; larger batches settle into a grid. */
export function layoutDropPositions(center: ScreenPoint, count: number): ScreenPoint[] {
  if (count <= CASCADE_MAX) {
    return Array.from({ length: count }, (_, i) => ({
      x: center.x + i * CASCADE_STEP,
      y: center.y + i * CASCADE_STEP,
    }));
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => ({
    x: center.x + (i % cols) * GRID_CELL_W - ((cols - 1) * GRID_CELL_W) / 2,
    y: center.y + Math.floor(i / cols) * GRID_CELL_H - ((rows - 1) * GRID_CELL_H) / 2,
  }));
}

async function handleDrop(paths: string[], position: ScreenPoint): Promise<void> {
  if (paths.length === 0) {
    teachPaste();
    return;
  }
  const center = dropPointToFlow(position);
  if (!center) return;
  await importFilesAt(paths, center);
}

/**
 * Import absolute file paths as cards centered around a flow-space
 * point. Shared by the drop pipeline and ⌘V of Finder-copied files.
 */
export async function importFilesAt(paths: string[], center: ScreenPoint): Promise<void> {
  const ui = useUiStore.getState();
  const { boardDir, readOnly } = useBoardStore.getState();
  if (!boardDir || readOnly) {
    if (readOnly) ui.pushToast('This board is read-only.');
    return;
  }

  const positions = layoutDropPositions(center, paths.length);
  const imports = await Promise.all(
    paths.map(async (path, i) => {
      const key = `import-${importSeq++}`;
      ui.addPendingImport(key, { ...positions[i], name: baseName(path) });
      try {
        const meta = await importAsset(path, boardDir);
        return { meta, pos: positions[i] };
      } catch (err) {
        const msg = String(err);
        ui.pushToast(
          msg.includes('not a file')
            ? `"${baseName(path)}" is a folder — drop the files inside it instead.`
            : `Couldn't add ${baseName(path)}: ${msg}`,
        );
        return null;
      } finally {
        useUiStore.getState().removePendingImport(key);
      }
    }),
  );

  const good = imports.filter((r): r is { meta: AssetMeta; pos: ScreenPoint } => r !== null);
  if (good.length === 0) return;

  // The imports are async — if the user switched boards meanwhile, these
  // asset paths belong to the OLD board's folder. Never insert them into
  // whichever document happens to be open now.
  if (useBoardStore.getState().boardDir !== boardDir) {
    ui.pushToast('Board changed while importing — the files were copied but no cards were added.');
    return;
  }

  // Build all cards, then insert once — the whole drop is ONE undo entry.
  const doc = useBoardStore.getState().doc;
  let z = nextZ(doc);
  const cards: Card[] = [];
  for (const { meta, pos } of good) {
    const asset: AssetRef = {
      path: meta.path,
      originalName: meta.originalName,
      byteSize: meta.byteSize,
      sha256: meta.sha256,
      addedAt: new Date().toISOString(),
    };
    if (meta.naturalW && meta.naturalH) {
      const w = Math.min(meta.naturalW, MAX_IMAGE_INITIAL_WIDTH);
      const h = meta.naturalW > 0 ? Math.round((w / meta.naturalW) * meta.naturalH) : w;
      const card = newImageCard(
        { x: pos.x - w / 2, y: pos.y - h / 2, z },
        asset,
        meta.naturalW,
        meta.naturalH,
      );
      cards.push(card);
    } else {
      cards.push(
        newFileCard(
          { x: pos.x - DEFAULT_FILE_WIDTH / 2, y: pos.y - DEFAULT_FILE_HEIGHT / 2, z },
          asset,
        ),
      );
    }
    z += Z_GAP;
  }
  insertCards(cards);
}

/** Browser drags can't reach us (platform wall) — teach ⌘V, twice max. */
function teachPaste(): void {
  const count = Number(localStorage.getItem(TEACH_PASTE_KEY) ?? '0');
  if (count >= 2) return;
  localStorage.setItem(TEACH_PASTE_KEY, String(count + 1));
  useUiStore
    .getState()
    .pushToast("Drags from other apps can't carry data — copy it there and press ⌘V here instead.", 6000);
}
