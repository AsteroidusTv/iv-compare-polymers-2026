# Dependency security

Last reviewed: 6 October 2026.

## Applied updates

The security updates stay within the existing major versions. They do not change
application code, experimental data, or scientific calculations.

| Package | Previous version | Updated version |
| --- | --- | --- |
| `brace-expansion` | `1.1.18` and `5.0.9` | `1.1.21` and `5.0.12` |
| `fast-uri` | `3.1.5` | `3.1.8` |
| `js-yaml` | `4.3.1` | `4.3.2` |
| `source-map-js` | `1.2.1` | `1.2.2` |

The lockfile records the updated packages. Version-scoped overrides in
`pnpm-workspace.yaml` prevent vulnerable `fast-uri` and `source-map-js` versions
from being selected again without forcing unrelated major-version upgrades.

Upstream references: [brace-expansion](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr),
[fast-uri](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj),
[js-yaml](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh),
and [source-map-js](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).

## Remaining upstream issue

The full dependency audit still reports **one high-severity advisory**:
[`GHSA-vfj7-8cjw-p6xm`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
in `braces@3.0.3`. Deeply nested, untrusted glob patterns can exhaust the call
stack. The registry audit suggests `3.0.4`, but that version is not published:
the latest available release is still `3.0.3`. The
[upstream issue](https://github.com/micromatch/braces/issues/70) remains open.

The installed dependency paths are:

- `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`;
- `vinext` → `vite-plugin-commonjs` → `vite-plugin-dynamic-import` → `fast-glob`
  → `micromatch` → `braces`.

These paths belong to linting and build tooling. Application source does not
import `braces`, `micromatch`, or `fast-glob`, and no application endpoint accepts
glob patterns. This limits the observed exposure; it is **not** an upstream fix
or a guarantee of overall application security. Do not run builds over untrusted
source code or accept untrusted glob patterns, and do not expose the development
server publicly.

No advisory is suppressed or dismissed. Update `braces` and rerun validation
when a corrected upstream release becomes available.

## Rechecking

Use the pinned package manager and install with `pnpm install --frozen-lockfile`.
Run `pnpm audit`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, and
`pnpm data:verify` after dependency changes. The full audit intentionally remains
non-zero while the upstream issue above is unresolved.

`pnpm audit --prod` currently reports no known vulnerabilities, but excludes
development dependencies; it does not certify every tool involved in building
or serving the site, nor dependencies distributed outside the npm registry.
