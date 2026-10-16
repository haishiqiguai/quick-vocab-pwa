import { registerPlugin } from '@capacitor/core';
import { useEffect } from 'react';

export interface ScreenAwakePluginContract {
  keepAwake(): Promise<void>;
  allowSleep(): Promise<void>;
}

export interface ScreenAwakeLease {
  release(): Promise<void>;
}

export const ScreenAwake = registerPlugin<ScreenAwakePluginContract>('ScreenAwake');

let latestNativeLeaseId = 0;

export function acquireStudyScreenAwake(
  nativeAndroid: boolean,
  plugin: ScreenAwakePluginContract = ScreenAwake
): ScreenAwakeLease {
  if (!nativeAndroid) return { release: async () => undefined };

  const leaseId = ++latestNativeLeaseId;
  const acquired = plugin.keepAwake().catch(() => undefined);
  let released: Promise<void> | undefined;
  return {
    release() {
      released ??= acquired
        .then(() => leaseId === latestNativeLeaseId ? plugin.allowSleep() : undefined)
        .catch(() => undefined);
      return released;
    }
  };
}

export function useStudyScreenAwake(
  nativeAndroid: boolean,
  plugin: ScreenAwakePluginContract = ScreenAwake
): void {
  useEffect(() => {
    const lease = acquireStudyScreenAwake(nativeAndroid, plugin);
    return () => { void lease.release(); };
  }, [nativeAndroid, plugin]);
}
