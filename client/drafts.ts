import { useCallback, useSyncExternalStore } from "react";

// Drafts outlive a mounted panel so tab switches, disclosures and layout changes keep input.
// Keys always include the host and workspace; the plugin cleanup clears the store.
const drafts = new Map<string, unknown>();
const listeners = new Set<() => void>();
const versions = new Map<string, number>();
let generation = 0;
export function draftVersion(key: string): number {
  return versions.get(key) ?? 0;
}
export function clearDraftIfUnchanged(key: string, version: number) {
  if (draftVersion(key) === version) clearDraft(key);
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function draftKey(hostId: string, workspaceId: string, ...parts: string[]): string {
  return JSON.stringify([hostId, workspaceId, ...parts]);
}

export function clearDraft(key: string) {
  if (drafts.delete(key)) {
    versions.set(key, ++generation);
    emit();
  }
}

export function clearAllDrafts() {
  drafts.clear();
  versions.clear();
  generation++;
  emit();
}

/**
 * A draft value keyed to its exact host/workspace/record. `fallback` must be referentially
 * stable (a primitive or module constant) because it is returned as the store snapshot.
 */
export function useDraft<T>(key: string, fallback: T) {
  const value = useSyncExternalStore(
    subscribe,
    () => (drafts.has(key) ? (drafts.get(key) as T) : fallback),
    () => fallback,
  );
  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const current = drafts.has(key) ? (drafts.get(key) as T) : fallback;
      const resolved =
        typeof next === "function" ? (next as (current: T) => T)(current) : (next as T);
      drafts.set(key, resolved);
      versions.set(key, ++generation);
      emit();
    },
    [key, fallback],
  );
  const discard = useCallback(() => clearDraft(key), [key]);
  return [value, setValue, discard] as const;
}

/** A stable setter for one field of an object draft. */
export function useFieldSetter<T extends object, K extends keyof T>(
  set: (next: (current: T) => T) => void,
  field: K,
) {
  return useCallback(
    (value: T[K]) => set((current) => ({ ...current, [field]: value })),
    [set, field],
  );
}
