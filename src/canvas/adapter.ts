/**
 * The ejection seam: the ONLY file that knows both the document model
 * (Card/Connection) and React Flow (Node/Edge). If React Flow ever has
 * to go, this file and canvas/nodes|edges are the whole blast radius —
 * user data never migrates.
 *
 * Node/edge objects are cached per id and reused while their inputs are
 * unchanged, so React Flow's memoized components skip re-rendering
 * untouched cards even though we rebuild the arrays each store change.
 */
import type { Edge, Node } from '@xyflow/react';
import { effectiveCardZ } from '../model/ops';
import type { BoardDocument, Card, Connection } from '../model/schema';
import { isKnownCardType } from '../model/schema';
import type { TransientBox } from '../stores/uiStore';

export interface CardNodeData extends Record<string, unknown> {
  card: Card;
  isDraft?: boolean;
}
export type CardNode = Node<CardNodeData>;

export interface StringEdgeData extends Record<string, unknown> {
  connection: Connection;
  editingLabel: boolean;
  directional: boolean;
}
export type StringEdge = Edge<StringEdgeData>;

export interface UiSnapshot {
  selection: ReadonlySet<string>;
  edgeSelection: ReadonlySet<string>;
  editingCardId: string | null;
  editingEdgeId: string | null;
  transient: ReadonlyMap<string, TransientBox>;
  measured: ReadonlyMap<string, { width: number; height: number }>;
  draftCard: Card | null;
  pendingImports: ReadonlyMap<string, { x: number; y: number; name: string }>;
}

function rfType(card: Card): string {
  return isKnownCardType(card) ? card.type : 'unknown';
}

interface NodeCacheEntry {
  card: Card;
  box: TransientBox | undefined;
  measured: { width: number; height: number } | undefined;
  selected: boolean;
  editing: boolean;
  renderZ: number;
  node: CardNode;
}
const nodeCache = new Map<string, NodeCacheEntry>();

interface EdgeCacheEntry {
  connection: Connection;
  selected: boolean;
  editingLabel: boolean;
  directional: boolean;
  edge: StringEdge;
}
const edgeCache = new Map<string, EdgeCacheEntry>();

export function buildNodes(doc: BoardDocument, ui: UiSnapshot): CardNode[] {
  const nodes: CardNode[] = [];
  const liveIds = new Set<string>();

  for (const card of doc.cards) {
    liveIds.add(card.id);
    const box = ui.transient.get(card.id);
    const measured = ui.measured.get(card.id);
    const selected = ui.selection.has(card.id);
    const editing = ui.editingCardId === card.id;
    const renderZ = effectiveCardZ(doc, card);
    const cached = nodeCache.get(card.id);
    if (
      cached &&
      cached.card === card &&
      cached.box === box &&
      cached.measured === measured &&
      cached.selected === selected &&
      cached.editing === editing &&
      cached.renderZ === renderZ
    ) {
      nodes.push(cached.node);
      continue;
    }
    const node: CardNode = {
      id: card.id,
      type: rfType(card),
      position: { x: box?.x ?? card.x, y: box?.y ?? card.y },
      width: box?.w ?? card.w,
      // Only text notes auto-grow while editing; frame title edits keep
      // the boundary geometry fixed.
      height: editing && card.type === 'text' ? undefined : box?.h ?? card.h,
      // Echo the DOM-measured size back so React Flow keeps its
      // internals (handle bounds) when it re-adopts this node object.
      measured,
      zIndex: renderZ,
      selected,
      data: { card },
    };
    nodeCache.set(card.id, { card, box, measured, selected, editing, renderZ, node });
    nodes.push(node);
  }

  // Prune cache entries for cards that left the document.
  if (nodeCache.size > liveIds.size) {
    for (const id of nodeCache.keys()) {
      if (!liveIds.has(id)) nodeCache.delete(id);
    }
  }

  for (const [key, pending] of ui.pendingImports) {
    nodes.push({
      id: key,
      type: 'skeleton',
      position: { x: pending.x - 110, y: pending.y - 32 },
      width: 220,
      height: 64,
      zIndex: 999_999,
      selectable: false,
      draggable: false,
      data: { name: pending.name } as unknown as CardNodeData,
    });
  }

  if (ui.draftCard) {
    nodes.push({
      id: ui.draftCard.id,
      type: 'text',
      position: { x: ui.draftCard.x, y: ui.draftCard.y },
      width: ui.draftCard.w,
      zIndex: 1_000_000,
      selected: false,
      draggable: false,
      data: { card: ui.draftCard, isDraft: true },
    });
  }

  return nodes;
}

export function buildEdges(doc: BoardDocument, ui: UiSnapshot): StringEdge[] {
  const edges: StringEdge[] = [];
  const liveIds = new Set<string>();
  const cardTypes = new Map(doc.cards.map((card) => [card.id, card.type]));

  for (const conn of doc.connections) {
    liveIds.add(conn.id);
    const selected = ui.edgeSelection.has(conn.id);
    const editingLabel = ui.editingEdgeId === conn.id;
    const directional = cardTypes.get(conn.from) === 'frame' || cardTypes.get(conn.to) === 'frame';
    const cached = edgeCache.get(conn.id);
    if (
      cached &&
      cached.connection === conn &&
      cached.selected === selected &&
      cached.editingLabel === editingLabel &&
      cached.directional === directional
    ) {
      edges.push(cached.edge);
      continue;
    }
    const edge: StringEdge = {
      id: conn.id,
      source: conn.from,
      target: conn.to,
      type: 'string',
      selected,
      interactionWidth: 20,
      data: { connection: conn, editingLabel, directional },
    };
    edgeCache.set(conn.id, { connection: conn, selected, editingLabel, directional, edge });
    edges.push(edge);
  }

  if (edgeCache.size > liveIds.size) {
    for (const id of edgeCache.keys()) {
      if (!liveIds.has(id)) edgeCache.delete(id);
    }
  }

  return edges;
}
