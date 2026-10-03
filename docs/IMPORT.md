# Import your own dataset

Imports are read locally in the browser. This is a **normalized-data import**,
not a general converter for arbitrary laboratory Excel files or logger CSVs.
Use **Import IV data** to select one package, or a workbook and TSV together.

## 1. Start with the synthetic example

Import [synthetic-ageing.ivpack](../examples/synthetic-ageing.ivpack).
It is readable JSON with invented data: two materials, three cells each,
initial PCE, unique Unaged observations and DH measurements at 100 and 500 hours.
It exercises trends and before/post/aged comparisons. It contains no JV curves,
raw Outdoor data, personal paths or laboratory records.

For your own package, copy its structure, replace identifiers and values, and
update the report counts. Do not present synthetic measurements as real results.

## 2. Package structure

`.ivpack` contains JSON, optionally gzip-compressed. Single `.json` and `.gz`
files are also accepted. Supported schema versions are `1.1` and `1.2`; use `1.2`
for new packages. JSON must have these top-level fields:

| Field | Content |
| --- | --- |
| `schemaVersion`, `name` | Version string and dataset name |
| `samples` | Cells and their grouping metadata |
| `recipes` | Process metadata; an empty array is allowed |
| `observations` | One record per cell/stage with recorded metrics |
| `files` | Source JV file metadata; may be empty |
| `measurements` | JV acquisitions; may be empty |
| `curves` | Object keyed by measurement UID, with `v` and `j` arrays; may be empty |
| `report` | Counts matching the actual records and curve points |

`report` includes `samples`, `recipes`, `observations`, `files`, `measurements`,
`points`, `matchedFiles`, `reviewFiles`; `auditFiles` is optional.
Use finite JSON numbers, not numeric strings, for measurements. Use `null` or
omit optional missing metrics; never replace missing observations with zero.

### Cell records

Use unique `sample_uid` and a `material_family` label. Recommended metadata:
`material_raw` (formulation), `batch_no_raw`, `electrode`, `sample_label`,
`recipe_uid`/`recipe_raw`, `ribbon_raw` and `assigned_test`.
Pre-encapsulation PCE is `initial_efficiency_pct` on the cell record.
Only enter known metadata; missing values can intentionally prevent conservative pooling.

### Observation records

Use unique `observation_uid`, an existing `sample_uid`, `test_type` and the
applicable metrics. Use protocol labels `Unaged`, `DH`, `TC`, `Outdoor`, or
`Light ageing`. `exposure_duration_numeric` is a number; units are `h` for DH,
`cycles` for TC and `days` for Outdoor. The paired comparison requires a unique
eligible `Unaged` PCE for the same cell, after encapsulation and before ageing.

| Metric field | Expected unit |
| --- | --- |
| `efficiency_pct`, `ff_pct` | Percent, e.g. 17.5, not 0.175 |
| `jsc_mA_cm2` | mA/cm² |
| `voc_V` | V |
| `outdoor_pr_pct` | Percent; document the logger normalization |
| `outdoor_pmpp_W` | W as labelled by the software; verify/convert your own raw units |
| `outdoor_irradiance_W_m2` | W/m² |
| `light_pout_forward_mW_cm2`, `light_pout_reverse_mW_cm2` | mW/cm²; keep directions separate |

Optional provenance includes `source_file`, `source_row`, `aggregation_protocol`
and `data_quality_flag`. Avoid absolute personal paths in a public package.
The package example omits acquisition curves rather than fabricating validation evidence.

### JV records

Each measurement needs a unique `measurement_uid` and an existing `file_uid`.
Linked sample UIDs must exist. Files and measurements include `match_status`
(e.g. `matched_high` for an established link). Preserve the basis for your links;
the status itself does not establish experimental validity.

`curves[measurement_uid]` has equally sized voltage/current-density arrays,
`v` in V and `j` in mA/cm², in original acquisition order. Preserve current sign
and document conventions; do not negate raw arrays just to make the graph positive.
If supplied, `point_count` must equal the array length. The report's point count
is the sum of included measurement curve lengths. Units, acquired range and
experimental validation remain separate from numerical consistency.

## 3. Normalized Excel + TSV

Select both files at once. The workbook requires these exact sheet names:

| Sheet | Key columns |
| --- | --- |
| `Samples` | `sample_uid`, `material_family`; optional cell metadata above |
| `Recipes` | `recipe_uid`, optional `recipe_raw`, `laminator` and process fields |
| `Inventory_Obs` | `observation_uid`, `sample_uid`, `test_type`, exposure and metric columns |
| `IV_Files` | `file_uid`, `sample_uid`, `match_status`, optional source/stage metadata |
| `IV_Measurements` | `measurement_uid`, `file_uid`, `sample_uid`, `match_status`, metrics and `point_count` |

Even when unused, required sheets must exist; include their headers and no rows.
The optional `Outdoor_Daily` sheet uses `outdoor_daily_uid`, `sample_uid`,
`exposure_days`, `performance_ratio_pct_median`, `pmpp_W_daylight_median`,
`irradiance_W_m2_daylight_median`, and optional QA/provenance fields.
These are already aggregated daily values, not raw logger rows. The workbook
parser does not import Light-ageing Pout or structured JV validation evidence;
use a schema-1.2 package when those fields are required.

The TSV header must contain these exact, tab-separated columns:

```text
measurement_uid	voltage_V	generated_current_density_mA_cm2
```

Each following row is one acquired point. Keep rows in acquisition order within
each measurement. A header-only TSV accompanies a workbook without JV curves.
The current parser accepts these legacy column names; the current-sign convention
still needs explicit documentation.

The TypeScript interfaces and parser in [iv-data.ts](../app/lib/iv-data.ts) are
the precise field reference. No template can replace checking your source units.

## Limits and troubleshooting

- Package: 64 MB; workbook: 32 MB; point TSV: 256 MB (file-size limits).
- Duplicate IDs, missing references, incompatible versions, mismatched curve
  arrays or report counts cause rejection.
- Loaded but empty charts: check protocol/metric, filters, QA flags, and reference availability.
- No before/after pairs: check initial PCE and a unique eligible Unaged observation.
- No JV curves: check file/measurement links, points and screening/validation status.
- Outdoor sensitivity requires compatible raw-derived companion data; a daily-only import does not supply it.

The application still loads the bundled study on startup. An imported dataset
replaces it for the current session, but refresh does not re-open your imported file.
Saved preferences are not saved datasets.
