import { useEffect } from 'react';
import { pointerTargetFlow, rfRef } from '../canvas/rfInstance';
import { CARD_COLORS, STRING_COLORS } from '../model/schema';
import {
  applyColor,
  applyEdgeColor,
  createDraftAt,
  duplicateSelection,
  groupSelection,
  nudgeSelection,
  selectAll,
  ungroupSelection,
} from '../stores/actions';
import { redo, undo } from '../stores/history';
import { useUiStore } from '../stores/uiStore';
import { copySelection, pasteAtPointer } from './paste';

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
 * editor (including its native ⌘Z/⌘C/⌘V) — never to the board.
 * Backspace/Delete deletion and Space-pan are handled by React Flow.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // App-level board shortcuts work even from text inputs (e.g. ⌘N
      // inside the switcher's filter field); everything else belongs to
      // the focused editor.
      if (inTextInput(e.target) && !(meta && (key === 'n' || key === 'o'))) return;

      const ui = useUiStore.getState();

      if (meta) {
        switch (key) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            return;
          case 'c':
            e.preventDefault();
            void copySelection(false);
            return;
          case 'x':
            e.preventDefault();
            void copySelection(true);
            return;
          case 'v':
            e.preventDefault();
            void pasteAtPointer();
            return;
          case 'd':
            e.preventDefault();
            duplicateSelection();
            return;
          case 'g':
            e.preventDefault();
            if (e.shiftKey) ungroupSelection();
            else groupSelection();
            return;
          case 'a':
            e.preventDefault();
            selectAll();
            return;
          case 'o':
            e.preventDefault();
            ui.setSwitcherOpen(true);
            return;
          case 'b':
            e.preventDefault();
            ui.setSidebarOpen(!ui.sidebarOpen);
            return;
          case 'n':
            e.preventDefault();
            void import('../persistence/bootstrap').then((m) =>
              m.createAndOpenBoard('Untitled Board'),
            );
            return;
          case '=':
          case '+':
            e.preventDefault();
            void rfRef.current?.zoomIn({ duration: 120 });
            return;
          case '-':
            e.preventDefault();
            void rfRef.current?.zoomOut({ duration: 120 });
            return;
          case '0':
            e.preventDefault();
            void rfRef.current?.zoomTo(1, { duration: 160 });
            return;
          default:
            return;
        }
      }

      if (e.key === '!' || (e.shiftKey && e.key === '1')) {
        e.preventDefault();
        void rfRef.current?.fitView({ padding: 0.15, duration: 200 });
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
        if (delta && ui.selection.size > 0) {
          e.preventDefault();
          nudgeSelection(delta[0], delta[1]);
        }
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        ui.setHelpOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        if (ui.helpOpen) ui.setHelpOpen(false);
        else if (ui.switcherOpen) ui.setSwitcherOpen(false);
        // A draft whose editor lost focus would otherwise linger forever.
        else if (ui.draftCard) ui.setDraftCard(null);
        else ui.clearSelection();
        return;
      }

      // Color tokens 1..6 for the selection (strings when only strings
      // are selected; red is the default and stored as null).
      if (/^[1-6]$/.test(e.key)) {
        if (ui.selection.size > 0) {
          e.preventDefault();
          applyColor(CARD_COLORS[Number(e.key) - 1]);
          return;
        }
        if (ui.edgeSelection.size > 0) {
          e.preventDefault();
          const token = STRING_COLORS[Number(e.key) - 1];
          applyEdgeColor(token === 'red' ? null : token);
          return;
        }
      }

      // Type-to-create: a printable character with nothing selected
      // starts a note under the pointer, seeded with that character.
      if (
        e.key.length === 1 &&
        e.key !== ' ' &&
        !e.altKey &&
        !e.repeat &&
        !e.isComposing &&
        e.keyCode !== 229 && // IME composition in progress
        ui.selection.size === 0 &&
        !ui.editingCardId &&
        !ui.draftCard &&
        !ui.switcherOpen &&
        !ui.helpOpen
      ) {
        e.preventDefault();
        createDraftAt(pointerTargetFlow(), e.key);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
