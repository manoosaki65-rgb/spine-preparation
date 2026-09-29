# Drive Bridge for spine-preparation

This Google Apps Script bridge writes confirmed spine data back to the two existing Excel workbooks in Google Drive without replacing their Drive IDs.

Target files:
- All - หลักประกันสัญญา 2570.xlsx: 1j3c-5P4CMd0kktcA-aGqZWb-XZHY3cO8
- ตารางคุมเลขที่สัญญา 70.xlsx: 1aH-ltPs_WPZnjkH1HKMTHReSRgjYSCMz

Behavior:
1. Finds an existing contract number/year in the contract workbook and fills the acceptance date only when that cell is blank.
2. In ตารางคุมเลขที่สัญญา 70.xlsx / รายการ68 - 69, reuses the existing row if the contract already exists.
3. For a new contract, fills the first reserved blank 69-xxx row (for example 69-298, 69-299) before appending a new sequence.
4. Existing acceptance dates are not overwritten when they conflict; a conflict is returned to the caller.

Deployment requirements:
- Google Apps Script Advanced Drive service must be enabled (configured in appsscript.json).
- Set Script Property BRIDGE_TOKEN to a long random value.
- Deploy as Web app: Execute as Me; access limited to the intended caller configuration.
- Set Cloudflare Worker DRIVE_BRIDGE_URL to the deployed /exec URL and DRIVE_BRIDGE_ENABLED=true.
- The caller must POST JSON plus ?token=<BRIDGE_TOKEN>.
