# Scientific computation and adjudication rules

## JV validation, version 2.0.0

Numerical consistency, unit validation, acquired-range validation and experimental
validation are separate facts. Quantitative eligibility requires all four, full
photovoltaic coverage, and no source QA flag. Legacy conversion descriptions are
not validation evidence. Evidence must identify the measurement, source, reason
and version; acquired-range evidence also identifies the segment. No evidence
has been invented for the current legacy package. Its JV curves are available
only as explicitly unvalidated inspection. Inventory PCE is unaffected.

Reconstructed metrics use piecewise-linear measured J(V), a bracketed zero for
Voc and analytic maxima of V*J within each measured interval. No extrapolation,
rescaling to instrument summaries, or replacement of instrument values occurs.
PCE requires an explicit positive incident power. Missing Pin yields null PCE.

### Severe-consistency screening

A discrepancy is severe when `abs(reconstructed - instrument)` exceeds the
larger of the absolute floor and relative threshold times `abs(instrument)`:

| Metric | Relative threshold | Absolute floor |
| --- | ---: | ---: |
| Jsc | 25% | 0.5 mA/cm² |
| Voc | 10% | 0.05 V |
| Pmpp | 25% | 0.5 mW/cm² |
| FF | 20% | 5 percentage points |
| PCE | 25% | 1 percentage point |

Negative/nonfinite values are invalid. Screening upper limits are Jsc 100 mA/cm²,
Voc 5 V, FF and PCE 100%. The Jsc/Voc limits are conservative project-specific
screens, not universal physical laws. These thresholds detect large discrepancies;
they are neither uncertainty estimates nor calibration criteria, and never
numerically correct data. Missing comparable metrics remain unavailable.

## Repeated segments, version 1.0.0

At least ten aligned points and three distinct source files are required.
Comparison requires equal point count, maximum absolute voltage difference
1e-6 V and maximum current difference 5e-5 after normalising each sequence by
its own maximum absolute current. Exact, near and multiplicatively scaled
sequences are labelled separately. No interpolation, reversal or shifting is
used. Source files, not sweep counts, determine independent-file evidence.

Exact arrays are deduplicated first. Three normalised-current probes index
candidates, including adjacent quantisation bins; the complete arrays then
undergo the stated test. Deterministic representative-based clustering avoids
quadratic comparison of all sweeps and does not imply transitive pairwise
equivalence. A suspect group cannot automatically supply the principal branch.

Limitations: genuinely similar measured curves may be false positives. Different
grids, truncated copies, reversed sequences, offsets, or larger noise can evade
detection. Flat zero sequences are not classified by the normalised comparison.
A suspect status is evidence requiring adjudication, not proof of an export
residue; a non-suspect status is not proof of acquisition. Synthetic exact,
near, scaled and dissimilar cases plus audited real data are regression-tested;
no empirically calibrated false-positive/negative rate is claimed.

## Orange reference links

The historical cell-to-inventory mapping is retained. A filename must provide
both C and R, and R must equal the mapped inventory R. Missing R, contradiction,
unknown C, no candidate or multiple inventory candidates fail closed with an
explicit diagnostic. This adds validation rather than inferring new identities.
# Paired and longitudinal diagnostics (2026-09-20)

Normalization traces retain the absolute observation and its unique same-specimen
Unaged reference (or explicit Outdoor B3/B7/B14 reference rows). Duplicate
specimen/time rows are ambiguous, not additional independent specimens. A
measured zero is retained; the cause of an absent observation remains unknown
unless sourced follow-up evidence exists. Low PCE references (<0.5%) are flagged
for inspection, not adjusted.

Paired changes are computed per cell. Both mean and median of absolute and
relative changes are retained. The relative change of group means is an explicitly
different diagnostic. A zero before value remains in absolute changes but has
no relative change. Hidden paired groups retain analytical membership; explicitly
excluded groups have no aggregate summary or contributor membership.

Before/Post/Aged uses inventory Initial Eff, unique QA-valid Unaged PCE, and one
exact DH/TC time. Last common time requires a QA-valid observation for every
non-excluded selected specimen. No per-cell final-time substitution or
interpolation is performed. All stage counts and missing reasons are exported.
Ageing retention is 100 × aged/post, not post/before.

The synchronized diagnostic uses identical specimen/time grids in four panels.
QA is metric-specific; unavailable metrics remain explicit empty grid cells.
Lines break at missing grid cells. No pooled estimator or undocumented physical
independence is inferred. The shared Y viewport can be adjusted without changing
analytical rows; graph end is an analytical cutoff. Full-selection exports retain
the traces beyond this cutoff.
