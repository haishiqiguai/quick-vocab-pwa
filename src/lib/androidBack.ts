import { App as CapacitorApp } from '@capacitor/app';
import { useEffect } from 'react';
import { isNativeAndroid } from './platform';

export type AndroidBackHandler = () => boolean | Promise<boolean>;

export const ANDROID_EDGE_WIDTH = 24;
export const ANDROID_EDGE_DISTANCE = 64;
export const ANDROID_EDGE_MAX_VERTICAL_DRIFT = 48;

const handlers: AndroidBackHandler[] = [];

export function isAndroidEdgeStart(clientX: number, viewportWidth = window.innerWidth): boolean {
  return clientX <= ANDROID_EDGE_WIDTH || clientX >= viewportWidth - ANDROID_EDGE_WIDTH;
}

export function isCompletedAndroidEdgeGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  viewportWidth = window.innerWidth
): boolean {
  const verticalDrift = Math.abs(endY - startY);
  if (verticalDrift > ANDROID_EDGE_MAX_VERTICAL_DRIFT) return false;
  if (startX <= ANDROID_EDGE_WIDTH) return endX - startX >= ANDROID_EDGE_DISTANCE;
  if (startX >= viewportWidth - ANDROID_EDGE_WIDTH) return startX - endX >= ANDROID_EDGE_DISTANCE;
  return false;
}

export async function dispatchRegisteredAndroidBack(): Promise<boolean> {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (await handlers[index]()) return true;
  }
  return false;
}

export function useAndroidBackHandler(handler: AndroidBackHandler, enabled = true): void {
  useEffect(() => {
    if (!enabled || !isNativeAndroid()) return;
    handlers.push(handler);
    return () => {
      const index = handlers.lastIndexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    };
  }, [enabled, handler]);
}

export function installAndroidBackBridge(fallback: () => void): () => void {
  if (!isNativeAndroid()) return () => undefined;

  let start: { x: number; y: number } | undefined;
  let dispatching = false;
  let lastDispatchAt = 0;

  const dispatch = async () => {
    const now = Date.now();
    if (dispatching || now - lastDispatchAt < 350) return;
    dispatching = true;
    lastDispatchAt = now;
    try {
      if (!(await dispatchRegisteredAndroidBack())) fallback();
    } finally {
      dispatching = false;
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    start = touch && isAndroidEdgeStart(touch.clientX) ? { x: touch.clientX, y: touch.clientY } : undefined;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const origin = start;
    start = undefined;
    const touch = event.changedTouches[0];
    if (origin && touch && isCompletedAndroidEdgeGesture(origin.x, origin.y, touch.clientX, touch.clientY)) {
      void dispatch();
    }
  };
  const onTouchCancel = () => { start = undefined; };

  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });

  let removed = false;
  let removeNativeListener: (() => Promise<void>) | undefined;
  void CapacitorApp.addListener('backButton', () => { void dispatch(); }).then((listener) => {
    if (removed) void listener.remove();
    else removeNativeListener = listener.remove;
  });

  return () => {
    removed = true;
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchend', onTouchEnd, true);
    document.removeEventListener('touchcancel', onTouchCancel, true);
    void removeNativeListener?.();
  };
}

export async function minimizeAndroidApp(): Promise<void> {
  if (isNativeAndroid()) await CapacitorApp.minimizeApp();
}
