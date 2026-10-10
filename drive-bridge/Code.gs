const CONTRACT_FILE_ID = '1j3c-5P4CMd0kktcA-aGqZWb-XZHY3cO8';
const CONTROL_FILE_ID = '1aH-ltPs_WPZnjkH1HKMTHReSRgjYSCMz';
const CONTRACT_SHEETS = ['69', '69 รพ.อต.'];
const CONTROL_SHEET = 'รายการ68 - 69';

function doGet() {
  return json_({ ok: true, service: 'uttaradit-spine-drive-bridge' });
}

function doPost(e) {
  try {
    const expectedToken = PropertiesService.getScriptProperties().getProperty('BRIDGE_TOKEN') || '';
    const suppliedToken = String(e && e.parameter && e.parameter.token || '');
    if (!expectedToken || suppliedToken !== expectedToken) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const record = normalize_(body);
    if (!record.contractNo || !record.fiscalYear || !record.item) {
      return json_({ ok: false, error: 'missing-contract-fields' });
    }

    const controlResult = withExcelAsSheet_(CONTROL_FILE_ID, function(ss) {
      return upsertControl_(ss, record);
    });

    record.sequence = controlResult.sequence;

    const contractResult = withExcelAsSheet_(CONTRACT_FILE_ID, function(ss) {
      return updateAcceptance_(ss, record);
    });

    return json_({
      ok: true,
      sequence: record.sequence,
      control: controlResult,
      contract: contractResult
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function normalize_(input) {
  const keys = ['sequence','contractNo','fiscalYear','contractDate','item','planBudget','procurementAmount','contractor','guaranteeType','guaranteeBranch','guaranteeNo','guaranteeDate','guaranteeAmount','deliveryDue','deliveryActual','acceptanceDate','warrantyPeriod','warrantyDay','warrantyMonth','warrantyYear','guaranteeReturnDate','procurementOfficer','department','fundSource','status','sourceNote'];
  const out = {};
  keys.forEach(k => out[k] = String(input[k] || '').trim());
  out.slash = '/';
  return out;
}

function updateAcceptance_(ss, record) {
  // Master columns E:AB = contract no, [F unused], fiscal year, contract date, item,
  // plan budget, procurement amount, contractor, guarantee details, delivery/acceptance,
  // warranty, return date, officer, department, fund source.
  const map = {
    contractNo:5, fiscalYear:7, contractDate:8, item:9, planBudget:10,
    procurementAmount:11, contractor:12, guaranteeType:13, guaranteeBranch:14,
    guaranteeNo:15, guaranteeDate:16, guaranteeAmount:17, deliveryDue:18,
    deliveryActual:19, acceptanceDate:20, warrantyPeriod:21, warrantyDay:22,
    warrantyMonth:23, warrantyYear:24, guaranteeReturnDate:25,
    procurementOfficer:26, department:27, fundSource:28
  };
  for (const sheetName of CONTRACT_SHEETS) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    const lastRow = Math.max(sheet.getLastRow(), 10);
    const values = sheet.getRange(1, 1, lastRow, 28).getDisplayValues();
    for (let i = 9; i < values.length; i++) {
      const contractNo = String(values[i][4] || '').trim();
      const fiscalYear = String(values[i][6] || '').trim();
      if (contractNo === record.contractNo && fiscalYear === record.fiscalYear) {
        const row = i + 1;
        const changed = [];
        Object.keys(map).forEach(function(key) {
          const value = String(record[key] || '').trim();
          if (!value || key === 'contractNo' || key === 'fiscalYear') return;
          const col = map[key];
          const existing = String(values[i][col - 1] || '').trim();
          if (existing !== value) {
            sheet.getRange(row, col).setValue(value);
            changed.push(key);
          }
        });
        SpreadsheetApp.flush();
        return { found: true, sheet: sheetName, row: row, updatedFields: changed };
      }
    }
  }
  return { found: false, updatedFields: [] };
}

function upsertControl_(ss, record) {
  const sheet = ss.getSheetByName(CONTROL_SHEET);
  if (!sheet) throw new Error('ไม่พบชีต ' + CONTROL_SHEET);

  const lastRow = Math.max(sheet.getLastRow(), 3);
  const values = sheet.getRange(1, 1, lastRow, 8).getDisplayValues();

  for (let i = 2; i < values.length; i++) {
    const contractNo = String(values[i][3] || '').trim();
    const fiscalYear = String(values[i][5] || '').trim();
    if (contractNo === record.contractNo && fiscalYear === record.fiscalYear) {
      const existingSequence = String(values[i][1] || '').trim();
      return { existing: true, row: i + 1, sequence: existingSequence };
    }
  }

  let targetRow = 0;
  let sequence = '';
  let maxSequence = 0;

  for (let i = 2; i < values.length; i++) {
    const seq = String(values[i][1] || '').trim();
    const contractNo = String(values[i][3] || '').trim();
    const m = seq.match(/^69-(\d{3,4})$/);
    if (m) maxSequence = Math.max(maxSequence, Number(m[1]));
    if (!targetRow && m && !contractNo) {
      targetRow = i + 1;
      sequence = seq;
    }
  }

  if (!targetRow) {
    targetRow = lastRow + 1;
    sequence = '69-' + String(Math.max(maxSequence, 297) + 1).padStart(3, '0');
  }

  sheet.getRange(targetRow, 2, 1, 6).setValues([[
    sequence,
    record.item,
    record.contractNo,
    '/',
    record.fiscalYear,
    record.contractDate
  ]]);
  SpreadsheetApp.flush();
  return { existing: false, row: targetRow, sequence: sequence };
}

function withExcelAsSheet_(fileId, fn) {
  const source = DriveApp.getFileById(fileId);
  const temp = Drive.Files.copy(
    { name: 'TMP_' + source.getName(), mimeType: MimeType.GOOGLE_SHEETS },
    fileId
  );

  try {
    const ss = SpreadsheetApp.openById(temp.id);
    const result = fn(ss);
    SpreadsheetApp.flush();

    const exportUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(temp.id) +
      '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const exported = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: false
    }).getBlob().setName(source.getName());

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) +
      '?uploadType=media';

    UrlFetchApp.fetch(uploadUrl, {
      method: 'patch',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      payload: exported.getBytes(),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: false
    });

    return result;
  } finally {
    DriveApp.getFileById(temp.id).setTrashed(true);
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
