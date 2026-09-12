# IV Compare

Internal scientific application for comparing photovoltaic encapsulants, ageing observations, outdoor logger data, and raw IV curves.

## Scientific scope

The application supports exploratory comparison after damp heat (DH), thermal cycling (TC), outdoor exposure, or in the initial state. Following laboratory confirmation, lamination recipes are treated as the standard recipe assigned to each polymer rather than an independent comparison variable. Cu is the default electrode and the single Ag case is pooled with it. Recipe and electrode metadata remain preserved in exports for traceability; ageing protocol and metric remain explicit comparison controls.

- Mean aggregation is shown with a 95% confidence interval.
- Median aggregation is shown with an interquartile range.
- Each material has an independent sample filter. Checked specimens are drawn as individual trajectories by default, with the material colour, distinct line patterns, stable numbering, and Excel references. Mean or median mode replaces them with one aggregate trajectory calculated from the selected subset.
- PNG and SVG exports group individual trajectories under one material legend entry and explicitly state that each line is one specimen with no aggregation; specimen identifiers remain available in the interactive application.
- The former “best value” aggregation is intentionally unavailable because it stitched different specimens into an artificial trajectory.
- Every QA-valid point remains visible. Statistical outliers are not hidden merely to improve chart scaling.
- Outdoor PR, Pmpp, and irradiance are daily medians over measurements with irradiance ≥ 200 W/m². Electrical-only files without irradiance retain median positive Pmpp with an explicit QA flag.
- Outdoor retention requires at least three valid days and uses the median of up to the first seven days. Sensitivity across 3-, 7-, and 14-day windows is reported when possible.
- A representative IV curve is closest to the median efficiency of the eligible QA-valid measurements. The user can always select an explicit measurement; the maximum efficiency is never selected automatically.

## Data and provenance

- `data/raw/IV/`: immutable `Summary_v2.xlsx` inventory (also copied as `Summary.xlsx` for the pipeline) and original solar-simulator `.xls` files through 10 September 2026.
- `data/raw/Outdoor/`: immutable logger CSV files.
- `data/processed/IV_dataset_normalise_Outdoor.xlsx`: relational inventory, matching decisions, measurement metadata, and daily Outdoor aggregates.
- `data/processed/IV_curve_points.tsv`: 1,043,400 ordered IV points.
- `data/processed/Outdoor_raw_measurements.tsv`: 203,122 traceable Outdoor measurements.
- `data/processed/normalization-protocol.json`: versioned transformation rules and scientific assumptions.
- `data/processed/IV_Compare_DOWSIL.ivpack`: compact browser package.
- `data/context/`: the publication and project presentation used as scientific context.

The browser package embeds SHA-256 provenance for the complete raw-data tree and each processed input. File-to-sample matching reasons and margins, source rows, raw daily counts, aggregation protocols, and QA flags remain available in the package or workbook.

Matching totals distinguish unresolved files from audit-only sources. Non-encapsulated and silicon reference cells, plus files already stored in laboratory `Trash` folders, remain preserved but are not counted as polymer-matching failures.

Rebuild and verify the package:

```bash
pnpm data:build
pnpm data:verify
pnpm data:verify:deep
```

`data:verify` reconciles the recorded source links and row counts, then proves that both committed `.ivpack` files are byte-for-byte reproducible. `data:verify:deep` additionally reads every raw IV workbook and Outdoor CSV and compares all 1,043,400 IV points and 203,122 Outdoor measurements with the processed values.

## Local development

Trend charts auto-fit the Y axis to the displayed series through the chosen graph end, with padding and rounded ticks; retention includes the 100% reference but no longer forces zero. Manual Y bounds persist until Auto Y is selected; invalid bounds fall back to auto with a validation message. Uncertainty intervals can be hidden without changing means, medians or tables. Manual/zoom clipping and hidden intervals are disclosed in the UI and exported figure subtitle. These display controls do not change CSV data or statistical calculations.

Lab trend QA is applied before aggregation and reference normalization. Besides source flags, the app reviews values outside the existing IV plausibility ranges and isolated dropouts: a value ≤10% of both adjacent values of the same cell/protocol/unit, with those neighbours agreeing within 35%. This is a review heuristic, not proof of measurement error. Sustained and terminal zero values are retained. The QA disclosure lists the reasons; “Include QA-flagged data” restores these observations explicitly. Raw source data are unchanged. Wide small-sample 95% confidence intervals are not QA flags and remain untruncated.

### Before / after encapsulation

The third chart tab compares PCE (`initial_efficiency_pct`, from Initial Eff) with the same cell's unique, unflagged `Unaged` observation. It uses the selected material families, independently of ageing settings and trend sample filters. Missing, non-finite, negative or ambiguous pairs are excluded; measured zero after encapsulation remains included. Formulations, batches and electrode metadata are kept separate. The exact measurement interval around encapsulation is not documented.

Box plots show linearly interpolated Q1/median/Q3 and whiskers at the extreme observations within 1.5 IQR. All points remain visible, including outliers; groups with fewer than three pairs show points only. The table reports paired mean differences in percentage points, not relative percent. The self-contained SVG export includes the method and source caveat. Older imports without initial PCE remain usable but cannot supply this comparison.

```bash
pnpm install
pnpm dev
```

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Imports are processed locally in the browser. `.ivpack` files are limited to 64 MB, workbooks to 32 MB, and point TSV files to 256 MB. Imported datasets must satisfy schema, uniqueness, referential-integrity, finite-value, curve-length, and report-count checks.

## Hestia deployment

The project uses the standard Vinext Node server and does not require Cloudflare, OpenAI Sites, D1, R2, or Wrangler. Build with `pnpm build`, run with `pnpm start`, and place the Hestia reverse proxy in front of the Node process.

The production topology, staging procedure, verification steps, and rollback commands are documented in [`DEPLOYMENT.md`](DEPLOYMENT.md).

Because the repository contains internal research data, production must protect the entire origin—including `/data/*.ivpack`—with Hestia/Nginx authentication or an equivalent access-control layer. Do not rely on hiding the download link as a security measure.
