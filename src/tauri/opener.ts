import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import type { AssetRef } from '../model/schema';

function absolute(boardDir: string, ref: AssetRef): string {
  return `${boardDir}/${ref.path}`;
}

/** Double-click a file card: open with the system default app. */
export function openAsset(boardDir: string, ref: AssetRef): Promise<void> {
  return openPath(absolute(boardDir, ref));
}

export function revealAsset(boardDir: string, ref: AssetRef): Promise<void> {
  return revealItemInDir(absolute(boardDir, ref));
}

export function openExternalUrl(url: string): Promise<void> {
  return openUrl(url);
}
