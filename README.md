# spine-preparation

Worker JavaScript originally copied from Cloudflare's active production version `bd10c72f` on 2026-09-28. `src/worker.js` retains the original routes and adds the Master write-back module. Wrangler bundles the two modules for the existing Worker.

Cloudflare Workers Builds should deploy the `main` branch to the existing Worker `spine-preparation`, using `npm run deploy`. No build step is required.

The upload uses Cloudflare's `keep_assets` and `keep_bindings` metadata to retain the existing static assets, D1 binding, runtime variables, and secrets. Static assets and database contents stay in Cloudflare and are not copied into this repository. The only migration adds the write-back lease and journal to the existing database.

Existing D1 binding: `DB` -> `uttaradit-spine-db` (`59e9675f-8a7e-44e4-b878-0b8c1898781c`). The deployment configuration deliberately inherits it rather than provisioning a database.

This configuration targets an already provisioned Worker. It is not intended to create a replacement Worker or reproduce its static assets in a new account.

Reference: https://developers.cloudflare.com/workers/static-assets/direct-upload/#createdeploy-new-version

## Write-back to the original Excel Master

`POST /api/spine-records` writes changed contract fields to the original Drive file `1j3c-5P4CMd0kktcA-aGqZWb-XZHY3cO8` before committing the new record to D1. It reads the changed worksheet back from Drive before returning success. The existing frontend shows a Site + Master confirmation; static assets are retained, with the existing JS and HTML responses patched by the Worker.

Set `MASTER_WRITEBACK_ENABLED=true` and the backend-only secret `GOOGLE_SERVICE_ACCOUNT_JSON`. The Google Cloud project must have Drive API enabled, and the service account must have Editor access to that same file. `configure-master-secret.mjs <absolute-json-path>` streams the JSON to Wrangler through stdin and suppresses diagnostic output. Never commit a key, place it in assets, or use a plaintext environment variable.

Apply `migrations/master-writeback.sql` once to the existing database. It creates only a lease table and a recovery journal; it does not modify or recreate contract tables. The lease serializes web writes. Failed or interrupted writes are journaled, and another sequence is blocked until the affected sequence is recovered. A successful retry completes that sequence's journal entries.

Contract number + fiscal year locate the row across existing fiscal-year sheets. Item text or an exact contractor match disambiguates duplicate contract numbers. Only fields changed from the prior Site record are edited; the initial edit of a Master-derived record carries its baseline from the frontend. Formula cells are protected. Additions reuse a completely empty formatted row after existing contracts. Missing fiscal-year sheets, ambiguous matches, and missing safe rows return errors rather than overwrite another record. D1-only display metadata such as folder counts remains in D1.

The XLSX is patched at the ZIP-entry level. Unchanged compressed entries are retained byte-for-byte, avoiding conversion through Google Sheets and inflation of the whole workbook. Before upload the Drive version is checked; `If-Match` is included when Drive returns an ETag. Coordinate direct Excel edits with Site saves: the Site lease cannot lock external Drive editors when no ETag is supplied.

## Validation

`npm run check` checks both backend modules. For an authorized integration test, `inspect-master.mjs <absolute-json-path>` reads the original Master and Site into ignored `.local/` snapshots. `node test-master.mjs` checks ZIP preservation, all existing record mappings, a new-record plan, protected lookup failures, and restoration without writing remotely.

The live Web → Master test used only `69-298`, contract `218/2569`, changing its item text in `69!I56` and then restoring it through the web form. `verify-writeback.mjs <absolute-json-path> test|restored` verifies the Master readback, all other compressed ZIP entries, the remaining worksheet XML, and all Site records against the ignored snapshots. Verification artifacts and source workbooks remain ignored and contain no service-account secret.
