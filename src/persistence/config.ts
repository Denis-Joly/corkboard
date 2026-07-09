/**
 * Machine-local app config in <appDataDir>/config.json — deliberately
 * OUTSIDE the synced boards folder so nothing machine-specific can
 * drift or conflict through a sync service.
 */
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export interface AppConfig {
  lastOpenedBoardId: string | null;
  /** Reserved for a future relocatable boards root (needs scope work). */
  boardsRoot?: string;
}

const FILE = 'config.json';
const BASE = { baseDir: BaseDirectory.AppData };

export async function loadConfig(): Promise<AppConfig> {
  try {
    if (!(await exists(FILE, BASE))) return { lastOpenedBoardId: null };
    const raw = JSON.parse(await readTextFile(FILE, BASE));
    if (typeof raw !== 'object' || raw === null) return { lastOpenedBoardId: null };
    return {
      lastOpenedBoardId:
        typeof raw.lastOpenedBoardId === 'string' ? raw.lastOpenedBoardId : null,
      ...(typeof raw.boardsRoot === 'string' ? { boardsRoot: raw.boardsRoot } : {}),
    };
  } catch {
    return { lastOpenedBoardId: null };
  }
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<void> {
  try {
    const current = await loadConfig();
    await mkdir('', { ...BASE, recursive: true }).catch(() => {});
    await writeTextFile(FILE, JSON.stringify({ ...current, ...patch }, null, 2), BASE);
  } catch (err) {
    // Config is a convenience; failing to persist it must never break the app.
    console.warn('config save failed', err);
  }
}
