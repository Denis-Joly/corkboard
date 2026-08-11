import { describe, expect, it } from 'vitest';
import { newBoard, newTextCard } from '../../model/factories';
import * as ops from '../../model/ops';
import { isFrameCard } from '../../model/schema';
import { buildEdges, buildNodes, type UiSnapshot } from '../adapter';

function emptyUi(patch: Partial<UiSnapshot> = {}): UiSnapshot {
  return {
    selection: new Set(),
    edgeSelection: new Set(),
    editingCardId: null,
    editingEdgeId: null,
    transient: new Map(),
    measured: new Map(),
    draftCard: null,
    pendingImports: new Map(),
    ...patch,
  };
}

function framedBoard() {
  let doc = newBoard('Adapter');
  const a = newTextCard({ x: 0, y: 0, z: 10 }, 'A');
  const b = newTextCard({ x: 300, y: 0, z: 20 }, 'B');
  doc = ops.addCards(doc, [a, b]);
  return ops.frameCards(doc, [a.id, b.id]);
}

describe('frame adapter', () => {
  it('keeps the frame under its contents and invalidates the cache when effective z changes', () => {
    const framed = framedBoard();
    const frame = framed.frame!;
    const frameRaised = ops.bringToFront(framed.doc, [frame.id]);
    const firstNodes = buildNodes(frameRaised, emptyUi());
    const firstFrame = firstNodes.find((n) => n.id === frame.id)!;
    const memberIds = frameRaised.cards.filter((c) => !isFrameCard(c)).map((c) => c.id);

    const raised = ops.bringToFront(frameRaised, memberIds);
    const nextNodes = buildNodes(raised, emptyUi());
    const nextFrame = nextNodes.find((n) => n.id === frame.id)!;
    const memberNodes = nextNodes.filter((n) => n.id !== frame.id);

    expect(nextFrame.zIndex).toBeLessThan(Math.min(...memberNodes.map((n) => n.zIndex ?? 0)));
    expect(nextFrame).not.toBe(firstFrame);
  });

  it('keeps frame height fixed while its title is edited', () => {
    const framed = framedBoard();
    const frame = framed.frame!;
    const node = buildNodes(framed.doc, emptyUi({ editingCardId: frame.id })).find(
      (candidate) => candidate.id === frame.id,
    )!;
    expect(node.height).toBe(frame.h);
  });

  it('marks only frame-incident strings as directional', () => {
    const framed = framedBoard();
    const frame = framed.frame!;
    const [a, b] = framed.doc.cards.filter((c) => !isFrameCard(c));
    const outside = newTextCard({ x: 700, y: 0, z: 30 }, 'Outside');
    let doc = ops.addCards(framed.doc, [outside]);
    doc = ops.connect(doc, frame.id, outside.id).doc;
    doc = ops.connect(doc, a.id, b.id).doc;
    const edges = buildEdges(doc, emptyUi());
    expect(edges.find((edge) => edge.source === frame.id)!.data!.directional).toBe(true);
    expect(edges.find((edge) => edge.source === a.id)!.data!.directional).toBe(false);
  });

  it('adds and removes directionality when an endpoint is retargeted to a frame', () => {
    const framed = framedBoard();
    const frame = framed.frame!;
    const outsideA = newTextCard({ x: 700, y: 0, z: 30 }, 'Outside A');
    const outsideB = newTextCard({ x: 1_000, y: 0, z: 40 }, 'Outside B');
    let doc = ops.addCards(framed.doc, [outsideA, outsideB]);
    const connected = ops.connect(doc, outsideA.id, outsideB.id);
    doc = connected.doc;

    const ordinaryEdge = buildEdges(doc, emptyUi()).find(
      (edge) => edge.id === connected.created!.id,
    )!;
    expect(ordinaryEdge.data!.directional).toBe(false);

    doc = ops.setConnectionEndpoint(doc, connected.created!.id, 'to', frame.id, null);
    const inflowEdge = buildEdges(doc, emptyUi()).find(
      (edge) => edge.id === connected.created!.id,
    )!;
    expect(inflowEdge.target).toBe(frame.id);
    expect(inflowEdge.data!.directional).toBe(true);
    expect(inflowEdge).not.toBe(ordinaryEdge);

    doc = ops.setConnectionEndpoint(doc, connected.created!.id, 'to', outsideB.id, null);
    const ordinaryAgain = buildEdges(doc, emptyUi()).find(
      (edge) => edge.id === connected.created!.id,
    )!;
    expect(ordinaryAgain.target).toBe(outsideB.id);
    expect(ordinaryAgain.data!.directional).toBe(false);
    expect(ordinaryAgain).not.toBe(inflowEdge);
  });
});
