# Corkboard

A personal corkboard / connection-map app for macOS — drop images and files onto an
infinite canvas, write notes by just double-clicking and typing, and pin ideas together
with red strings. Built as a self-owned alternative to subscription corkboard tools.

## Your data is plain files

Every board is a folder in `~/CorkBoards`:

```
~/CorkBoards/
└── Research Project/
    ├── board.json        # the whole board, human-readable
    ├── board.json.bak    # previous good save (automatic)
    └── assets/           # copies of files you dropped, content-addressed
```

Boards are fully portable and sync-safe (iCloud/Dropbox): saves are atomic, external
changes are picked up live, and conflicting edits are preserved as conflict copies —
never silently overwritten. Deleting anything moves it to the Trash.

## Using it

| Gesture | Effect |
|---|---|
| Double-click canvas (or just type) | New note, editing immediately |
| Drag files from Finder | Image/file cards under your cursor |
| ⌘V | Paste files, screenshots/images, or text |
| Drag the red pin above a card | String it to another card (drop on empty space to spawn a linked note) |
| Double-click a string | Label it |
| Scroll / pinch / Space-drag | Pan and zoom (infinite canvas) |
| 1–6 | Recolor selection · `?` shows all shortcuts |
| ⌘O / ⌘N | Switch / create boards |

## Development

Prereqs: Node 20+, Rust 1.88+, Xcode command line tools.

```bash
npm install
npm run tauri dev      # run the app with hot reload
npx vitest run         # model-layer tests
npm run tauri build    # produce the .app bundle
node scripts/gen-fixture.mjs   # generate the 300-card perf test board
```

### Architecture in one paragraph

The document model (`src/model/`) is pure TypeScript with a versioned, forward-tolerant
JSON schema — unknown fields and card types round-trip verbatim, and damaged files are
repaired, not rejected. The canvas is React Flow v12, fully controlled, isolated behind
`src/canvas/adapter.ts` so the rendering layer can be swapped without touching user data.
Undo is structural: interactions stream transient geometry into ephemeral UI state and
commit to the document exactly once per gesture (`src/stores/history.ts`), so one gesture
is always one undo step and one scheduled save. Privileged operations (atomic saves,
copying arbitrary files into a board, Trash, pasteboard file reads) live in a small Rust
layer (`src-tauri/src/commands/`) that validates every path against `~/CorkBoards`.
