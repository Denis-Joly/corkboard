import { homeDir, join } from '@tauri-apps/api/path';

export const BOARDS_DIR_NAME = 'CorkBoards';

let cachedRoot: string | null = null;

/** Absolute path of the boards root (`~/CorkBoards`). Mirrors the Rust
 *  side's paths.rs; both must agree with the static scopes in
 *  tauri.conf.json and capabilities/default.json. */
export async function boardsRoot(): Promise<string> {
  if (!cachedRoot) {
    cachedRoot = await join(await homeDir(), BOARDS_DIR_NAME);
  }
  return cachedRoot;
}
