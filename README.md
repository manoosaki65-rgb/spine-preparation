# spine-preparation

Worker JavaScript copied from Cloudflare's active production version `bd10c72f` on 2026-09-28. The deployed bundle is kept intact in `src/worker.js`; original pre-bundle source and its source map are not included.

Cloudflare Workers Builds should deploy the `main` branch to the existing Worker `spine-preparation`, using `npm run deploy`. No build step is required.

The upload uses Cloudflare's `keep_assets` and `keep_bindings` metadata to retain the existing static assets, D1 binding, runtime variables, and secrets. Static assets and database contents stay in Cloudflare and are not copied into this repository. There are no database creation or migration commands.

Existing D1 binding: `DB` -> `uttaradit-spine-db` (`59e9675f-8a7e-44e4-b878-0b8c1898781c`). The deployment configuration deliberately inherits it rather than provisioning a database.

This configuration targets an already provisioned Worker. It is not intended to create a replacement Worker or reproduce its static assets in a new account.

Reference: https://developers.cloudflare.com/workers/static-assets/direct-upload/#createdeploy-new-version