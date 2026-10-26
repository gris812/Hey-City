import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ExplorationWakeLock } from './explorationWakeLock';

let nextWakeTag = 0;

export function useExplorationKeepAwake(enabled: boolean): void {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const lock = useRef<ExplorationWakeLock | null>(null);
  useEffect(() => {
    const tag = `hey-city-foreground-exploration-${++nextWakeTag}`;
    const current = new ExplorationWakeLock({
      activate: () => activateKeepAwakeAsync(tag), deactivate: () => deactivateKeepAwake(tag),
      failed: () => console.warn('native_keep_awake_failed'),
    });
    lock.current = current;
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { subscription.remove(); lock.current = null; void current.dispose(); };
  }, []);
  useEffect(() => { void lock.current?.setEnabled(enabled && foreground); }, [enabled, foreground]);
}
