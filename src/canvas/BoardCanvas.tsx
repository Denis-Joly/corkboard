import type { EdgeChange, NodeChange, Viewport } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  applyNodeSelectionChanges,
  commitMoves,
  connectCards,
  connectToNewNote,
  consumeJustSelected,
  createDraftAt,
  deleteById,
  narrowSelectionTo,
} from '../stores/actions';
import { getCard } from '../model/ops';
import { SelectionToolbar } from '../chrome/SelectionToolbar';
import { scheduleViewportSave } from '../persistence/save';
import { useBoardStore, viewportRef } from '../stores/boardStore';
import { openAsset } from '../tauri/opener';
import { pointerFlowRef, useUiStore } from '../stores/uiStore';
import { anchorsOnCard, pointInRect, snapAnchor, takePendingFreeAnchor } from './anchors';
import { buildEdges, buildNodes, type CardNode, type StringEdge } from './adapter';
import { fractionInRect, type Rect } from './edges/floating';
import { StringConnectionLine } from './edges/StringConnectionLine';
import { StringEdgeComponent } from './edges/StringEdge';
import { FileNode } from './nodes/FileNode';
import { ImageNode } from './nodes/ImageNode';
import { SkeletonNode } from './nodes/SkeletonNode';
import { TextNode } from './nodes/TextNode';
import { UnknownNode } from './nodes/UnknownNode';
import { rfRef } from './rfInstance';

// Module-level registries — never recreated, so React Flow never
// re-mounts node components (the classic performance trap).
const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  file: FileNode,
  unknown: UnknownNode,
  skeleton: SkeletonNode,
};
const edgeTypes = {
  string: StringEdgeComponent,
};

export function BoardCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}

/**
 * While Option is held, the full-card free source handles come alive
 * (CSS-only via a body class — no React render of 300 nodes for a
 * modifier key). blur/visibilitychange clear it so Cmd-Tab with Option
 * held can never strand the class and make cards ungrabbable.
 */
function useAltConnect() {
  useEffect(() => {
    const CLASS = 'alt-connect';
    const sync = (on: boolean) => document.body.classList.toggle(CLASS, on);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') sync(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') sync(false);
    };
    const off = () => sync(false);
    // Extra guard: re-sync from the live modifier state on every move,
    // so a keyup swallowed by the OS can't leave the class stuck.
    const onPointerMove = (e: PointerEvent) => {
      if (document.body.classList.contains(CLASS) !== e.altKey) sync(e.altKey);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', off);
    document.addEventListener('visibilitychange', off);
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', off);
      document.removeEventListener('visibilitychange', off);
      window.removeEventListener('pointermove', onPointerMove);
      sync(false);
    };
  }, []);
}

