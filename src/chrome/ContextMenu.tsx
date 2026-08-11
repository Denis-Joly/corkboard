import { useEffect } from 'react';
import { isFrameCard, type AssetRef } from '../model/schema';
import { getCard } from '../model/ops';
import {
  bringSelectionToFront,
  deleteSelection,
  duplicateSelection,
  fitSelectedFrames,
  frameSelection,
  groupSelection,
  removeSelectedFrames,
  ungroupSelection,
} from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { openAsset, revealAsset } from '../tauri/opener';

export function ContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);

  useEffect(() => {
    if (!menu) return;
    // The capture-phase listener fires BEFORE any bubble-phase handler
    // on the menu itself, so it must ignore clicks inside the menu —
    // otherwise the menu unmounts mid-click and buttons never fire.
    const close = (e?: Event) => {
      const target = e?.target;
      if (target instanceof HTMLElement && target.closest('.context-menu')) return;
      useUiStore.getState().setContextMenu(null);
    };
    window.addEventListener('pointerdown', close, { capture: true });
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', close, { capture: true });
      window.removeEventListener('wheel', close);
    };
  }, [menu]);

  if (!menu) return null;
  const { doc, boardDir } = useBoardStore.getState();
  const card = getCard(doc, menu.cardId);
  if (!card) return null;
  const asset = (card as { asset?: AssetRef }).asset;
  const close = () => useUiStore.getState().setContextMenu(null);
  const toastErr = (err: unknown) => useUiStore.getState().pushToast(String(err));

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {asset && boardDir && (
        <>
          <button
            type="button"
            onClick={() => {
              close();
              void openAsset(boardDir, asset).catch(toastErr);
            }}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              void revealAsset(boardDir, asset).catch(toastErr);
            }}
          >
            Reveal in Finder
          </button>
          <hr />
        </>
      )}
      <button
        type="button"
        onClick={() => {
          close();
          duplicateSelection();
        }}
      >
        Duplicate <kbd>⌘D</kbd>
      </button>
      <button
        type="button"
        onClick={() => {
          close();
          bringSelectionToFront();
        }}
      >
        Bring to front
      </button>
      {(() => {
        const selection = useUiStore.getState().selection;
        const selected = doc.cards.filter((c) => selection.has(c.id));
        const frames = selected.filter(isFrameCard);
        if (frames.length > 0) {
          return (
            <>
              <button
                type="button"
                onClick={() => {
                  close();
                  fitSelectedFrames();
                }}
              >
                Fit frame to contents
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  removeSelectedFrames();
                }}
              >
                Remove frame, keep contents
              </button>
            </>
          );
        }
        if (selected.length >= 2) {
          const allOneGroup = selected.every(
            (c) => c.group !== undefined && c.group === selected[0].group,
          );
          return (
            <>
              <button
                type="button"
                onClick={() => {
                  close();
                  frameSelection();
                }}
              >
                Frame selection <kbd>⇧⌘F</kbd>
              </button>
              {allOneGroup ? (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    ungroupSelection();
                  }}
                >
                  Ungroup <kbd>⇧⌘G</kbd>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    groupSelection();
                  }}
                >
                  Group <kbd>⌘G</kbd>
                </button>
              )}
            </>
          );
        }
        return null;
      })()}
      <hr />
      <button
        type="button"
        className="danger"
        onClick={() => {
          close();
          deleteSelection();
        }}
      >
        Delete <kbd>⌫</kbd>
      </button>
    </div>
  );
}
