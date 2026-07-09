import type { ReactFlowInstance } from '@xyflow/react';
import { pointerFlowRef } from '../stores/uiStore';
import type { CardNode, StringEdge } from './adapter';

/**
 * The live React Flow instance, set by BoardCanvas onInit. Non-React
 * modules (persistence load, drop pipeline, paste) use it for
 * screenToFlowPosition and setViewport.
 */
export const rfRef: { current: ReactFlowInstance<CardNode, StringEdge> | null } = {
  current: null,
};

/**
 * Where paste / type-to-create should land: the pointer's last flow
 * position, or the viewport center before the pointer ever entered
 * the canvas (never a misleading flow 0,0).
 */
export function pointerTargetFlow(): { x: number; y: number } {
  if (pointerFlowRef.moved) return { ...pointerFlowRef.current };
  return (
    rfRef.current?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }) ?? { x: 0, y: 0 }
  );
}
