# Calculation conventions and limitations

These describe the current software, not a claim of experimental validation.

## Observations and references

One sample identifier should represent one physical cell. Repeated acquisitions
are not independent cells. Missing values remain missing, never zero.
DH/TC retention uses a unique eligible `Unaged` observation for the same cell.
`Unaged` means post-encapsulation, pre-ageing, not pre-encapsulation.
Light-ageing retention uses the first eligible point of that cell and sweep direction.

Outdoor retention uses a median baseline over the first valid days: B7 normally
uses 3–7 days, with B3/B14 alternatives. The bundled study's preprocessing uses
an irradiance threshold of 200 W/m². Importing daily aggregates does not reprocess
raw irradiance or recreate an unavailable sensitivity bundle. Document your own
logger normalization, power units and aggregation procedure.

## Aggregates and box plots

Mean aggregation uses a 95% confidence interval when estimable; median aggregation
uses Q1–Q3. Quantiles use linear interpolation, **type 7**: for sorted values and
percentile p, the zero-based position is `(n − 1) × p`. Interpolate between its
neighbours. The median uses p = 0.5.

Whiskers end at the extreme observations within Q1 − 1.5 × IQR and Q3 + 1.5 × IQR,
not at these fences. Individual points remain visible. Before/after groups with
fewer than three pairs show points only. An IQR is observed spread, not a confidence interval.

Relative before/after changes are calculated per paired cell, then summarized;
this differs from the relative change of group means. A zero before value has no
defined relative change. Staged comparisons may have different counts at each
stage; inspect the exported membership rather than assuming complete pairs.

## Groups, missingness and QA

Conservative grouping preserves known formulation, batch, process and electrode
differences. Explicit pooling is descriptive, not an isolated causal material
comparison. Contributing cells may change across durations; counts and provenance
remain in the figure exports. Identifiers alone do not establish independence.

Source flags and plausibility/history checks exclude observations by default.
Flagged values remain available for inspection. A flag is not proof of error;
a plausible value is not proof of calibration. This checkout also contains
source-specific exclusions for the bundled study, not universal laboratory rules.

## JV and presentation

JV inspection connects measured points without smoothing. Unit, acquired-range,
numerical-consistency and experimental validation are distinct checks; a visible
curve is not necessarily quantitatively validated. Keep current sign, units,
active area and incident power explicit.

Manual axes, hidden intervals and report styling change presentation, not
calculations. Check companion CSV/manifests and clipping warnings. The application
guide supplies contextual explanations; the [case-study index](study/README.md)
contains dated laboratory assumptions and audit evidence.
