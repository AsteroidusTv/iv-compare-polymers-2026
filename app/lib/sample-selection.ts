export function resolveSelectedSampleIds(availableIds: string[], requestedIds?: string[]): string[] {
  if (!requestedIds) return availableIds;
  const requested = new Set(requestedIds);
  const valid = availableIds.filter((sampleId) => requested.has(sampleId));
  return valid.length ? valid : availableIds;
}

export function toggleSelectedSampleId(
  availableIds: string[],
  requestedIds: string[] | undefined,
  sampleId: string,
): string[] | undefined {
  if (!availableIds.includes(sampleId)) return requestedIds;
  const active = resolveSelectedSampleIds(availableIds, requestedIds);
  const selected = new Set(active);

  if (selected.has(sampleId)) {
    if (selected.size === 1) return requestedIds;
    selected.delete(sampleId);
  } else {
    selected.add(sampleId);
  }

  const next = availableIds.filter((availableId) => selected.has(availableId));
  return next.length === availableIds.length ? undefined : next;
}
