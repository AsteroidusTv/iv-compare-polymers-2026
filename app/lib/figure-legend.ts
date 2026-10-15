import type { Sample } from "./iv-data";
import { figureBatchLabel, figureCellLabel, figureFormulationLabel } from "./figure-language";
import { recordedRibbon, ribbonLabel } from "./ribbon";
import type { TrendSeries } from "../components/Charts";
import type { FigurePresentation } from "./figure-presentation";
import { figureSpecimenLabel } from "./figure-language";

/** Keep even identical recorded cell numbers distinct; never invent a missing lot. */
export function figureSpecimenLabels(samples: Sample[]): Map<string, string> {
  return new Map(samples.map(sample => {
    let label = figureSpecimenLabel(sample);
    const peers = samples.filter(peer => figureSpecimenLabel(peer) === label);
    if (peers.length > 1) {
      if (sample.electrode && peers.some(peer => peer.electrode !== sample.electrode)) label += ` · électrode ${sample.electrode}`;
      else label += ` · identifiant ${sample.sample_uid.replace(/^SMP\d*-/, "")}`;
    }
    return [sample.sample_uid, label];
  }));
}

export function publicationTrendSeries<T extends TrendSeries>(series: T[], samples: Sample[], options: FigurePresentation): T[] {
  if (options.legendMode === "materials") return series;
  const labels = figureSpecimenLabels(samples);
  const samplesByUid = new Map(samples.map(sample => [sample.sample_uid, sample]));
  const represented = series.map(item => {
    const ids = [...new Set(item.points.flatMap(point => point.members.map(member => member.sampleUid)))];
    const contributors = ids.flatMap(id => samplesByUid.has(id) ? [samplesByUid.get(id)!] : []);
    const formulations = new Set(contributors.map(figureFormulationLabel));
    const ribbons = new Set(contributors.map(recordedRibbon));
    return { item, ids, formulation: formulations.size === 1 ? [...formulations][0] : undefined,
      ribbons, metadataComplete: contributors.length === ids.length && ids.length > 0 };
  });
  // A ribbon only distinguishes comparable curves of the same formulation.
  // Differences hidden inside one pooled curve must not decorate unrelated cells.
  const ribbonComparisons = new Map<string, Set<string | null>>();
  for (const entry of represented) {
    if (!entry.formulation || !entry.metadataComplete || entry.ribbons.size !== 1) continue;
    const ribbons = ribbonComparisons.get(entry.formulation) ?? new Set<string | null>();
    ribbons.add([...entry.ribbons][0]); ribbonComparisons.set(entry.formulation, ribbons);
  }
  return represented.map(({ item, ids, formulation }) => {
    const specimen = ids.length === 1 ? labels.get(ids[0]) : undefined;
    const sample = ids.length === 1 ? samplesByUid.get(ids[0]) : undefined;
    const showRibbon = options.ribbonLabels === "always" || !!formulation && (ribbonComparisons.get(formulation)?.size ?? 0) > 1;
    const ribbon = showRibbon && sample ? ` · ${ribbonLabel(recordedRibbon(sample))}` : "";
    const direction = item.exportLabel?.match(/ · (aller|retour|moyenne aller\/retour)$/)?.[0] ?? "";
    return { ...item, exportLegendKey: item.id, exportLabel: specimen ? `${specimen}${ribbon}${direction}` : item.exportLabel };
  });
}

export function ribbonLabelsDistinguish(samples: Sample[], mode: FigurePresentation["ribbonLabels"]) {
  return mode === "always" || new Set(samples.map(recordedRibbon)).size > 1;
}

/** Describes recorded zeros, not a diagnosis of instrumental or physical failure. */
export function persistentZeroNotes(series: TrendSeries[], samples: Sample[]): string[] {
  const bySample = new Map<string, Map<number, number>>();
  for (const item of series) for (const point of item.points) for (const member of point.members) {
    const values = bySample.get(member.sampleUid) ?? new Map<number, number>();
    values.set(point.x, member.value); bySample.set(member.sampleUid, values);
  }
  const labels = figureSpecimenLabels(samples);
  return [...bySample].flatMap(([uid, values]) => {
    const ordered = [...values].sort(([a], [b]) => b - a);
    const firstNonzero = ordered.findIndex(([,value]) => value !== 0);
    const count = firstNonzero < 0 ? ordered.length : firstNonzero;
    return count >= 3 ? [`${labels.get(uid) ?? uid} : ${count} médianes journalières nulles enregistrées en fin de suivi représenté et conservées ; leur cause n’est pas établie par ces seules données.`] : [];
  });
}

/** Rename presentation, never merge analysis groups or rewrite recorded metadata. */
export function figureGroupLabels(groups: { key: string; samples: Sample[] }[], splitByRibbon = false): Map<string, string> {
  const entries = groups.map(group => {
    const formulations = [...new Set(group.samples.map(figureFormulationLabel))].sort();
    const label = `${formulations.join(" + ")} — ${figureBatchLabel(group.samples.map(sample => sample.batch_no_raw))}${splitByRibbon ? ` · ${ribbonLabel(recordedRibbon(group.samples[0]))}` : ""}`;
    return { ...group, label };
  });
  const withElectrodes = entries.map(group => {
    const peers = entries.filter(peer => peer.label === group.label);
    const electrodes = (samples: Sample[]) => [...new Set(samples.map(sample => sample.electrode || "non renseignée"))].sort().join(" / ");
    const distinguishElectrodes = new Set(peers.map(peer => electrodes(peer.samples))).size > 1;
    return { ...group, label: `${group.label}${distinguishElectrodes ? ` · électrode ${electrodes(group.samples)}` : ""}` };
  });
  return new Map(withElectrodes.map(group => {
    const peers = withElectrodes.filter(peer => peer.label === group.label);
    if (peers.length === 1) return [group.key, group.label] as const;
    const cells = (samples: Sample[]) => samples.map(figureCellLabel).sort().join(", ");
    const cellNames = cells(group.samples);
    const ambiguous = peers.filter(peer => cells(peer.samples) === cellNames).length > 1;
    const detail = ambiguous ? group.samples.map(sample => `${figureCellLabel(sample)} (${sample.sample_uid.replace(/^SMP\d*-/, "")})`).sort().join(", ") : cellNames;
    return [group.key, `${group.label} · ${detail}`] as const;
  }));
}
