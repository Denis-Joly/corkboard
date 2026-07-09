import type { ReactFlowInstance } from '@xyflow/react';
import type { CardNode, StringEdge } from './adapter';

/**
 * The live React Flow instance, set by BoardCanvas onInit. Non-React
 * modules (persistence load, drop pipeline, paste) use it for
 * screenToFlowPosition and setViewport.
 */
export const rfRef: { current: ReactFlowInstance<CardNode, StringEdge> | null } = {
  current: null,
};
