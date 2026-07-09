import type { EdgeChange, NodeChange, Viewport } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  commitMoves,
  connectCards,
  connectToNewNote,
  createDraftAt,
  deleteById,
} from '../stores/actions';
import { SelectionToolbar } from '../chrome/SelectionToolbar';
import { scheduleViewportSave } from '../persistence/save';
import { useBoardStore, viewportRef } from '../stores/boardStore';
import { openAsset } from '../tauri/opener';
import { pointerFlowRef, useUiStore } from '../stores/uiStore';
import { buildEdges, buildNodes, type CardNode, type StringEdge } from './adapter';
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

function Canvas() {
  const doc = useBoardStore((s) => s.doc);
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
        onConnect={(conn) => {
          if (conn.source && conn.target) {
            const { duplicateOf } = connectCards(conn.source, conn.target);
            if (duplicateOf) {
              useUiStore.getState().pushToast('Those cards are already connected.');
            }
          }
        }}
        onConnectEnd={(_event, connectionState) => {
          // String dropped on empty canvas → new connected note, editing.
          if (
            !connectionState.isValid &&
            connectionState.fromNode &&
            connectionState.to &&
            !connectionState.toNode
          ) {
            connectToNewNote(connectionState.fromNode.id, connectionState.to);
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
        connectionLineStyle={{ stroke: 'var(--string-red)', strokeWidth: 2 }}
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
        <MiniMap pannable zoomable position="bottom-right" />
      </ReactFlow>
      <SelectionToolbar />
    </div>
  );
}
