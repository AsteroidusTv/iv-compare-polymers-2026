# Public interface review — 6 October 2026

Scope: the ageing workspace, J–V inspection, paired encapsulation comparisons,
all supplementary analyses, the guide, graph controls, downloads and responsive
layout. This is an interface review, not experimental validation or authorization
to deploy the site. Raw observations and scientific calculations are unchanged.

## Decisions by feature

| Feature / component | Useful? | Placement and comprehension decision |
| --- | --- | --- |
| Navigation and introduction | Yes | Describe the photovoltaic study, not an internal tool. Give a direct route to methods. |
| Dataset counts | Yes, as coverage | Explain cells, repeated acquisitions and raw points separately; counts are not current graph contributors. |
| Import, study package and reset | Secondary | Group under Dataset & downloads. State that imports are local and replace the current session dataset. Neutral downloaded filename. |
| Three comparison modes | Essential | Keep first; explain their distinct questions. |
| Material / protocol cards | Essential | Responsive grid rather than clipped horizontal cards. Expand DH and TC; distinguish before-ageing from pre-encapsulation. |
| Add / remove comparison series | Essential | Compact add control next to the series count, not a large empty card. Every series can be removed while retaining at least one. |
| Parameter selector | Essential for trends only | Remove from J–V inspection where it does not control the plotted quantity. Explicit PCE label. |
| Formulation / batch / recipe / electrode filters | Useful, advanced | Keep per-series disclosure; scientific membership is unchanged. |
| Retention / absolute and individual / summary | Essential | Keep primary controls; cell terminology replaces patch terminology. |
| Grouping, cohort, Outdoor baseline and QA | Useful, advanced | Keep under Scientific settings. Inclusion remains an explicit methodological choice. |
| Ribbon filter and group splitting | Useful, secondary | Cell preparation filters; English interface labels and a concise interpretation limit. |
| Current method and exclusions | Essential | Keep concise visible method and scientifically relevant alerts. Remove irrelevant IV identity-matching counts from trend controls. |
| Cell selection | Essential | Move before graphs, independently of the data ledger. Explain inclusion versus display-only legend hiding. Selecting cells no longer silently resets the chosen summary mode or cohort. |
| Graph grouping and columns | Useful | Keep next to graphs; preserve incompatible axes and mobile stacking. |
| Zoom, pan, graph end, point spacing | Useful | Keep with each graph; descriptive full-duration reset. All spacing remains display-only. |
| Y-axis limits and uncertainty | Useful | Keep with graph. Hide the uncertainty toggle when only individual trajectories are present. |
| SVG, PNG, report SVG, data, manifest, captions | Useful, secondary | One Export figure menu with format guidance. Copy caption reports success or text-file fallback. |
| Trend data ledger / missingness / cohort composition | Useful, secondary | Lazy disclosure after graphs; full-selection CSV lives here. Human-readable exclusion labels; provenance is preserved. |
| Quick read | Useful | Counts and interpretation; no patch-specific jargon. |
| Light-ageing four-parameter overlay | Useful, supplementary | Opt-in, after cell selection; one figure per cell and a common sweep selection. Public cell names, English controls, French report figures. |
| J–V mode, cell and stage selection | Essential | Keep before chart. Remove archive IDs from prominent headings and sweep selector labels; preserve IDs in provenance. |
| J–V current sign, segments, landmarks and QA | Useful | Controls remain explicit; screening is not presented as experimental validation. |
| J–V measurement cards | Useful | Show cell, time and electrical quantities first. Source filenames and match status belong in a provenance disclosure. |
| Paired before / after PCE | Essential | Primary paired graph; shared export menu. Hidden and explicitly excluded groups remain distinct. |
| Paired raw J–V, before/post/aged and synchronized metrics | Useful, supplementary | Separate lazy disclosures rather than three mandatory full charts below the paired figure. |
| Outdoor sensitivity | Useful, supplementary | Lazy disclosure; detailed sensitivity table is not forced open. No new threshold or baseline chosen automatically. |
| Tooltips and keyboard interaction | Essential | Help clicks do not activate parent labels or disclosures. Visible focus states, native summary controls and pressed states for J–V modes. |
| Multiple SVG plots | Essential | Unique clipping identifiers avoid interference between charts. |
| Guide and sharing metadata | Essential | Public study description; explain the actual control locations, formulas and limitations. Remove internal-tool branding. |

## Names and provenance

Displayed cell names are separate from archival identifiers. Source sample IDs,
filenames, measurement IDs and raw metadata remain intact in provenance and data
exports: changing them would break traceability. Supplier/formulation names are
scientific labels, not branding for the internal acquisition system. The review
does not certify that every archived comment is suitable for unrestricted public
release; data-release permissions must be checked before hosting the downloadable
research package publicly.

## Verification

Regression tests cover public labels, opt-in panel mounting, export-menu guidance
and internal-branding absence from the rendered shell and guide. The existing
scientific tests are retained. Browser checks cover trend, paired and J–V flows,
light-ageing comparison, exports, cell selection and responsive overflow.
