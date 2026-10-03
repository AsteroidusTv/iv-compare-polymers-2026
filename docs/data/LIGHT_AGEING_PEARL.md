# Pearl light ageing — 1 October 2026

The five XLSX `Summary` sheets supply 1,908 observations over approximately
167 elapsed hours: two A4 TPO-2 / Lenzing cells (383 and 382 rows) and three
A4 POE-2 / TF4 cells (381 rows each). Source filenames and unique inventory
identities support provisional specimen links; these are not laboratory adjudications.
The mapping and SHA-256 hashes of all 649 archived files are in
`data/decisions/light-ageing-pearl-v1.json`.

Select **Light ageing** in the comparison protocol, then **Pout — forward**
or **Pout — reverse**. Power density is in mW/cm² and elapsed time in hours,
as documented by the source evolution plots. Incident irradiance and controlled
temperature are undocumented, so no PCE or equivalent illuminated-dose time
is inferred. Directions are never pooled or selected by maximum performance.

Retention is 100 × measured power / first recorded power of the same cell
and direction after explicit different-irradiance exclusions. A missing, zero, negative,
QA-excluded or duplicate initial reference prevents retention calculation;
the reference never moves to a later, more convenient reading. Absolute zero
remains a measured zero. No time interpolation is performed; aggregate
curves use only exact recorded times, which differ between cells.

The owner identified the synchronized high-power spikes as a 1.5-sun test.
Worksheet rows 5 and 84 in all five summaries, plus the elevated startup
transition in row 6, are explicitly excluded from both sweep directions.
These 15 source-bound exclusions retain expected time, raw powers, source
SHA-256 and owner attribution in the decision manifest. No generic high-value
filter or recalibration by dividing power by 1.5 is applied. All 1,908 raw
observations remain in the audit package; 1,893 are eligible for trend analysis.
The reference is row 7 for each cell. Enabling QA inspection does not mix
these different-irradiance readings into the standard-irradiance experiment.

XLSX is authoritative. The two Lenzing TXT files omit their first three
points; all 1,902 overlapping TXT rows match their XLSX values. Both formats
remain archived without double counting. The JV CSV files and evolution PNGs
are preserved as evidence; this intake adds trend metrics, not JV curve analysis.

`scripts/light-ageing.mjs` reconstructs the observations from raw summaries,
checks archived hashes and inventory identities, and is shared by the normal
package builder and raw-only rebuild. `data/processed/Light_ageing_Pearl.json`
is the derived audit copy. `pnpm data:verify:deep` reconciles it and the browser
package with raw rows. Existing Outdoor observations are unchanged, as checked
against their pre-intake digest before binding its sensitivity bundle to the
new main package.

After `pnpm data:build`, `node scripts/bind-pearl-outdoor.mjs` can bind a
rebuilt package while the pre-intake Outdoor digest and decision registry
remain identical. It refuses changed Outdoor data or decisions.
