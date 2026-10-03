# Preparing a public software distribution

## Scope of this cleanup

The README now describes the software rather than a particular computer or data
intake. User guides are separate from the study index. The server runbook and
release implementation are preserved in ignored `.local/` files; the tracked
release entry point contains no server addresses or machine paths.

This is documentation separation, **not complete privacy sanitization**.
No raw research data, audit record or Git history has been removed.

## Remaining decisions and work

1. Choose a software license after checking ownership. Separately confirm rights
   to publish research data, photographs, slides and third-party publications.
2. Review `data/`, `public/data/`, study documents and screenshots. Packages and
   their provenance may expose more than visible figures. `.gitignore` does not
   make already-tracked files private.
3. Keep source-specific intake scripts, their tests, raw sources and decision
   registries with the study archive, not the portable software distribution.
4. Replace startup data with a synthetic demo or implement an empty startup.
   The current app still loads the research package. Outdoor sensitivity uses a
   second dataset-specific asset. Removing these files without application changes
   would break those workflows.
5. Review laboratory-specific defaults, help text, formulation/ribbon mappings and
   source-specific QA exclusions before describing the software as lab-independent.
6. Review the public tree **and its history**. Moving operational files locally
   does not erase their previously committed versions.

## Recommended publication boundary

Keep this repository as the traceable research workspace. Prepare a fresh public
repository from an explicit selection of software, portable tests, user docs and
synthetic examples. Do not copy `.git`, `.local`, research data or study archives
by default, and do not assume all scripts/tests are independent of the study.

A new repository avoids publishing historical operational details without rewriting
this workspace's history. Creating/publishing it, choosing a license, changing
startup behavior or removing research inputs are separate steps, not performed
by this documentation cleanup.
