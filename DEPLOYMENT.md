# Deployment

The application builds as a Node.js server. It does not require any particular
hosting provider or the original maintainer's computer.

## Build and start

Use Node.js 22.13 or newer and pnpm 11.19.0:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm start
```

`pnpm test` includes the production build. Outside that validation workflow,
build explicitly with `pnpm build` before `pnpm start`. Configure a process
manager and an HTTPS reverse proxy appropriate to your own environment.
Use the address printed by the server; do not copy another deployment's paths,
accounts or hostnames.

## Release safety

1. Validate the intended source revision.
2. Install and build in a separate staging directory while the live service remains available.
3. Preserve the current release as an identified rollback candidate.
4. Switch the service to the staged build.
5. Verify the page, required dataset assets and the changed user workflow.
6. Restore the previous release if startup or health checks fail.

Never delete backups without identifying the exact release being removed.
The current application loads `public/data/iv-compare-dowsil.ivpack` by default;
Outdoor sensitivity also uses `public/data/outdoor-sensitivity-v1.ivpack`.
Removing or replacing those assets requires corresponding application changes
and validation, not just a documentation edit.

## Access control and publication

If bundled research data are not public, protect the **entire origin**, including
dataset download endpoints, with authentication. Hiding links does not protect data.
Review [publication preparation](docs/PUBLICATION.md) before making the repository
or a deployment public.

## Existing maintainer installation

Machine-specific instructions and the existing release implementation are kept
in the ignored `.local/` directory. They are not part of a new clone:

- `.local/DEPLOYMENT.private.md`: installation-specific runbook; read it in full before operating that installation.
- `.local/release-main.sh`: existing staged release and automatic-rollback procedure.

`scripts/release-main.sh` delegates to that private procedure when present and
otherwise exits without deploying. Its installation-specific implementation has
not been generalized or replaced.
