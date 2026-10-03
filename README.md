# IV Compare

Internal scientific application for comparing photovoltaic encapsulants, ageing observations, outdoor logger data, and raw IV curves.

## Documentation

Open **Guide & methods** in the application (`/guide`) for the usage walkthrough,
scientific defaults, QA rules, reference choices and unresolved interpretation
limits. Contextual information buttons explain the controls directly in the
workspace. Advanced selection and scientific settings are expandable; the
active trend method remains visible above the charts.

The [documentation index](docs/README.md) points to the current scientific
methods, open laboratory questions, raw-data rebuild procedure and dated audit
records. The [deployment runbook](DEPLOYMENT.md) remains at the repository root.

## Scientific scope

The application supports exploratory comparison after damp heat (DH), thermal cycling (TC), outdoor exposure, or in the initial state. Lamination recipes are recorded as process metadata, not a causal comparison variable. Grouping preserves known formulation, batch, process and electrode differences; a separate descriptive option allows matching specimens with missing process metadata to appear together. The laboratory confirms all recorded labels, including Ag/Cu (3 October 2026); this does not establish formulation equivalence or statistical independence. Ageing protocol and metric remain explicit comparison controls.

- Mean aggregation is shown with a 95% confidence interval.
- Median aggregation is shown with an interquartile range.
- Each material has an independent sample filter. Checked specimens are drawn as individual trajectories by default, with the material colour, distinct line patterns, stable numbering, and Excel references. Mean or median mode replaces them with one aggregate trajectory calculated from the selected subset.
- PNG and SVG exports group individual trajectories under one material legend entry without printing laboratory identifiers. Aggregate legends report the contributing `N`, or its minimum–maximum range when the cohort changes with time; exact counts remain in the figure data and manifest.
- Each exportable chart also offers a separate `Report SVG` preset with serif typography, finer axes and muted material colours. It changes presentation only: data, QA exclusions, graph limits and line patterns are unchanged. The ordinary SVG and PNG exports remain available.
- The former “best value” aggregation is intentionally unavailable because it stitched different specimens into an artificial trajectory.
- Every QA-valid point remains visible. Statistical outliers are not hidden merely to improve chart scaling.
- Outdoor PR, Pmpp, and irradiance are daily medians over measurements with irradiance ≥ 200 W/m². Electrical-only files without irradiance retain median positive Pmpp with an explicit QA flag.
- Outdoor retention requires at least three valid days and uses the median of up to the first seven days. Sensitivity across 3-, 7-, and 14-day windows is reported when possible.
- A representative IV curve is closest to the median efficiency of the eligible QA-valid measurements. The user can always select an explicit measurement; the maximum efficiency is never selected automatically.

## Data and provenance

Comparison settings are saved automatically in this browser's local storage:
series and filters, selected cells, analysis/JV options, hidden groups, staged
comparison options, graph limits and manual Y scales. Refreshing restores them.
Only preferences are saved, not imported datasets. Invalid or inaccessible
storage falls back to defaults; clearing site data resets saved preferences.
Preferences are local to the browser and origin (localhost and production differ).

On this Windows workspace, the repository lives directly at
`C:\Users\Achille\Documents\TM\iv-comparator-site`. It has no dependency on
an external OneDrive import folder. Intake scripts take an explicit source
directory argument; building, verifying and running use the versioned files
inside this repository. `data/raw` keeps originals, `data/processed` keeps
derived audit inputs, and `public/data` contains the packages served to the browser.

Pearl adds **Light ageing**, with separate forward/reverse Pout metrics in
mW/cm² and first-recorded-point retention. Five A4 cells of TPO-2 / Lenzing
and POE-2 / TF4 supply 1,908 observations. See the
[source audit and normalization rules](docs/data/LIGHT_AGEING_PEARL.md).
Original files are in `data/raw/LightAgeing/`; the derived audit copy is
`data/processed/Light_ageing_Pearl.json`. These observations are loaded directly
from hashed raw summaries alongside the existing normalized workbook.

- `data/raw/IV/`: versioned inventories through `Summary_v3.xlsx` (also copied as the active `Summary.xlsx`) and original solar-simulator `.xls` files through 23 September 2026. Earlier inventories remain archived.
- `data/raw/Outdoor/`: immutable logger CSV files.
- `data/raw/FTIR/` and `data/raw/SEM/`: archived original analytical sources; not yet interpreted or included in IV/ageing graphs.
- `data/processed/IV_dataset_normalise_Outdoor.xlsx`: relational inventory, matching decisions, measurement metadata, and daily Outdoor aggregates.
- `data/processed/IV_curve_points.tsv`: 1,137,150 ordered IV points.
- `data/processed/Outdoor_raw_measurements.tsv`: 406,346 traceable Outdoor measurements through 29–30 September 2026.
- `data/processed/normalization-protocol.json`: versioned transformation rules and scientific assumptions.
- `data/processed/IV_Compare_DOWSIL.ivpack`: compact browser package.
- `data/context/`: the publication and project presentation used as scientific context.

