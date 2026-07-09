import type { EdgeChange, NodeChange, Viewport } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  commitMoves,
  connectCards,
  createDraftAt,
  deleteById,
} from '../stores/actions';
import { scheduleViewportSave } from '../persistence/save';
import { useBoardStore, viewportRef } from '../stores/boardStore';
import { pointerFlowRef, useUiStore } from '../stores/uiStore';
import { buildEdges, buildNodes, type CardNode, type StringEdge } from './adapter';
import { StringEdgeComponent } from './edges/StringEdge';
import { FileNode } from './nodes/FileNode';
import { ImageNode } from './nodes/ImageNode';
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

function Canvas() {
  const doc = useBoardStore((s) => s.doc);
  const ui = useUiStore(
    useShallow((s) => ({
      selection: s.selection,
      edgeSelection: s.edgeSelection,
      editingCardId: s.editingCardId,
      editingEdgeId: s.editingEdgeId,
      transient: s.transient,
      draftCard: s.draftCard,
    })),
  );

  const nodes = useMemo(() => buildNodes(doc, ui), [doc, ui]);
  const edges = useMemo(() => buildEdges(doc, ui), [doc, ui]);

  // The viewport at mount; later board loads call rfRef.setViewport.
  const initialViewport = useRef<Viewport>(doc.viewport).current;

  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    const state = useUiStore.getState();
    for (const change of changes) {
      switch (change.type) {
        case 'position':
          if (change.position) {
            state.setTransient(change.id, { x: change.position.x, y: change.position.y });
          }
          break;
        case 'dimensions':
          // Only live NodeResizer streams matter; mount-time measurements
          // are ignored — the document always owns explicit sizes.
          if (change.resizing && change.dimensions) {
            state.setTransient(change.id, {
              w: change.dimensions.width,
              h: change.dimensions.height,
            });
          }
          break;
        case 'select':
          state.applySelectionChange(change.id, change.selected, 'node');
          break;
        default:
          break;
      }
    }
  }, []);

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
        onNodeDragStop={(_e, _node, draggedNodes) => {
          commitMoves(draggedNodes.map((n) => n.id));
        }}
        onNodeDoubleClick={(_e, node) => {
          if (node.data.card.type === 'text' && !node.data.isDraft) {
            useUiStore.getState().setEditingCard(node.id);
          }
        }}
        onConnect={(conn) => {
          if (conn.source && conn.target) connectCards(conn.source, conn.target);
        }}
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
        onlyRenderVisibleElements
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
      </ReactFlow>
    </div>
  );
}
