# Scientific remediation: browser verification

> Historical browser validation for the local September 2026 remediation build.
> It does not assert that the current production UI has the same controls.

Local application: `http://localhost:4312/`, September 20–21, 2026.
These checks concern the local remediation source, not the deployed website.
Selections, tables, counts, missingness, explanatory information and export
controls were exercised in the in-app browser. Native SVG and PNG generation,
analytical CSV, full-selection CSV, JSON manifest and caption were exercised
across the nine figure views below. Unit tests additionally protect the export
semantics independently of browser interactions.

| View | Case and observed result |
| --- | --- |
| DH | Mitsui SMP-222 / TF4 SMP-198, graph end 1500 h, manual Y 60–120. Eight analytical rows, two visually clipped values retained; no analytical time above 1500. Manifest records the cutoff exclusion. PNG 2700 × 1362. |
| TC | EVA available cohort has n=2,5,2 and means 99.0471,39.9467,98.4990 at 20,50,100 cycles. Constant cohort n=2 gives 99.8668 at 50. Composition details identify the departing specimens and recovery warning; optional small-n CI and individual values remain distinct. |
| Outdoor | SMP-063, B14, graph end 50, 300 W/m² hidden. 87 displayed analytical rows at 100/200, maximum time 50; retention reconstructs as 100 × value/baseline. Analytical membership retained despite hiding. Full-record table retains nine scenarios. PNG 3540 × 1710. |
| Before/Post | EVA/TF4, EVA406 hidden, dates enabled, median delta. Seven visible pairs but eight analytical contributors. Mean and median remain separately named. Known POE interval 7 days; missing EVA dates remain unknown. PNG 2160 × 1368. |
| Before/Post/Aged | EVA/TF4 TC: exact 51 cycles gives counts 4/9/0; exact 50 gives 4/9/9 including three measured zeros. Last common time is 50. CSV has 27 stage rows including explicit absence. PNG 5520 × 1500. |
| Synchronized PCE/Jsc/Voc/FF | Nine TC specimens at 20/50: identical 18-slot grid per panel, five missing slots per panel. CSV has 72 slots, without silent panel-specific cohort substitution. PNG 3540 × 2490. |
| JV before/after | Explicit inspection, POE-2 SMP-028: MEA-04918 (107 points) / MEA-03878 (116). All 223 V/J points and source indices reconstruct from CSV. Validation remains false; before/after line meaning retained. PNG 2700 × 1302. |
| JV one specimen over time | Mitsui SMP-222 at 0/140/305: 450 exported points, one specimen; selection ledger has 32 sweeps with three included. Numerical consistency does not set unit/range/experimental validation. Full selection includes Unaged. PNG 2700 × 1302. |
| JV material comparison | Mitsui/TF4 at 305: hiding TF4 leaves two analytical contributors but one visible contributor. Both-material all-segment export has 460 points. Suspect segments retain dotted `1 3` pattern; PNG 2700 × 1302 decoded and visually inspected. |

## Export reconstruction and limits

DH rows were reconstructed from member metadata, Outdoor retention from recorded
baselines, and JV rows from measurement/segment/source-point identities. They
matched the corresponding CSV/manifest values. Graph end changes analytical rows;
viewport clipping and hiding do not change underlying calculations. Prepared PNG
blobs decoded to the dimensions above. SVG styles and metadata were inspected.
Default JV mode explicitly reports no quantitatively eligible curves for this
legacy dataset; inspection requires an explicit user choice.

The in-app browser did not expose native downloads as files in Downloads.
Accordingly this record does **not** claim end-to-end filesystem delivery in
that browser. The app now retains the last six prepared exports in an accessible
panel with clickable filenames, text-copy actions and image previews. CSV/JSON
contents were retrieved through those UI actions; PNGs were decoded/previewed.
This is a browser delivery limitation, not evidence of a scientific discrepancy.
Generated metadata truthfully records the local commit and dirty state used for
the checks; no deployed revision is inferred.