function Canvas() {
  const doc = useBoardStore((s) => s.doc);
  useAltConnect();
  const ui = useUiStore(
    useShallow((s) => ({
      selection: s.selection,
      edgeSelection: s.edgeSelection,
      editingCardId: s.editingCardId,
      editingEdgeId: s.editingEdgeId,
      transient: s.transient,
      measured: s.measured,
      draftCard: s.draftCard,
      pendingImports: s.pendingImports,
    })),
  );

  const nodes = useMemo(() => buildNodes(doc, ui), [doc, ui]);
  const edges = useMemo(() => buildEdges(doc, ui), [doc, ui]);

  // The viewport at mount; later board loads call rfRef.setViewport.
  const initialViewport = useRef<Viewport>(doc.viewport).current;

  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    const state = useUiStore.getState();
    // Select changes are batched and routed through the group-aware
    // expansion (selecting one member selects the whole group).
    const selectChanges: { id: string; selected: boolean }[] = [];
    for (const change of changes) {
      switch (change.type) {
        case 'position':
          if (change.position) {
            state.setTransient(change.id, { x: change.position.x, y: change.position.y });
          }
          break;
        case 'dimensions':
          if (change.dimensions) {
            // Echo measurements into ui state (React Flow needs them
            // back on the node to keep handle bounds), and stream live
            // NodeResizer geometry as transient.
            state.setMeasured(change.id, change.dimensions);
            if (change.resizing) {
              state.setTransient(change.id, {
                w: change.dimensions.width,
                h: change.dimensions.height,
              });
            }
          }
          break;
        case 'select':
          selectChanges.push({ id: change.id, selected: change.selected });
          break;
        default:
          break;
      }
    }
    applyNodeSelectionChanges(selectChanges);
  }, []);

  // Group drag: React Flow collects its drag set from its own node
  // state, which can miss groupmates whose selection expanded in the
  // same pointerdown (the controlled-props round-trip races the first
  // drag frame). Extras — selected cards RF is not dragging — are
  // frozen at drag start and mirrored by delta, so exactly one writer
  // owns each card per gesture.
  const dragExtras = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragLeader = useRef<{ x: number; y: number } | null>(null);

  const onEdgesChange = useCallback((changes: EdgeChange<StringEdge>[]) => {
    const state = useUiStore.getState();
    for (const change of changes) {
      if (change.type === 'select') {
        state.applySelectionChange(change.id, change.selected, 'edge');
      }
    }
  }, []);

  return (
    <div
      className="board-canvas"
      onPointerMove={(e) => {
        const rf = rfRef.current;
        if (rf) {
          pointerFlowRef.current = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          pointerFlowRef.moved = true;
        }
      }}
      onDoubleClick={(e) => {
        // Double-click on empty canvas → a note, already in edit mode.
        const target = e.target as HTMLElement;
        if (!target.classList.contains('react-flow__pane')) return;
        const state = useUiStore.getState();
        const pos = rfRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        if (pos && !state.draftCard && !state.editingCardId) {
          createDraftAt(pos);
        }
      }}
    >
      <ReactFlow<CardNode, StringEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => {
          rfRef.current = instance;
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={(_e, node, draggedNodes) => {
          const d = useBoardStore.getState().doc;
          const draggedIds = new Set(draggedNodes.map((n) => n.id));
          const extras = new Map<string, { x: number; y: number }>();
          for (const id of useUiStore.getState().selection) {
            if (draggedIds.has(id)) continue;
            const card = getCard(d, id);
            if (card) extras.set(id, { x: card.x, y: card.y });
          }
          dragExtras.current = extras;
          const leader = getCard(d, node.id);
          dragLeader.current = leader ? { x: leader.x, y: leader.y } : null;
        }}
        onNodeDrag={(_e, node) => {
          const leader = dragLeader.current;
          if (!leader || dragExtras.current.size === 0) return;
          const dx = node.position.x - leader.x;
          const dy = node.position.y - leader.y;
          const state = useUiStore.getState();
          for (const [id, start] of dragExtras.current) {
            state.setTransient(id, { x: start.x + dx, y: start.y + dy });
          }
        }}
        onNodeDragStop={(_e, _node, draggedNodes) => {
          commitMoves([...draggedNodes.map((n) => n.id), ...dragExtras.current.keys()]);
          dragExtras.current = new Map();
          dragLeader.current = null;
        }}
        onSelectionDragStop={(_e, draggedNodes) => {
          // Dragging the rubber-band selection rectangle bypasses
          // onNodeDragStop; without this the transients never commit.
          commitMoves(draggedNodes.map((n) => n.id));
        }}
        onNodeClick={(e, node) => {
          // Second plain click on a member of a fully selected group
          // narrows to that card (the selecting click itself must not).
          if (e.metaKey || e.shiftKey) return;
          if (consumeJustSelected(node.id)) return;
          narrowSelectionTo(node.id);
        }}
        onNodeDoubleClick={(_e, node) => {
          const card = node.data.card;
          if (card.type === 'text' && !node.data.isDraft) {
            useUiStore.getState().setEditingCard(node.id);
            return;
          }
          // Image/file cards: open with the system default app.
          const boardDir = useBoardStore.getState().boardDir;
          const asset = (card as { asset?: import('../model/schema').AssetRef }).asset;
          if (boardDir && asset?.path) {
            void openAsset(boardDir, asset).catch((err) =>
              useUiStore.getState().pushToast(`Couldn't open: ${String(err)}`),
            );
          }
        }}
        onConnectEnd={(event, connectionState) => {
          // Connection creation lives here (not onConnect) because only
          // the end event carries the pointer, and the drop point decides
          // the pin. NOTE: connectionState.to is NOT flow coords —
          // convert the pointer's client position ourselves.
          const pending = takePendingFreeAnchor();
          const fromAnchor =
            connectionState.fromHandle?.id === 'free' ? pending : null;
          const cx = 'clientX' in event ? event.clientX : event.changedTouches?.[0]?.clientX;
          const cy = 'clientY' in event ? event.clientY : event.changedTouches?.[0]?.clientY;
          const pos =
            cx != null && cy != null
              ? rfRef.current?.screenToFlowPosition({ x: cx, y: cy })
              : undefined;
          const from = connectionState.fromNode;
          const to = connectionState.toNode;

          if (connectionState.isValid && from && to) {
            // Precision when you aim, forgiveness when you don't: a drop
            // genuinely INSIDE the card pins the string there; a drop
            // that only reached the card via connectionRadius snapping
            // expresses no placement intent and stays floating.
            let toAnchor = null;
            const rect: Rect = {
              x: to.internals.positionAbsolute.x,
              y: to.internals.positionAbsolute.y,
              w: to.measured?.width ?? to.width ?? 0,
              h: to.measured?.height ?? to.height ?? 0,
            };
            if (pos && rect.w > 0 && rect.h > 0 && pointInRect(rect, pos)) {
              const zoom = rfRef.current?.getViewport().zoom ?? 1;
              toAnchor = snapAnchor(
                fractionInRect(rect, pos),
                rect,
                anchorsOnCard(useBoardStore.getState().doc, to.id),
                zoom,
              );
            }
            const { duplicateOf } = connectCards(from.id, to.id, { fromAnchor, toAnchor });
            if (duplicateOf) {
              useUiStore.getState().pushToast('Those cards are already connected.');
            }
            return;
          }

          // String dropped on empty canvas → new connected note, editing.
          // A deliberately placed start pin (Option-drag) is forwarded.
          if (!connectionState.isValid && from && !to && pos) {
            connectToNewNote(from.id, pos, fromAnchor);
          }
        }}
        onEdgeDoubleClick={(_e, edge) => {
          useUiStore.getState().setEditingEdge(edge.id);
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          const state = useUiStore.getState();
          if (!state.selection.has(node.id)) state.setSelection([node.id]);
          state.setContextMenu({ x: e.clientX, y: e.clientY, cardId: node.id });
        }}
        connectionLineComponent={StringConnectionLine}
        connectionRadius={36}
        onDelete={({ nodes: deletedNodes, edges: deletedEdges }) => {
          deleteById(
            deletedNodes.map((n) => n.id),
            deletedEdges.map((e) => e.id),
          );
          useUiStore.getState().clearSelection();
        }}
        onViewportChange={(vp) => {
          viewportRef.current = vp;
          scheduleViewportSave();
        }}
        defaultViewport={initialViewport}
        // --- Figma hands on a mac trackpad ---
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag={[1, 2]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        minZoom={0.08}
        maxZoom={4}
        // Culling would unmount a live editor that pans out of view and
        // silently discard the typed text — suspend it while editing.
        onlyRenderVisibleElements={
          ui.editingCardId === null && ui.draftCard === null && ui.editingEdgeId === null
        }
        // Our arrow-key nudge owns keyboard movement; RF's built-in
        // focused-node arrows would race it and strand transient state.
        nodesFocusable={false}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionMode={'loose' as never}
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1.5}
          color="var(--canvas-dot)"
        />
        <MiniMap pannable zoomable position="bottom-right" />
      </ReactFlow>
      <SelectionToolbar />
    </div>
  );
}
