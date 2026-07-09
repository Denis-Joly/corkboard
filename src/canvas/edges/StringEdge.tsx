import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/react';
import { memo, useLayoutEffect, useRef } from 'react';
import { setConnectionLabel } from '../../stores/actions';
import { useUiStore } from '../../stores/uiStore';
import type { StringEdge as StringEdgeType } from '../adapter';
import { stringPath, type Rect } from './floating';

function nodeRect(internal: ReturnType<typeof useInternalNode>): Rect | null {
  if (!internal) return null;
  const { x, y } = internal.internals.positionAbsolute;
  const w = internal.measured?.width ?? internal.width ?? 0;
  const h = internal.measured?.height ?? internal.height ?? 0;
  if (w === 0 || h === 0) return null;
  return { x, y, w, h };
}

export const StringEdgeComponent = memo(function StringEdgeComponent({
  id,
  source,
  target,
  selected,
  data,
}: EdgeProps<StringEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const a = nodeRect(sourceNode);
  const b = nodeRect(targetNode);
  if (!a || !b) return null;

  const { path, p1, p2, mid } = stringPath(a, b);
  const connection = data?.connection;
  const editing = data?.editingLabel === true;
  const label = connection?.label ?? null;
  const dashed = connection?.kind === 'dashed';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`string-edge ${selected ? 'is-selected' : ''}`}
        style={{
          stroke: 'var(--string-red)',
          strokeWidth: selected ? 3 : 2,
          strokeLinecap: 'round',
          strokeDasharray: dashed ? '6 6' : undefined,
        }}
        interactionWidth={20}
      />
      <circle className="string-pin" cx={p1.x} cy={p1.y} r={4} />
      <circle className="string-pin" cx={p2.x} cy={p2.y} r={4} />
      {(label !== null || editing) && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nopan nodrag"
            style={{
              transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
              pointerEvents: 'all',
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              useUiStore.getState().setEditingEdge(id);
            }}
          >
            {editing ? <LabelEditor edgeId={id} initial={label ?? ''} /> : <span>{label}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

function LabelEditor({ edgeId, initial }: { edgeId: string; initial: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    setConnectionLabel(edgeId, ref.current?.value ?? null);
  };

  return (
    <input
      ref={ref}
      className="edge-label-editor nodrag nowheel"
      defaultValue={initial}
      spellCheck={false}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
    />
  );
}
