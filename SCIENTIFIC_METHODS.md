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
