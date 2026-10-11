# Drive Bridge for spine-preparation

`ZIPBridge.gs` supplies the active handlers; `Code.gs` retains historical handlers with a Legacy suffix. The active handler writes only to the existing Master, never to Backup or the control workbook. Keep the existing Apps Script project and deployment URL.

Target files:
- All - หลักประกันสัญญา 2570.xlsx: 1j3c-5P4CMd0kktcA-aGqZWb-XZHY3cO8

Behavior:
1. The Worker validates the original Master and builds a ZIP patch plan with unchanged compressed entries preserved byte-for-byte.
2. Apps Script authenticates the caller, locks concurrent bridge writes, checks file identity and version, and assembles bounded chunks using original Drive ranges.
3. A resumable PATCH uploads to the same existing Master ID without conversion or copies. The version is checked again before the final chunk.
4. The Worker independently reads the changed entry back before committing the record to existing D1. Failures leave that record unchanged and are journaled for a retry of the same sequence.

Deployment requirements:
- Google Apps Script Advanced Drive service must be enabled (configured in appsscript.json).
- Script Property BRIDGE_TOKEN must match Worker secret DRIVE_BRIDGE_TOKEN. Never place tokens in source, assets or logs.
- Deploy as Web app: Execute as Me; access limited to the intended caller configuration.
- Keep Cloudflare Worker DRIVE_BRIDGE_URL at the existing /exec URL and set DRIVE_BRIDGE_ENABLED=true and MASTER_WRITEBACK_TRANSPORT=apps-script.
- The caller must POST JSON plus ?token=<BRIDGE_TOKEN>.

`node test-bridge.mjs` checks exact byte reconstruction and authentication with a mock Apps Script runtime. It does not prove a live Web → Bridge → Master save; that requires an authorized one-record web test, independent readback, restoration and comparison with the baseline.
