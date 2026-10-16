# Pearl extension received from Oulaya — 16 October 2026

The five received XLSX summaries extend the former 167 h experiment to
526.65–526.67 elapsed hours. The old 1,908 rows are byte-value-identical in the
worksheet matrices; 3,324 measurements are appended, for 5,232 total observations.
No duplicate TXT intake: all 5,226 TXT data rows match their XLSX counterparts;
the two Lenzing TXT files still omit their first three initial readings.

## Sources, identity and recovery

All ten new files are archived unchanged under `data/raw/LightAgeing/Pearl_261016/`.
The original `Pearl_261001` archive is preserved, including its JV evidence.
The existing five specimen links remain unchanged (SMP2-060 to SMP2-064).
`data/decisions/light-ageing-pearl-v1.json` registers both archives' SHA-256
hashes, the prefix comparison, expected measurements and per-row exclusions.
The intake script is `scripts/update-pearl-2026-10-16.mjs`; it refuses replacement,
changed overlapping measurements, malformed summaries and TXT/XLSX disagreement.
The TXT and XLSX files in Downloads are never modified.

Before intake, the manifest and packages were backed up outside the repository
at `/tmp/pearl-20261016-backup/`. The manifest retains `previousSources` for each
specimen. To restore the old analysis, use the old manifest with its old source
entries and rebuild the package; the original source files remain available.
Do not delete the new archive while the current manifest references it.

## Filtering decision

Oulaya's accompanying message says that a concurrent experiment in the degradator
introduced noisy readings and requests filtering. Visual examination of all five
power traces and the four photodiode and temperature channels identifies five
synchronized transient episodes. The reviewed acquisition-time windows, inclusive,
are **180.30–184.90, 212.65–218.00, 242.30–245.10, 261.80–263.10 and
475.60–478.00 h**. They include adjacent recovery readings. The first and fourth
windows include transient electrical excursions that persist beyond a photodiode
spike or lack a resolved photodiode excursion; five-cell synchrony and return to
the local trajectory support their exclusion. These are reviewed interference
intervals, not a calibrated irradiance correction or a claim about a specific
physical fault at each point.

The 150 affected observations are marked `light_measurement_interference` and
remain present in raw files, processed observations, the browser pack and the
full-selection export. They are excluded from trends, references and overlays,
including when QA inspection is enabled. The existing 30 source-bound
1.5-sun/startup/recovery exclusions are rebound to the extended source only after
proving that every old row is unchanged. All five references remain source row 7.
There are **5,052 eligible observations**. Lines break at excluded readings;
there is no smoothing, temporal interpolation, clipping of low values, or
power-to-irradiance recalibration. Sparse decorative markers do not downsample lines.
The poor POE-2 cell is retained in the overview and remains excluded only from
detailed thesis interpretation, as before. Its genuine decline is preserved.

The reviewed five windows are a reasoned interpretation of the supplied message
and synchronous signals. Exact intervention times were not supplied by Oulaya;
if a later intervention log changes these boundaries, revise the explicit ledger
and regenerate, rather than silently altering raw measurements.

## Results and scope

At the actual readings nearest 500 h (within 0.027 h, without interpolation),
paired-mean Pout retention is 72.62% and 96.12% for TPO-2 cells 1/2;
9.35%, 82.40%, 82.59% for POE-2 cells 1/2/3. The run ends near 527 h.
`export-pearl-report.ts` exports the application's exact normalized traces for
the thesis; the plotting helper retains all source points and excluded gaps.

Exact comparison against the pre-intake package proves that samples, recipes,
IV files, measurements, curves and every non-Light-ageing observation are unchanged.
The existing Outdoor sensitivity bundle was rebound to the new main package only
after this equality check and registry hash verification; its analytical payload
is unchanged. No new production dependency or experiment calibration is added.
