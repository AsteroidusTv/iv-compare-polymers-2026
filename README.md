# IV Compare

A browser-based scientific workspace for photovoltaic performance data:
ageing trends, paired PCE before/after encapsulation, staged comparisons and JV curves.

## Run locally

Requirements: Node.js **22.13 or newer**, and **pnpm 11.19.0**.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by the server (normally http://localhost:3000).
For a production build, run `pnpm build`, then `pnpm start`.

The current checkout includes a research dataset loaded by default. It is not
required to prepare your own normalized import, but the present application still
loads that bundled dataset on startup. This repository is **not yet a data-free
public distribution**; see [publication preparation](docs/PUBLICATION.md).

## Import your own data

Select **Import IV data** and choose either:

- one `.ivpack` package (JSON, optionally gzip-compressed); or
- a normalized `.xlsx` workbook **and** its curve-point `.tsv`, together.

An arbitrary laboratory workbook is not automatically converted.
Use the [import format guide](docs/IMPORT.md) and the
[synthetic example](examples/synthetic-ageing.ivpack).
The example contains invented values, not experimental findings.

## Use and export

Choose material, protocol and metric per series; refine the formulation, batch,
electrode and sample selection as needed. Explore individual trajectories or
aggregates, then export PNG/SVG or the sober **Report SVG** preset.
Companion CSV, JSON manifests and captions describe the selected figure.

Open **Guide & methods** in the application for the interactive walkthrough.
Read [calculation conventions and limitations](docs/METHODS.md) before interpreting results.

Imports are processed locally in the browser. Comparison preferences are saved in
this browser's local storage and restored after refresh; imported files themselves
are not saved there. Clearing site data resets preferences. Localhost and a hosted
site have separate preferences.

## Development

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Keep raw values and provenance intact when changing scientific calculations.
A QA flag is a review signal, not proof of an instrument fault.

## Documentation

- [Documentation index](docs/README.md)
- [Data import](docs/IMPORT.md)
- [Methods](docs/METHODS.md)
- [Generic deployment](DEPLOYMENT.md)
- [Publication checklist](docs/PUBLICATION.md)
- [Existing research case study and audit records](docs/study/README.md)

## Licensing

No software license has been selected yet. Public visibility alone does not grant
permission to reuse the code or the research data. Before distribution, the owner
must choose a software license and separately confirm rights to any included data,
photographs, slides and publications.
