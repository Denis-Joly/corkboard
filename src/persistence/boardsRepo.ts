/**
 * Board discovery and lifecycle. A board is a folder under ~/CorkBoards
 * containing board.json (+ assets/). Boards are discovered by scanning —
 * no index file lives in the synced folder, so there is nothing to
 * corrupt or conflict.
 */
import { basename, join } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { APP_VERSION, newBoard } from '../model/factories';
import { migrateRaw, MIGRATIONS } from '../model/migrations';
import type { BoardDocument } from '../model/schema';
import { SCHEMA_VERSION } from '../model/schema';
import { parseBoardDocument, UnreadableBoardError } from '../model/validate';
import { boardsRoot } from '../tauri/appPaths';
import { saveBoardJson, trashPath } from '../tauri/commands';

export interface BoardSummary {
  dir: string;
  doc: BoardDocument;
}

export interface LoadedBoard {
  dir: string;
  doc: BoardDocument;
  repairs: string[];
  readOnly: boolean;
  recoveredFromBackup: boolean;
}

/** Scan one level deep for folders containing board.json. */
export async function discoverBoards(): Promise<BoardSummary[]> {
  const root = await boardsRoot();
  if (!(await exists(root))) return [];
  const entries = await readDir(root);
  const boards: BoardSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory || entry.name.startsWith('.')) continue;
    const dir = await join(root, entry.name);
    try {
      const loaded = await loadBoard(dir, { quiet: true });
      boards.push({ dir, doc: loaded.doc });
    } catch {
      // Not a readable board (foreign folder, both files corrupt) — skip.
    }
  }
  boards.sort((a, b) => (a.doc.modifiedAt < b.doc.modifiedAt ? 1 : -1));
  return boards;
}

async function readRaw(dir: string, file: string): Promise<unknown> {
  const text = await readTextFile(await join(dir, file));
  return JSON.parse(text);
}

/**
 * Load one board: board.json, else .bak. Runs the migration ladder
 * (snapshotting the original first) and load-time repair.
 */
export async function loadBoard(
  dir: string,
  opts: { quiet?: boolean } = {},
): Promise<LoadedBoard> {
  const folderName = await basename(dir);
  let raw: unknown;
  let recoveredFromBackup = false;

  try {
    raw = await readRaw(dir, 'board.json');
  } catch {
    raw = await readRaw(dir, 'board.json.bak'); // throws → caller handles
    recoveredFromBackup = true;
  }

  let migrated = false;
  let fromVersion = SCHEMA_VERSION;
  try {
    const result = migrateRaw(raw, MIGRATIONS);
    raw = result.raw;
    migrated = result.migrated;
    fromVersion = result.fromVersion;
  } catch {
    // A broken migration must not brick the board; repair does its best.
  }

  let parsed;
  try {
    parsed = parseBoardDocument(raw, folderName);
  } catch (err) {
    if (err instanceof UnreadableBoardError && !recoveredFromBackup) {
      // board.json parsed as JSON but isn't a document — try the backup.
      const bak = await readRaw(dir, 'board.json.bak');
      parsed = parseBoardDocument(migrateRaw(bak, MIGRATIONS).raw, folderName);
      recoveredFromBackup = true;
    } else {
      throw err;
    }
  }

  const doc = { ...parsed.doc, name: folderName };

  if (migrated && !parsed.readOnly && !opts.quiet) {
    await snapshotBeforeMigration(dir, fromVersion);
    await persistBoard(dir, doc);
  }

  return { dir, doc, repairs: parsed.repairs, readOnly: parsed.readOnly, recoveredFromBackup };
}

async function snapshotBeforeMigration(dir: string, fromVersion: number): Promise<void> {
  try {
    const backups = await join(dir, '.backups');
    await mkdir(backups, { recursive: true });
    const original = await readTextFile(await join(dir, 'board.json'));
    const stamp = new Date().toISOString().slice(0, 10);
    await writeTextFile(await join(backups, `board.v${fromVersion}.${stamp}.json`), original);
  } catch (err) {
    console.warn('pre-migration snapshot failed', err);
  }
}

/** Serialize + atomically save (Rust side). Bumps modifiedAt/appVersion. */
export async function persistBoard(dir: string, doc: BoardDocument): Promise<BoardDocument> {
  const toSave: BoardDocument = {
    ...doc,
    appVersion: APP_VERSION,
    modifiedAt: new Date().toISOString(),
  };
  await saveBoardJson(dir, JSON.stringify(toSave, null, 2));
  return toSave;
}

function sanitizeFolderName(name: string): string {
  const cleaned = name
    .replace(/[/\\:]/g, '-')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : 'Untitled Board';
}

/** Create a new board folder (deduping the name) with an empty document. */
export async function createBoard(rawName: string): Promise<LoadedBoard> {
  const root = await boardsRoot();
  await mkdir(root, { recursive: true });
  const base = sanitizeFolderName(rawName);
  let name = base;
  for (let i = 2; await exists(await join(root, name)); i++) {
    name = `${base} ${i}`;
  }
  const dir = await join(root, name);
  await mkdir(dir);
  await mkdir(await join(dir, 'assets'));
  const doc = await persistBoard(dir, newBoard(name));
  return { dir, doc, repairs: [], readOnly: false, recoveredFromBackup: false };
}

/** Rename = rename the folder; the doc's display name follows. */
export async function renameBoard(dir: string, rawName: string): Promise<string> {
  const root = await boardsRoot();
  const base = sanitizeFolderName(rawName);
  let name = base;
  for (let i = 2; await exists(await join(root, name)); i++) {
    name = `${base} ${i}`;
  }
  const next = await join(root, name);
  await rename(dir, next);
  return next;
}

/** Delete = move the whole folder to the system Trash. */
export async function deleteBoard(dir: string): Promise<void> {
  await trashPath(dir);
}
