/**
 * ⌘V — first-class, because cross-app drags physically can't reach a
 * Tauri webview. Priority chain, placing at the last pointer position:
 *   0. our own card clipboard (magic-prefixed text from ⌘C/⌘X)
 *   1. Finder-copied files (Rust NSPasteboard)
 *   2. clipboard image (plugin readImage → PNG via canvas)
 *   3. plain text (URL-shaped text gets a link look)
 * Never navigator.clipboard — unreliable in WKWebView.
 */
import { readImage, readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { pointerTargetFlow } from '../canvas/rfInstance';
import { newId, newTextCard, Z_GAP } from '../model/factories';
import { nextZ } from '../model/ops';
import type { Card, Connection } from '../model/schema';
import { parseBoardDocument } from '../model/validate';
import { commitDoc } from '../stores/history';
import * as ops from '../model/ops';
import { insertCards, makeImageCard } from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { importAssetBytes, readClipboardFiles } from '../tauri/commands';
import { importFilesAt } from './fileDrop';

const CARDS_MAGIC = 'corkboard/cards-v1:';
const PASTE_OFFSET = 24;

interface CardClip {
  cards: Card[];
  connections: Connection[];
}

/** ⌘C / ⌘X: selection → system clipboard as magic-prefixed JSON. */
export async function copySelection(cut: boolean): Promise<void> {
  const ui = useUiStore.getState();
  const doc = useBoardStore.getState().doc;
  const ids = ui.selection;
  if (ids.size === 0) return;
  const cards = doc.cards.filter((c) => ids.has(c.id));
  const connections = doc.connections.filter((k) => ids.has(k.from) && ids.has(k.to));
  try {
    await writeText(CARDS_MAGIC + JSON.stringify({ cards, connections }));
  } catch (err) {
    ui.pushToast(`Couldn't copy: ${String(err)}`);
    return;
  }
  if (cut) {
    commitDoc((d) => ops.deleteCards(d, [...ids]));
    ui.clearSelection();
  }
}

export async function pasteAtPointer(): Promise<void> {
  const ui = useUiStore.getState();
  if (useBoardStore.getState().readOnly) {
    ui.pushToast('This board is read-only.');
    return;
  }
  const at = pointerTargetFlow();

  // 1. Finder-copied files.
  try {
    const paths = await readClipboardFiles();
    if (paths.length > 0) {
      await importFilesAt(paths, at);
      return;
    }
  } catch (err) {
    console.warn('clipboard file read failed', err);
  }

  // 0/3. Text — our card clipboard, or a plain text/URL note.
  let text: string | null = null;
  try {
    text = await readText();
  } catch {
    text = null; // no text on the clipboard
  }
  if (text && text.startsWith(CARDS_MAGIC)) {
    pasteCards(text.slice(CARDS_MAGIC.length), at);
    return;
  }

  // 2. Clipboard image (screenshots, browser "copy image").
  if (await pasteClipboardImage(at)) return;

  if (text && text.trim().length > 0) {
    const doc = useBoardStore.getState().doc;
    const card = newTextCard({ x: at.x, y: at.y, z: nextZ(doc) }, text);
    // Estimate height (the editor re-measures on the next edit).
    const hardLines = text.split('\n');
    const lines = hardLines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 32)), 0);
    card.h = Math.min(20 + lines * 20, 480);
    insertCards([card]);
    return;
  }

  ui.pushToast('Nothing pasteable on the clipboard.');
}

function pasteCards(json: string, at: { x: number; y: number }): void {
  try {
    // Never trust the clipboard: run the pasted payload through the
    // same repair machinery as files from disk, otherwise hostile or
    // stale JSON could corrupt the document and the saved board.
    const raw = JSON.parse(json) as CardClip;
    const { doc: repairedDoc } = parseBoardDocument(
      { schemaVersion: 1, cards: raw.cards, connections: raw.connections },
      'clipboard',
    );
    const clip: CardClip = {
      cards: repairedDoc.cards,
      connections: repairedDoc.connections,
    };
    if (!Array.isArray(clip.cards) || clip.cards.length === 0) return;
    const doc = useBoardStore.getState().doc;
    let z = nextZ(doc);

    // Keep relative layout; land the group's top-left near the pointer.
    const minX = Math.min(...clip.cards.map((c) => c.x));
    const minY = Math.min(...clip.cards.map((c) => c.y));
    const idMap = new Map<string, string>();
    const cards: Card[] = clip.cards.map((c) => {
      const id = newId();
      idMap.set(c.id, id);
      const next = {
        ...c,
        id,
        x: c.x - minX + at.x + PASTE_OFFSET,
        y: c.y - minY + at.y + PASTE_OFFSET,
        z,
        createdAt: new Date().toISOString(),
      } as Card;
      z += Z_GAP;
      return next;
    });
    const connections: Connection[] = (clip.connections ?? [])
      .filter((k) => idMap.has(k.from) && idMap.has(k.to))
      .map((k) => ({
        ...k,
        id: newId(),
        from: idMap.get(k.from)!,
        to: idMap.get(k.to)!,
      }));

    commitDoc((d) => ({
      ...ops.addCards(d, cards),
      connections: [...d.connections, ...connections],
    }));
    useUiStore.getState().setSelection(cards.map((c) => c.id));
  } catch (err) {
    useUiStore.getState().pushToast(`Couldn't paste cards: ${String(err)}`);
  }
}

async function pasteClipboardImage(at: { x: number; y: number }): Promise<boolean> {
  const { boardDir } = useBoardStore.getState();
  if (!boardDir) return false;
  try {
    // (boardDir is re-checked before insert — see below — because the
    // user can switch boards while the image encodes/imports.)
    const image = await readImage();
    const { width, height } = await image.size();
    if (!width || !height) return false;
    const rgba = await image.rgba();

    // RGBA → PNG via an offscreen canvas (no PNG encoder dependency).
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const meta = await importAssetBytes(bytes, `Pasted ${stamp}.png`, boardDir);
    const asset = {
      path: meta.path,
      originalName: meta.originalName,
      byteSize: meta.byteSize,
      sha256: meta.sha256,
      addedAt: new Date().toISOString(),
    };
    if (useBoardStore.getState().boardDir !== boardDir) {
      useUiStore.getState().pushToast('Board changed while pasting — image not added.');
      return true;
    }
    const card = makeImageCard(at, asset, meta.naturalW ?? width, meta.naturalH ?? height);
    insertCards([{ ...card, x: at.x - card.w / 2, y: at.y - card.h / 2 }]);
    return true;
  } catch {
    return false; // no image on the clipboard (or plugin quirk) — fall through
  }
}
