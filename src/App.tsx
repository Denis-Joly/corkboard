import { useEffect } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas';
import { EmptyState } from './chrome/EmptyState';
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
      <BoardCanvas />
      <EmptyState />
      <Toasts />
    </div>
  );
}
