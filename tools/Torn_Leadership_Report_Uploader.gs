const REPORT_FOLDER_ID = '18SQGZNeUbNfB_b9G9sts5mrLuYGGpFVN';
const SCRIPT_SECRET_PROPERTY = 'UPLOAD_SECRET';
const RESULT_CACHE_TTL_SECONDS = 600;

function doPost(e) {
  let requestId = '';
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    requestId = String(payload.requestId || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(requestId)) {
      return json_({ ok:false, error:'Invalid or missing requestId.' });
    }
    const expected = PropertiesService.getScriptProperties().getProperty(SCRIPT_SECRET_PROPERTY);
    if (!expected || String(payload.secret || '') !== expected) {
      const result = { ok:false, error:'Unauthorized.' };
      storeResult_(requestId, result);
      return json_(result);
    }

    const filename = sanitizeFilename_(payload.filename || 'Faction_Leadership_Report.xlsx');
    const mimeType = String(payload.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const result = { ok:false, error:'Unsupported MIME type.' };
      storeResult_(requestId, result);
      return json_(result);
    }

    const bytes = Utilities.base64Decode(String(payload.contentBase64 || ''));
    if (!bytes.length) {
      const result = { ok:false, error:'Empty workbook.' };
      storeResult_(requestId, result);
      return json_(result);
    }
    if (bytes.length > 10 * 1024 * 1024) {
      const result = { ok:false, error:'Workbook exceeds 10 MB upload limit.' };
      storeResult_(requestId, result);
      return json_(result);
    }

    const folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
    const blob = Utilities.newBlob(bytes, mimeType, filename);
    const file = folder.createFile(blob);

    // Link-sharing is required because Torn leadership delivery has no Google account mapping.
    // Anyone with the link can view/download; the file is not searchable.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const result = {
      ok:true,
      fileId:file.getId(),
      filename:file.getName(),
      url:file.getUrl(),
      generatedAt:String(payload.generatedAt || ''),
      faction:String(payload.faction || ''),
      reportType:String(payload.reportType || '')
    };
    storeResult_(requestId, result);
    return json_(result);
  } catch (error) {
    const result = { ok:false, error:String(error && error.message || error) };
    if (requestId) storeResult_(requestId, result);
    return json_(result);
  }
}

function doGet(e) {
  const requestId = String((e && e.parameter && e.parameter.requestId) || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(requestId)) {
    return json_({ ok:false, error:'Invalid or missing requestId.' });
  }
  const cached = CacheService.getScriptCache().get('report-result:' + requestId);
  if (!cached) return json_({ ok:false, pending:true });
  try {
    return json_(JSON.parse(cached));
  } catch {
    return json_({ ok:false, error:'Stored report result is invalid.' });
  }
}

function storeResult_(requestId, result) {
  CacheService.getScriptCache().put(
    'report-result:' + requestId,
    JSON.stringify(result),
    RESULT_CACHE_TTL_SECONDS
  );
}

function json_(value) {
  // HtmlService avoids ContentService's one-time googleusercontent redirect.
  // That redirect can cause some POST clients to repeat POST against the
  // redirected URL and receive HTTP 405 Method Not Allowed.
  return HtmlService.createHtmlOutput(JSON.stringify(value));
}

function sanitizeFilename_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'Faction_Leadership_Report.xlsx';
}
