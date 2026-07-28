# Corkboard

A personal corkboard / connection-map app for macOS: drop images and files onto an
infinite canvas, write notes by just double-clicking and typing, and pin ideas together
with red strings. Local-first, subscription-free, and every board is a plain folder you own.

## Why this exists

Two threads crossed one afternoon in July 2026.

The first was [a LinkedIn post questioning whether SaaS is dead](https://www.linkedin.com/posts/douglasnissinoff_im-questioning-whether-saas-is-dead-last-share-7480651457185157121-h01E/?utm_source=share&utm_medium=member_desktop&rcm=ACoAACmqA70Bt7_09OuWhMVH6g-02g6wowH2c7c).
Whatever you think of the thesis, it lands on something true for personal tools: paying
monthly rent for a place to put your own notes and images, stored in someone else's
database, in someone else's format, is a strange deal. If the app dies, your boards die
with it. It made me want to prove the counterpoint: that with today's tooling you can
build the tool you were renting, in a day, and keep the data forever.

The second thread is older: I've always wanted one of those emblematic **detective
evidence boards**: photos and index cards pinned to cork, connected with red yarn,
the kind you lean back from at 2 a.m. when the pattern finally emerges. (Movie history
buffs have [traced the trope's on-screen origins](https://movies.stackexchange.com/questions/119934/what-movie-or-show-was-the-first-to-feature-an-evidence-board);
it's younger than you'd think, but it's now the universal shorthand for *thinking with
your hands*.)

So: a corkboard of my own. Red strings included. No subscription.

## Built with Claude Code

The design, the product decisions, and every review pass are mine. The implementation
itself, across the Rust backend and the React front end, was written almost entirely by
Claude Code, Anthropic's coding agent, working from my direction over a series of
sessions. It is also the answer to the question the first thread above poses: with
today's tooling, one person can build the tool they were renting, and keep the data
forever.

## Installing it

There's no signed release yet, so building from source is the only way in for now. It
needs Node 20+, Rust 1.88+, and the Xcode command line tools.

```bash
git clone https://github.com/Denis-Joly/corkboard.git
cd corkboard
npm install
npm run tauri build
```

The build produces `Corkboard.app` under `src-tauri/target/release/bundle/macos/`, and a
`.dmg` under `src-tauri/target/release/bundle/dmg/`. Drag either into `/Applications`.

An app you compiled yourself opens straight away: macOS only quarantines files that
arrive from somewhere else. But if you carry that `.dmg` to another Mac (download,
AirDrop, cloud drive), Gatekeeper blocks the first launch, because the app isn't
notarized by Apple. The old right-click and choose Open shortcut no longer works;
Apple removed it in macOS 15. Instead, open System Settings › Privacy & Security,
scroll down to Security, click **Open Anyway** beside the message about Corkboard, and
confirm. After that it opens normally. (Equivalently, from a terminal:
`xattr -d com.apple.quarantine /Applications/Corkboard.app`.)

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
changes are picked up live, and conflicting edits are preserved as conflict copies,
never silently overwritten. Deleting anything moves it to the Trash. If this app
vanished tomorrow, your boards would still be readable JSON and ordinary files.

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
| ☰ / ⌘B | Boards sidebar · ⌘O quick-switch · ⌘N new board |

## Development

Prereqs: Node 20+, Rust 1.88+, Xcode command line tools.

```bash
npm install
npm run tauri dev      # run the app with hot reload
npm test               # model-layer tests
npm run tauri build    # produce the .app bundle
node scripts/gen-fixture.mjs   # generate the 300-card perf test board
```

### Architecture in one paragraph

The document model (`src/model/`) is pure TypeScript with a versioned, forward-tolerant
JSON schema: unknown fields and card types round-trip verbatim, and damaged files are
repaired, not rejected. The canvas is React Flow v12, fully controlled, isolated behind
`src/canvas/adapter.ts` so the rendering layer can be swapped without touching user data.
Undo is structural: interactions stream transient geometry into ephemeral UI state and
commit to the document exactly once per gesture (`src/stores/history.ts`), so one gesture
is always one undo step and one scheduled save. Privileged operations (atomic saves,
copying arbitrary files into a board, Trash, pasteboard file reads) live in a small Rust
layer (`src-tauri/src/commands/`) that validates every path against `~/CorkBoards`.

### A platform note

Dragging content *out of a browser* onto the board can't work: Tauri's webview intercepts
native drags before WebKit sees them, and non-file drags arrive empty (verified at the
windowing-library source). That's why ⌘V is first-class: copy anywhere, paste here.

## License

MIT, see [LICENSE](LICENSE). Copyright (c) 2026 Denis A. Joly.