The browser package embeds SHA-256 provenance for the complete raw-data tree and each processed input. File-to-sample matching reasons and margins, source rows, raw daily counts, aggregation protocols, and QA flags remain available in the package or workbook.

Matching totals distinguish unresolved files from audit-only sources. Non-encapsulated and silicon reference cells, plus files already stored in laboratory `Trash` folders, remain preserved but are not counted as polymer-matching failures.
The September intake added 11 A4 cells and 49 inventory observations. Of its 59 new IV files, 38 have provisional batch/material/specimen filename links, 9 aged files require identity review, and 12 Red-box pre-encapsulation files remain unlinked. These provisional links are not a laboratory adjudication. Outdoor CSVs contain no new numerical observations in this intake.

The [3 October intake](docs/data/INTAKE_2026-10-03.md) adds 203,224 Outdoor raw rows
and 1,078 daily aggregates. Eleven extended CSVs replace their historical sources
in the active analysis; eight new A1 cells have provisional filename/inventory
links. All historical sources remain archived without double counting. The 48
cell photographs and an additional research presentation are archived as context,
without invented specimen attribution. Inventory and IV curves are unchanged.

Rebuild and verify the package:

```bash
pnpm data:build
pnpm data:verify
pnpm data:verify:deep
```

`data:verify` reconciles the recorded source links and row counts, then proves that both committed `.ivpack` files are byte-for-byte reproducible. `data:verify:deep` additionally reads every raw IV workbook and active Outdoor CSV and compares all 1,137,150 IV points and 406,346 Outdoor measurements with the processed values.

## Local development

Trend charts auto-fit the Y axis to the displayed series through the chosen graph end, with padding and rounded ticks; retention includes the 100% reference but no longer forces zero. Manual Y bounds persist until Auto Y is selected; invalid bounds fall back to auto with a validation message. Uncertainty intervals can be hidden without changing means, medians or tables. Manual bounds and hidden intervals are disclosed in the UI; exports warn if values are clipped, without printing the chosen cosmetic Y range. These display controls do not change CSV data or statistical calculations.

The IV-curves view defaults to “One cell over ageing”: one material and protocol are selected, then only physical cells with QA-valid raw IV curves at two or more exact stages are offered. At least two measured stages remain selected; the default is the earliest and latest available stage. A 0 stage means the linked Unaged measurement after encapsulation, never a pre-encapsulation interpolation. Every overlaid curve belongs to the same sample UID. Multiple valid curves at one stage use the existing closest-to-median rule unless an exact measurement is chosen. Time is distinguished by line pattern while material colour remains constant. “Materials at one time” preserves the previous workflow.

Lab trend QA is applied before aggregation and reference normalization. Besides source flags, the app reviews values outside the existing IV plausibility ranges and isolated dropouts: a value ≤10% of both adjacent values of the same cell/protocol/unit, with those neighbours agreeing within 35%. This is a review heuristic, not proof of measurement error. Sustained and terminal zero values are retained. The QA disclosure lists the reasons; “Include QA-flagged data” restores these observations explicitly. Raw source data are unchanged. Wide small-sample 95% confidence intervals are not QA flags and remain untruncated.

### Before / after encapsulation

The third chart tab compares PCE (`initial_efficiency_pct`, from Initial Eff) with the same cell's unique, unflagged `Unaged` observation. It uses the selected material families, independently of ageing settings and trend sample filters. Missing, non-finite, negative or ambiguous pairs are excluded; measured zero after encapsulation remains included. Formulations, batches and electrode metadata are kept separate. The exact measurement interval around encapsulation is not documented.

Box plots show linearly interpolated Q1/median/Q3 and whiskers at the extreme observations within 1.5 IQR. All points remain visible, including outliers; groups with fewer than three pairs show points only. The table reports paired mean differences in percentage points, not relative percent. Lines connecting the same cell can be enabled but are off by default. The Before/Post/Aged diagnostic also shows stage-specific box plots when at least three observations are available; counts can differ between stages. An optional descriptive view pools currently visible groups within each selected material family, potentially combining batches, formulations and processes; the export keeps original cell and group provenance. The self-contained SVG embeds the figure manifest; the method and source caveats are also available in the companion JSON and caption. Older imports without initial PCE remain usable but cannot supply this comparison.

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
