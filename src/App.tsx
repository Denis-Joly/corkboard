import { useEffect } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas';
import { BoardsSidebar } from './chrome/BoardsSidebar';
import { BoardSwitcher } from './chrome/BoardSwitcher';
import { ConflictBanner } from './chrome/ConflictBanner';
import { ContextMenu } from './chrome/ContextMenu';
import { DropOverlay } from './chrome/DropOverlay';
import { EmptyState } from './chrome/EmptyState';
import { HelpOverlay } from './chrome/HelpOverlay';
import { TitleBar } from './chrome/TitleBar';
import { Toasts } from './chrome/Toasts';
import { useShortcuts } from './interactions/useShortcuts';
import { bootstrapApp } from './persistence/bootstrap';

export default function App() {
  useShortcuts();
  useEffect(() => {
    void bootstrapApp();
  }, []);

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <BoardsSidebar />
        <div className="board-area">
          <BoardCanvas />
          <EmptyState />
        </div>
      </div>
      <DropOverlay />
      <ConflictBanner />
      <BoardSwitcher />
      <HelpOverlay />
      <ContextMenu />
      <Toasts />
    </div>
  );
}
