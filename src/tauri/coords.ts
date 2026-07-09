/**
 * The single chokepoint for platform coordinate truth.
 *
 * Tauri drop positions are TYPED PhysicalPosition, but on macOS wry
 * passes AppKit points through unscaled — they are already logical
 * CSS pixels relative to the webview's top-left. Do NOT divide by
 * devicePixelRatio here (that halves coordinates on retina).
 *
 * tauri#10744: drop Y can arrive offset by roughly the titlebar height
 * on macOS. DROP_Y_OFFSET absorbs it in exactly one place; calibrate
 * against the final window chrome and a future Tauri fix is a
 * one-line change.
 */
import { rfRef } from '../canvas/rfInstance';

export const DROP_Y_OFFSET = 0;

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Webview drop position → flow (canvas) coordinates. */
export function dropPointToFlow(p: ScreenPoint): ScreenPoint | null {
  const rf = rfRef.current;
  if (!rf) return null;
  return rf.screenToFlowPosition({ x: p.x, y: p.y - DROP_Y_OFFSET });
}
