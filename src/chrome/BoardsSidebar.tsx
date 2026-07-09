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
 * The always-there boards panel: every board with a live preview,
 * one click to switch, create/rename/delete inline. The ⌘O overlay
 * remains as the keyboard-fast path; this is the discoverable one.
 */
export function BoardsSidebar() {
  const open = useUiStore((s) => s.sidebarOpen);
  if (!open) return null;
  return <SidebarPanel />;
}

function SidebarPanel() {
  const currentDir = useBoardStore((s) => s.boardDir);
  const liveDoc = useBoardStore((s) => s.doc);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBoards(await discoverBoards());
    } catch (err) {
      useUiStore.getState().pushToast(`Couldn't list boards: ${String(err)}`);
    }
  }, []);

  // Refresh on mount, when the open board changes (switch/create/rename),
  // and when the window regains focus (boards may have synced in).
  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh, currentDir]);

  return (
    <aside className="boards-sidebar">
      <div className="sidebar-header">Boards</div>
      <div className="sidebar-list">
        {boards.map((b) => {
          const isCurrent = b.dir === currentDir;
          // The open board renders its LIVE document, so the preview
          // follows your edits instead of the last saved state.
          const doc = isCurrent ? liveDoc : b.doc;
          return (
            <div
              key={b.dir}
              className={`sidebar-row ${isCurrent ? 'is-current' : ''}`}
              onClick={() => {
                if (!isCurrent && renaming !== b.dir) void openBoardDir(b.dir);
              }}
            >
              <BoardPreview doc={doc} />
              <div className="sidebar-meta">
                {renaming === b.dir ? (
                  <RenameInput
                    initial={doc.name}
                    onDone={async (name) => {
                      setRenaming(null);
                      if (!name || name === doc.name) return;
                      try {
                        await renameBoardDir(b.dir, name);
                        await refresh();
                      } catch (err) {
                        useUiStore.getState().pushToast(`Rename failed: ${String(err)}`);
                      }
                    }}
                  />
                ) : (
                  <>
                    <span className="sidebar-name">{doc.name}</span>
                    <span className="sidebar-count">
                      {doc.cards.length} card{doc.cards.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>
              <div className="sidebar-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" title="Rename" onClick={() => setRenaming(b.dir)}>
                  ✎
                </button>
                <button
                  type="button"
                  title="Move to Trash"
                  onClick={async () => {
                    const ok = await confirm(
                      `Move "${doc.name}" to the Trash? You can restore it from there.`,
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
          );
        })}
      </div>
      <button
        type="button"
        className="sidebar-create"
        onClick={() =>
          void createAndOpenBoard('Untitled Board').catch((err) =>
            useUiStore.getState().pushToast(`Couldn't create the board: ${String(err)}`),
          )
        }
      >
        + New board
      </button>
    </aside>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="sidebar-rename"
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.currentTarget.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(e.currentTarget.value.trim() || null);
        if (e.key === 'Escape') onDone(null);
        e.stopPropagation();
      }}
    />
  );
}
