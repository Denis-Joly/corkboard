import { convertFileSrc } from '@tauri-apps/api/core';
import type { AssetRef } from '../model/schema';

/**
 * URL for rendering a board asset in the webview via the asset protocol.
 * Asset filenames are content-hashed, so these URLs are cache-safe forever.
 */
export function assetUrl(boardDir: string, ref: AssetRef): string {
  return convertFileSrc(`${boardDir}/${ref.path}`);
}
