"use client";

import { useCallback, useEffect, useState } from "react";
import { readWorkspaceValue, sameValueShape, writeWorkspaceValue } from "./workspace-storage";

/** Restore after hydration, then save. Never overwrite saved settings with SSR defaults. */
export function useWorkspaceState<T>(key: string, fallback: T, validate?: (value: unknown) => boolean) {
  const [value, setValue] = useState<T>(fallback);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [defaults] = useState(() => ({ fallback, valid: validate ?? ((candidate: unknown) => sameValueShape(candidate, fallback)) }));
  useEffect(() => {
    let restored = defaults.fallback;
    try { restored = readWorkspaceValue(window.localStorage, key, defaults.fallback, defaults.valid); } catch { /* Browser denied storage access. */ }
    // This effect deliberately synchronizes external browser preferences after SSR hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(restored);
    setReadyKey(key);
  }, [key, defaults]);
  useEffect(() => {
    if (readyKey !== key) return;
    try { writeWorkspaceValue(window.localStorage, key, value); } catch { /* Browser denied storage access. */ }
  }, [key, readyKey, value]);
  return [value, setValue] as const;
}

export function useWorkspaceSet(key: string) {
  const [items, setItems] = useWorkspaceState<string[]>(key, [], value => Array.isArray(value) && value.length <= 1000 && value.every(item => typeof item === "string"));
  const value = new Set(items);
  const setValue: React.Dispatch<React.SetStateAction<Set<string>>> = useCallback(next => setItems(current => [...(typeof next === "function" ? next(new Set(current)) : next)]), [setItems]);
  return [value, setValue] as const;
}
