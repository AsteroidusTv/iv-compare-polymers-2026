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
measured zero is retained in the source. Analytical exclusion requires a
source-specific owner adjudication or a documented QA criterion; neither alters
the raw measurement or establishes a physical cause. Low PCE references
(<0.5%) are flagged for inspection, not adjusted.

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

## Ribbon classification

The optional ribbon filter and ribbon-based grouping classify the three
explicit references (3M-3007, 3M-3011, 3M-3012) separately. Empty entries,
`stand`, `too short`, `facing down`, and `all the length` are classified as the
standard ribbon type rather than additional ribbon types. The latter three
are preparation notes, not evidence of identical placement or processing.
Original `ribbon_raw` values remain in the sample metadata and exports so
analyses of preparation differences can revisit them. This classification is
specific to the current dataset; new unrecognized labels remain separate
until adjudicated.

## Small samples and display limits

Median is the default. Quantiles use linear interpolation at `(n−1) × p`
(Hyndman–Fan type 7), not median-of-halves. Boxplot whiskers terminate at the
outermost observed values inside Q1−1.5 IQR and Q3+1.5 IQR. All observations
remain visible. n=1 has no interval; n=2 median mode shows both observations
without an IQR. For n≥3, median and IQR accompany individual observations.

Before/post/aged plots use this same boxplot convention, with available
observations and counts reported separately at each stage. Connecting the same
cell is optional and off by default in both encapsulation views; hiding these
lines does not alter pairing or change calculations. An explicit descriptive
grouping option can combine specimens with matching recorded metadata despite
missing process/electrode information. Known formulation and batch must still
match; unknown formulation/batch remain specimen-specific, and known process
differences remain separate. This option is not evidence of process equivalence
and is recorded in the export manifest.

A separate opt-in display can pool all currently visible analysis groups within
each selected material family. It may combine batches, formulations, and
recorded processes, so the resulting median/boxplot is a descriptive overview,
not a controlled material comparison. Individual values remain visible and
export rows retain their original specimen and group provenance; the manifest
records the pooling choice and source groups. Hidden or excluded groups are not
drawn into that view.

Optional mean/95% CI uses the sample standard error and the existing two-sided
t critical table through n=30; above that it uses the normal approximation 1.96.
It is a conditional precision diagnostic, not a claim of specimen independence.
For n=2 the t multiplier is 12.706: values 60 and 120 have mean 90 and CI
approximately −291.18 to 471.18. This does not mean any cell measured 471%.
Such small-n intervals are explicitly warned about and never truncated silently.
Rendering and automatic scaling use the same interval policy. Hiding intervals
removes them from the visual scale only, not from the recorded calculations.
Automatic scales also include every displayed individual value, including
values outside the IQR. Manual viewport clipping is reported, not an exclusion.

## Outdoor sensitivity

Raw logger rows are filtered separately at irradiance ≥100/200/300 W/m²;
the daily statistic is the median. PR and Pmpp flags apply to their own metrics;
unknown/global flags remain conservative. Missing irradiance cannot support
threshold sensitivity. Duplicate sample/date sources are ambiguous, not pooled.
Bespoke owner adjudications for Outdoor PR are enumerated in the decision
registry with exact source file, sample, date, expected daily median and raw-day
count; they are excluded from PR points and reference windows, not from Pmpp.
The raw logger measurements remain unchanged, and the adjudication does not
identify the underlying instrument fault.
For daily Outdoor PR and Pmpp, an installation-day reading is provisionally
excluded from plotting and baseline calculation only when days 1 and 2 both
recover to positive, mutually similar values (ratio <1.35) and day 0 is below
25% of the smaller value. This reproducible QA screen retains the raw reading;
it does not diagnose the instrument or exclude sustained low output.
B3/B7/B14 use the first up to 3/7/14 QA-valid days, requiring at least 3;
200 W/m² and B7 remain the principal convention. Baseline days, dates and value
are retained, never optimized for a favorable trend. Relative values require a
positive baseline. Missing/zero baselines have explicit exclusion reasons.

The full-record sensitivity table intentionally ignores graph end and visual
hiding. Its last valid dates are scenario-specific, so its final differences are
not common-time causal comparisons. Figure rows obey graph end. Hiding a
threshold does not alter its statistics or analytical contributor membership.
Logger PR metrology remains unresolved. The supplemental browser artifact is
bound to compatible package hashes; unrelated imported packs cannot silently use it.
