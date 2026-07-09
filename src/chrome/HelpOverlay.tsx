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
  ['☰ / ⌘B · ⌘O · ⌘N', 'Boards sidebar · quick-switch · new board'],
];

const NOTE_STYLES: Array<[string, string]> = [
  ['N — Note', 'A plain card with a border. The default.'],
  ['S — Sticky', 'A bolder sticky note: saturated color, larger text.'],
  [
    'H — Heading',
    'A big title sitting directly on the board — no card behind it, which is why colors don’t show. Use it to label areas; the color comes back if you switch to Note or Sticky.',
  ],
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
        <h2>Note styles (select a note, then N / S / H)</h2>
        <dl>
          {NOTE_STYLES.map(([keys, what]) => (
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
