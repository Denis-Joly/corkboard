import { useUiStore } from '../stores/uiStore';

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className="toast"
          onClick={() => useUiStore.getState().dismissToast(t.id)}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
