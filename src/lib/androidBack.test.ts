import { describe, expect, it } from 'vitest';
import { isAndroidEdgeStart, isCompletedAndroidEdgeGesture } from './androidBack';

describe('Android edge back gestures', () => {
  it('accepts inward swipes from either edge', () => {
    expect(isCompletedAndroidEdgeGesture(10, 100, 80, 110, 400)).toBe(true);
    expect(isCompletedAndroidEdgeGesture(390, 100, 320, 110, 400)).toBe(true);
  });

  it('rejects central, short, outward, and strongly vertical swipes', () => {
    expect(isCompletedAndroidEdgeGesture(120, 100, 200, 100, 400)).toBe(false);
    expect(isCompletedAndroidEdgeGesture(10, 100, 60, 100, 400)).toBe(false);
    expect(isCompletedAndroidEdgeGesture(10, 100, 0, 100, 400)).toBe(false);
    expect(isCompletedAndroidEdgeGesture(390, 100, 310, 170, 400)).toBe(false);
  });

  it('reserves only the outer 24 CSS pixels', () => {
    expect(isAndroidEdgeStart(24, 400)).toBe(true);
    expect(isAndroidEdgeStart(376, 400)).toBe(true);
    expect(isAndroidEdgeStart(25, 400)).toBe(false);
    expect(isAndroidEdgeStart(375, 400)).toBe(false);
  });
});
