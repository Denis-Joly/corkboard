import { confirm } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardSummary } from '../persistence/boardsRepo';
import { discoverBoards } from '../persistence/boardsRepo';
import {
  createAndOpenBoard,
  deleteBoardDir,
  openBoardDir,
  renameBoardDir,
} from '../persistence/bootstrap';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { BoardPreview } from './BoardPreview';

/**
 * ⌘O overlay: type-to-filter board list with live SVG previews.
 * Create (⌘N / button), rename, delete-to-Trash.
 */
export function BoardSwitcher() {
  const open = useUiStore((s) => s.switcherOpen);
  if (!open) return null;
  return <SwitcherPanel />;
}

function SwitcherPanel() {
  const currentDir = useBoardStore((s) => s.boardDir);
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => useUiStore.getState().setSwitcherOpen(false);

  const refresh = useCallback(async () => {
    try {
      setBoards(await discoverBoards());
    } catch (err) {
      useUiStore.getState().pushToast(`Couldn't list boards: ${String(err)}`);
      setBoards([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    inputRef.current?.focus();
  }, [refresh]);

  const shown = (boards ?? []).filter((b) =>
    b.doc.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const createFromFilter = async () => {
    const name = filter.trim() || 'Untitled Board';
    close();
    try {
      await createAndOpenBoard(name);
    } catch (err) {
      useUiStore.getState().pushToast(`Couldn't create the board: ${String(err)}`);
    }
  };

  return (
    <div className="switcher-backdrop" onClick={close}>
      <div
        className="switcher"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      >
        <input
          ref={inputRef}
          className="switcher-filter"
          placeholder="Find or create a board…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (shown.length > 0) {
                close();
                void openBoardDir(shown[0].dir);
              } else {
                void createFromFilter();
              }
            }
          }}
        />
        <div className="switcher-list">
          {boards === null && <div className="switcher-hint">Loading…</div>}
          {boards !== null && shown.length === 0 && (
            <div className="switcher-hint">
              {filter.trim() ? 'No matches — press Enter to create it.' : 'No boards yet.'}
            </div>
          )}
          {shown.map((b) =>
            renaming === b.dir ? (
              <RenameRow
                key={b.dir}
                board={b}
                onDone={async (newName) => {
                  setRenaming(null);
                  if (!newName || newName === b.doc.name) return;
                  try {
                    // Flushes + retargets first when it's the open board
                    // — a bare folder rename would strand pending saves.
                    await renameBoardDir(b.dir, newName);
                    await refresh();
                  } catch (err) {
                    useUiStore.getState().pushToast(`Rename failed: ${String(err)}`);
                  }
                }}
              />
            ) : (
              <div
                key={b.dir}
                className={`switcher-row ${b.dir === currentDir ? 'is-current' : ''}`}
                onClick={() => {
                  close();
                  if (b.dir !== currentDir) void openBoardDir(b.dir);
                }}
              >
                <BoardPreview doc={b.doc} />
                <div className="switcher-meta">
                  <span className="switcher-name">{b.doc.name}</span>
                  <span className="switcher-date">
                    {new Date(b.doc.modifiedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {b.doc.cards.length} card{b.doc.cards.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="switcher-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" title="Rename" onClick={() => setRenaming(b.dir)}>
                    ✎
                  </button>
                  <button
                    type="button"
                    title="Move to Trash"
                    onClick={async () => {
                      const ok = await confirm(
                        `Move "${b.doc.name}" to the Trash? You can restore it from there.`,
                        { title: 'Delete board', kind: 'warning' },
                      );
                      if (!ok) return;
                      try {
                        await deleteBoardDir(b.dir);
                        await refresh();
                      } catch (err) {
                        useUiStore.getState().pushToast(`Delete failed: ${String(err)}`);
                      }
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
        <button type="button" className="switcher-create" onClick={() => void createFromFilter()}>
          + New board {filter.trim() ? `“${filter.trim()}”` : ''} <kbd>⌘N</kbd>
        </button>
      </div>
    </div>
  );
}

function RenameRow({
  board,
  onDone,
}: {
  board: BoardSummary;
  onDone: (name: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="switcher-row">
      <BoardPreview doc={board.doc} />
      <input
        ref={ref}
        className="switcher-rename"
        defaultValue={board.doc.name}
        onBlur={(e) => onDone(e.currentTarget.value.trim() || null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone(e.currentTarget.value.trim() || null);
          if (e.key === 'Escape') onDone(null);
          e.stopPropagation();
        }}
      />
    </div>
  );
}
