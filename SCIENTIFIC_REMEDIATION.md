# Scientific remediation plan

Reference commit: `7300b5cb170c2eb034a9e445ba4ede3cbeb3e22a`.
Reference pack, manifest, audit summary and successful full test/build/HTML,
typecheck, lint and deep source validation logs preserved before implementation:
`/home/achille/Documents/Projects/iv-compare-ops/scientific-reference-7300b5c-UKjOnuBh`.

## A — Demonstrated corrections

- [x] JV instrument/reconstructed consistency gate; retain original quantities.
- [x] Repeated-segment detection and exclusion from automatic primary selection.
- [x] Specimen-first JV example selection, invariant to repeated duplicate sweeps.
- [x] Explicit cohort membership and composition-change warnings.
- [x] Exact figure CSV versus full selection, JV CSV and figure manifests.
- [x] Deterministic material identity and truthful export line styles.
- [x] Outdoor recovery wording/criterion and metric-specific source flags.
- [x] Orange reference R validation.

## B — Methodological improvements

- [x] Conservative formulation/batch grouping; recipe/electrode filters.
- [x] Available/constant cohort/individual trajectories and missingness diagnostics.
- [x] Median default; small-n points; optional untruncated mean CI with warning.
- [x] Explicit baseline diagnostics, absolute metrics, Outdoor sensitivity controls.
- [x] Paired delta median/mean, date coverage, Before/Post/Aged with exact final time.
- [x] Four-metric synchronized diagnostic.
- [x] Publication preset and copyable caption.
- [x] Raw rebuild with versioned decisions, provenance and non-destructive output.

## C — Laboratory adjudication, not automatic numerical correction

- [ ] Current versus density and true surface of 12 April17 V–I files.
- [ ] Physical origin and acquired range of repeated segments.
- [ ] Specimen/pixel/substrate/channel hierarchy and batch independence.
- [ ] Equivalence of formulations, recipes and recorded Ag electrodes.
- [ ] Missing follow-up causes, measurement/storage conditions, logger PR definition.

These cases retain original data and unresolved status. A computational consistency
check is not a laboratory calibration or proof that a segment was acquired.

## Implementation gates

- [x] Scientific safety: JV provenance/metrology, selection, cohort/grouping, exports.
- [x] Statistics/views: small n, paired stages, filters, sensitivity and diagnostics.
- [x] Reproducibility: rebuild, decisions and manifests without processed circular inputs.
- [x] TM presentation: deterministic style, exact exports/captions, UI verification.

Each gate requires targeted tests before completion; complete validation and a
critical-case re-audit close the work. Commit coherent changes separately; do not
push or deploy without an explicit release request. Raw files are immutable.

## Architecture / risk decisions

Pure science belongs in app/lib, not React components. Dataset is the authoritative
source; diagnostics are derived and never overwrite instrument values. UI owns
analysis selections; export uses the same selected result and records viewport
versus analytic exclusions separately. No dependency is required for the core
calculations. New persisted metadata is additive and legacy packs remain readable.
Unknown units or identities cannot become validated merely by fitting a curve.

## Closure — 2026-09-21

A/B and all four software gates are closed. Evidence and limitations are in
SCIENTIFIC_REMEDIATION_REPORT.md, UI_VALIDATION.md and RAW_REBUILD.md.
87 unit tests, one HTML test, build, typecheck, lint and deep verification pass.
Nine browser views were exercised; two rebuilds produce the same candidate hash.
Section C remains unresolved. Native filesystem delivery of downloads in the
in-app browser is not verified; prepared contents and fallback UI are verified.
No push, deployment, raw mutation or production pack replacement was performed.

## Historical checkpoint — 2026-09-19 (superseded by closure above)

The interrupted implementation is compiling again. Forty-nine unit tests,
TypeScript, ESLint, the production build and server-rendered HTML smoke test pass.
Local browser checks loaded all 135 specimens and 5,116 sweeps, switched to
median mode and exercised silicone conservative grouping. The table now follows
the grouped/individual plotted series; the old per-duration specimen override was
removed because it could stitch different specimens into one apparent trajectory.

Trend/JV exports now have analytical CSV, JSON and SVG-embedded metadata.
Graph-end is an analytical cutoff, while viewport clipping is explicitly labelled.
CSV includes contributors or actual JV source indices, not substituted trend data.
Package identity hashes the exact imported bytes; build identity reports commit
and dirty state when Git is available, otherwise explicitly null. It does not
invent a deployment revision. Further export integration remains below.

The architecture review kept calculations in pure domain modules and diagnostics
derived from the immutable dataset. JV safety also applies to encapsulation JV
display without altering inventory PCE pairs or their date coverage.

### Historical pending work (now completed; retained for audit history)

- Fully traced normalization inputs and exclusions/reasons in every export;
  complete paired-figure manifests/CSV and release-time revision propagation.
- Extend severe-consistency checks and near-repeat detection validation; document
  detection thresholds and measure false-positive/negative limits.
- Complete missingness diagnostics, Outdoor irradiance sensitivity (100/200/300),
  Orange reference R checks and laboratory source provenance decisions.
- Paired median/individual delta controls, Before → Post → Aged and synchronized
  four-metric view; complete date-coverage and exact-time export tests.
- Non-circular raw rebuild, versioned matching/override registry, clean-room
  reconstruction/hash comparison. No raw or packaged dataset has been replaced.
- Publication/caption UI verification for every figure, complete critical-case
  re-audit and final A–G report. LAB_QUESTIONS.md records unresolved lab decisions.

This checkpoint is not a claim that phases 1–4 are complete or that all figures
are scientifically validated. Consistency checks cannot establish experimental
calibration, physical independence, acquisition provenance or causality.

High-risk boundaries: imported packs/workbooks, scientific conversions, output
formats and dataset rebuild. Preserve stable IDs, raw hashes and original values;
stage rebuilds and compare before replacing generated datasets. Rollback is the
reference commit/pack; unresolved experimental interpretations stay quarantined,
not 'fixed'. Production infrastructure is outside this implementation request.
