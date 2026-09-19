import type { JVDiagnostic } from "../lib/jv-science";

export function JVDiagnosticDetails({ diagnostic }: { diagnostic?: JVDiagnostic }) {
  if (!diagnostic) return null;
  const metrics = [
    ["Jsc (mA/cm²)", diagnostic.instrument.jsc_mA_cm2, diagnostic.reconstructed.jsc_mA_cm2],
    ["Voc (V)", diagnostic.instrument.voc_V, diagnostic.reconstructed.voc_V],
    ["Pmpp (mW/cm²)", diagnostic.instrument.pmpp_mW_cm2, diagnostic.reconstructed.pmpp_mW_cm2],
    ["FF (%)", diagnostic.instrument.ff_pct, diagnostic.reconstructed.ff_pct],
    ["PCE (%)", diagnostic.instrument.efficiency_pct, diagnostic.reconstructed.efficiency_pct],
  ] as const;
  const value = (n: number | null) => n === null ? "Unavailable" : n.toFixed(3);
  return <details>
    <summary>JV consistency · {diagnostic.quantitativeEligible ? "no severe inconsistency detected" : "quantitative interpretation restricted"}</summary>
    <p>Consistency is not calibration. Instrument values are preserved; reconstructed values use measured points without extrapolation.</p>
    <table><thead><tr><th>Metric</th><th>Instrument</th><th>Reconstructed</th></tr></thead><tbody>{metrics.map(([label, instrument, reconstructed]) => <tr key={label}><th>{label}</th><td>{value(instrument)}</td><td>{value(reconstructed)}</td></tr>)}</tbody></table>
    <p>Incident power: {value(diagnostic.reconstructed.incidentPower_mW_cm2)} mW/cm². Coverage: {diagnostic.reconstructed.coverage}.</p>
    <p>{diagnostic.conversion.voltageUnitInterpretation}. {diagnostic.conversion.currentUnitInterpretation}. {diagnostic.conversion.conversionApplied}.</p>
    <ul>{diagnostic.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
  </details>;
}
