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
      return remember_(requestId, { ok:false, error:'Unauthorized.' });
    }

    const filename = sanitizeFilename_(payload.filename || 'Faction_Leadership_Report.xlsx');
    const mimeType = String(payload.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return remember_(requestId, { ok:false, error:'Unsupported MIME type.' });
    }

    const bytes = Utilities.base64Decode(String(payload.contentBase64 || ''));
    if (!bytes.length) return remember_(requestId, { ok:false, error:'Empty workbook.' });
    if (bytes.length > 10 * 1024 * 1024) {
      return remember_(requestId, { ok:false, error:'Workbook exceeds 10 MB upload limit.' });
    }

    const folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
    const blob = Utilities.newBlob(bytes, mimeType, filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return remember_(requestId, {
      ok:true,
      fileId:file.getId(),
      filename:file.getName(),
      url:file.getUrl(),
      generatedAt:String(payload.generatedAt || ''),
      faction:String(payload.faction || ''),
      reportType:String(payload.reportType || '')
    });
  } catch (error) {
    const result = { ok:false, error:String(error && error.message || error) };
    if (requestId) storeResult_(requestId, result);
    return json_(result);
  }
}

function doGet(e) {
  const requestId = String((e && e.parameter && e.parameter.requestId) || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(requestId)) {
    return jsonGet_({ ok:false, error:'Invalid or missing requestId.' });
  }
  const cached = CacheService.getScriptCache().get('report-result:' + requestId);
  if (!cached) return jsonGet_({ ok:false, pending:true });
  return jsonGet_(JSON.parse(cached));
}

function remember_(requestId, result) {
  storeResult_(requestId, result);
  return json_(result);
}

function storeResult_(requestId, result) {
  CacheService.getScriptCache().put(
    'report-result:' + requestId,
    JSON.stringify(result),
    RESULT_CACHE_TTL_SECONDS
  );
}

function json_(value) {
  return HtmlService.createHtmlOutput(JSON.stringify(value));
}

function jsonGet_(value) {
  // GET may safely follow Apps Script's ContentService redirect.
  // This returns clean JSON to the CRM result-lookup request.
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeFilename_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'Faction_Leadership_Report.xlsx';
}
