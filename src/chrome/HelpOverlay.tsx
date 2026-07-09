import { useUiStore } from '../stores/uiStore';

const SHORTCUTS: Array<[string, string]> = [
  ['Double-click', 'New note (or edit a note)'],
  ['Type anywhere', 'New note under the pointer'],
  ['Drag from the red pin', 'Connect cards with a string'],
  ['⌘V', 'Paste files, images, or text'],
  ['⌘C / ⌘X / ⌘D', 'Copy / cut / duplicate cards'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['1–6', 'Color the selection'],
  ['Arrows / ⇧Arrows', 'Nudge 1px / 16px'],
  ['⌫', 'Delete selection'],
  ['Scroll / pinch', 'Pan / zoom'],
  ['Space + drag', 'Pan'],
  ['⌘+ / ⌘− / ⌘0 / ⇧1', 'Zoom in / out / 100% / fit'],
  ['⌘O / ⌘N', 'Switch / new board'],
];

export function HelpOverlay() {
  const open = useUiStore((s) => s.helpOpen);
  if (!open) return null;
  return (
    <div className="switcher-backdrop" onClick={() => useUiStore.getState().setHelpOpen(false)}>
      <div className="help-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Shortcuts</h2>
        <dl>
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="help-row">
              <dt>{keys}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
