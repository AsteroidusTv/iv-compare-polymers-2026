# Non-circular raw reconstruction

Run from the repository with a new or empty directory outside the repository:

```bash
pnpm exec tsx scripts/rebuild-from-raw.ts --out /tmp/iv-rebuild-UNIQUE --compare public/data/iv-compare-dowsil.ivpack
```

Inputs are `data/raw`, parser code, and `data/decisions/registry-v1.json`.
The optional comparison pack is read only after the candidate has been written;
it supplies no candidate metric, curve or daily value. No production replacement
is performed. Occupied destinations, repository destinations (including symlink
aliases), raw path escapes, changed raw hashes and unregistered raw files fail.

The registry preserves historical stable IDs, source coordinates and decisions:
format/version, unit interpretation, date interpretation, matching, recipes and
material mappings. Each decision has target, old value, interpretation, source,
reason and status. `migrate-decision-registry.mjs` is the one-time migration of
historical decisions, not the reconstruction pipeline. Migrated decisions are
`legacy_unverified`; their preservation is not experimental validation. Future
manual exclusions or experimental adjudications currently fail closed rather
than being silently ignored or treated as proof.

Summary.xlsx is the active inventory. Summary_v2.xlsx is byte-identical; v1 is a
superseded archive. Both remain hash-checked and explicitly recorded as ignored
inputs, rather than accidentally combined with the current inventory. FTIR and
slides are not numerical IV/Outdoor inputs to this parser.

Outputs: candidate.ivpack, normalized-relational.json.gz, IV_curve_points.tsv,
outdoor-raw.json.gz, outdoor-sensitivity.json, outdoor-sensitivity.bundle.json.gz,
and rebuild-report.json. The TSV preserves instrument values and derived legacy
values side by side. Legacy conversions remain quarantined by the JV gates.

The generated supplemental bundle is shipped unchanged as
`public/data/outdoor-sensitivity-v1.ivpack` because the production server reserves
`.gz` URLs for compression sidecars. The browser recognizes gzip by its magic
bytes, not its extension. This does not replace the historical main dataset pack.

## Validation snapshot

The independent repeat run in `/tmp/iv-compare-cleanroom-repeat-20260921`
produced the same candidate hash as the first run below. The durable comparison
report is `data/decisions/rebuild-validation-v1.json`; temporary directories are
not durable archives. The registry SHA-256 for both runs is
`aa144faac4dd3a87c58788d56e4d41c671c3ae03ea48935e45a1ff0dbb2f69ee`.

Reconstruction `/tmp/iv-compare-cleanroom-R41x3Y` produced candidate SHA-256
`4877f0e58762e2b15e17eac93432e8e2972bbc3377456c4eab4b54f9339c5f10`:
135 samples, 22 recipes, 1,587 observations, 409 files, 5,116 measurements,
1,043,400 points; 203,122 Outdoor raw rows. All compared IDs, numerical values,
matching fields and 5,115 nonempty curves match the reference. One measurement
has no curve and remains empty. Threshold retained counts are respectively
126,163 / 105,343 / 91,217 for 100 / 200 / 300 W/m².

This is analytical equivalence, not byte-equivalence to the historical pack:
new provenance, 58 conservative measurement QA flags, normalized null comments,
Outdoor missing-row labels, numeric identifier formatting and explicit empty-curve
header metadata change the candidate. The report gives field counts and examples.
Original values are not corrected. Compatible supplemental package hashes refer
to the verified common analytical inputs, not a claim of identical metadata.

The existing production pack remains SHA-256
`cb64ac75e1eca0f6c6ba3fa55405cea13dd5c264e6d535a311d90c035820b344`.
Releasing a candidate still requires explicit comparison approval and the normal
deployment workflow. No raw file, reference pack or backup is deleted by this tool.
