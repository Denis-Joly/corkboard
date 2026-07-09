import { useEffect } from 'react';
import {
  applyColor,
  duplicateSelection,
  nudgeSelection,
  selectAll,
} from '../stores/actions';
import { redo, undo } from '../stores/history';
import { useUiStore } from '../stores/uiStore';
import { CARD_COLORS } from '../model/schema';

function inTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target.isContentEditable
  );
}

/**
 * Global shortcuts. Anything typed into a textarea/input belongs to that
 * editor (including its native ⌘Z) — never to the board.
 * Backspace/Delete deletion and Space-pan are handled by React Flow.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (inTextInput(e.target)) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (meta && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        useUiStore.getState().setSwitcherOpen(true);
        return;
      }

      if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 16 : 1;
        const delta = {
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
        }[e.key];
        if (delta && useUiStore.getState().selection.size > 0) {
          e.preventDefault();
          nudgeSelection(delta[0], delta[1]);
        }
        return;
      }

      // Color tokens on keys 1..6 for the selection.
      if (!meta && /^[1-6]$/.test(e.key) && useUiStore.getState().selection.size > 0) {
        e.preventDefault();
        applyColor(CARD_COLORS[Number(e.key) - 1]);
        return;
      }

      if (e.key === 'Escape') {
        useUiStore.getState().clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
