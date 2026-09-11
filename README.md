# IV Compare

Internal scientific application for comparing photovoltaic encapsulants, ageing observations, outdoor logger data, and raw IV curves.

## Scientific scope

The application supports exploratory comparison after damp heat (DH), thermal cycling (TC), outdoor exposure, or in the initial state. Following laboratory confirmation, lamination recipes are treated as the standard recipe assigned to each polymer rather than an independent comparison variable. Cu is the default electrode and the single Ag case is pooled with it. Recipe and electrode metadata remain preserved in exports for traceability; ageing protocol and metric remain explicit comparison controls.

- Mean aggregation is shown with a 95% confidence interval.
- Median aggregation is shown with an interquartile range.
- The chart can switch between one aggregate trajectory per material and every contributing sample trajectory. Individual lines retain their Excel reference and use distinct line patterns without altering the aggregate calculations.
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
