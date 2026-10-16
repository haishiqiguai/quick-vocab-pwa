import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { acquireStudyScreenAwake, type ScreenAwakePluginContract, useStudyScreenAwake } from './screenAwake';

function createFakePlugin() {
  const calls: string[] = [];
  let finishKeepAwake: (() => void) | undefined;
  const plugin: ScreenAwakePluginContract = {
    keepAwake: () => {
      calls.push('keep');
      return new Promise<void>((resolve) => { finishKeepAwake = resolve; });
    },
    allowSleep: async () => { calls.push('allow'); }
  };
  return { calls, plugin, finishKeepAwake: () => finishKeepAwake?.() };
}

describe('study screen awake lifecycle', () => {
  it('does not call the native plugin on the web', async () => {
    const fake = createFakePlugin();

    const lease = acquireStudyScreenAwake(false, fake.plugin);
    await lease.release();

    expect(fake.calls).toEqual([]);
  });

  it('keeps the Android study screen awake until the lease is released', async () => {
    const fake = createFakePlugin();

    const lease = acquireStudyScreenAwake(true, fake.plugin);
    expect(fake.calls).toEqual(['keep']);
    fake.finishKeepAwake();
    await lease.release();

    expect(fake.calls).toEqual(['keep', 'allow']);
  });

  it('waits for a pending keep call before allowing sleep and releases only once', async () => {
    const fake = createFakePlugin();

    const lease = acquireStudyScreenAwake(true, fake.plugin);
    const firstRelease = lease.release();
    const secondRelease = lease.release();
    expect(fake.calls).toEqual(['keep']);
    fake.finishKeepAwake();
    await Promise.all([firstRelease, secondRelease]);

    expect(fake.calls).toEqual(['keep', 'allow']);
  });

  it('holds one lease for the mounted Android study page and releases it on unmount', async () => {
    const calls: string[] = [];
    const plugin: ScreenAwakePluginContract = {
      keepAwake: async () => { calls.push('keep'); },
      allowSleep: async () => { calls.push('allow'); }
    };

    const { rerender, unmount } = renderHook(
      ({ nativeAndroid }) => useStudyScreenAwake(nativeAndroid, plugin),
      { initialProps: { nativeAndroid: true } }
    );
    rerender({ nativeAndroid: true });
    expect(calls).toEqual(['keep']);
    unmount();

    await waitFor(() => expect(calls).toEqual(['keep', 'allow']));
  });

  it('does not let an older release cancel a newer Android study-page lease', async () => {
    const calls: string[] = [];
    const keepResolvers: Array<() => void> = [];
    const plugin: ScreenAwakePluginContract = {
      keepAwake: () => {
        calls.push('keep');
        return new Promise<void>((resolve) => keepResolvers.push(resolve));
      },
      allowSleep: async () => { calls.push('allow'); }
    };

    const olderLease = acquireStudyScreenAwake(true, plugin);
    const olderRelease = olderLease.release();
    const newerLease = acquireStudyScreenAwake(true, plugin);
    keepResolvers[0]();
    await olderRelease;

    expect(calls).toEqual(['keep', 'keep']);
    keepResolvers[1]();
    await newerLease.release();
    expect(calls).toEqual(['keep', 'keep', 'allow']);
  });
});
