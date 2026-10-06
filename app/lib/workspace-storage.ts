export const WORKSPACE_STORAGE_PREFIX = "iv-compare:workspace:v1:";

export function readWorkspaceValue<T>(storage: Pick<Storage, "getItem">, key: string, fallback: T, valid: (value: unknown) => boolean): T {
  try {
    const raw = storage.getItem(WORKSPACE_STORAGE_PREFIX + key);
    if (!raw || raw.length > 100_000) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value as T : fallback;
  } catch { return fallback; }
}

export function writeWorkspaceValue(storage: Pick<Storage, "setItem">, key: string, value: unknown): void {
  try { storage.setItem(WORKSPACE_STORAGE_PREFIX + key, JSON.stringify(value)); }
  catch { /* Disabled storage or a full quota must not break the workspace. */ }
}

export function sameValueShape(value: unknown, template: unknown): boolean {
  if (template === null) return value === null;
  if (typeof template === "number") return typeof value === "number" && Number.isFinite(value);
  if (typeof template !== "object") return typeof value === typeof template;
  if (Array.isArray(template)) return Array.isArray(value) && value.length <= 1000 && value.every(item => typeof item === "string");
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = Object.entries(template);
  if (!fields.length) return Object.entries(value).length <= 1000 && Object.values(value).every(item => item === null || typeof item === "string" || Array.isArray(item) && item.every(id => typeof id === "string"));
  return fields.every(([key, entry]) => sameValueShape((value as Record<string, unknown>)[key], entry));
}
