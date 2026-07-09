/**
 * Typed wrappers for the app's Rust commands — the only invoke() calls
 * in the codebase.
 */
import { invoke } from '@tauri-apps/api/core';

export interface AssetMeta {
  /** Board-relative POSIX path, e.g. "assets/3f9a1c07e2b44d10_x.png". */
  path: string;
  originalName: string;
  byteSize: number;
  sha256: string;
  naturalW: number | null;
  naturalH: number | null;
}

export function importAsset(srcPath: string, boardDir: string): Promise<AssetMeta> {
  return invoke('import_asset', { srcPath, boardDir });
}

/** Clipboard images etc.: raw body + percent-encoded headers, so bytes
 *  never round-trip through JSON. */
export function importAssetBytes(
  bytes: Uint8Array,
  name: string,
  boardDir: string,
): Promise<AssetMeta> {
  return invoke('import_asset_bytes', bytes, {
    headers: {
      'x-file-name': encodeURIComponent(name),
      'x-board-dir': encodeURIComponent(boardDir),
    },
  });
}

export function saveBoardJson(boardDir: string, json: string): Promise<void> {
  return invoke('save_board', { boardDir, json });
}

export function trashPath(path: string): Promise<void> {
  return invoke('trash_path', { path });
}

export function cleanBoard(boardDir: string, referenced: string[]): Promise<string[]> {
  return invoke('clean_board', { boardDir, referenced });
}

export function readClipboardFiles(): Promise<string[]> {
  return invoke('read_clipboard_files');
}
