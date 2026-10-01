const REPORT_FOLDER_ID = '18SQGZNeUbNfB_b9G9sts5mrLuYGGpFVN';
const SCRIPT_SECRET_PROPERTY = 'UPLOAD_SECRET';

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty(SCRIPT_SECRET_PROPERTY);
    if (!expected || String(payload.secret || '') !== expected) {
      return json_({ ok:false, error:'Unauthorized.' });
    }

    const filename = sanitizeFilename_(payload.filename || 'Faction_Leadership_Report.xlsx');
    const mimeType = String(payload.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return json_({ ok:false, error:'Unsupported MIME type.' });
    }

    const bytes = Utilities.base64Decode(String(payload.contentBase64 || ''));
    if (!bytes.length) return json_({ ok:false, error:'Empty workbook.' });
    if (bytes.length > 10 * 1024 * 1024) {
      return json_({ ok:false, error:'Workbook exceeds 10 MB upload limit.' });
    }

    const folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
    const blob = Utilities.newBlob(bytes, mimeType, filename);
    const file = folder.createFile(blob);

    // Link-sharing is required because Torn leadership delivery has no Google account mapping.
    // Anyone with the link can view/download; the file is not searchable.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return json_({
      ok:true,
      fileId:file.getId(),
      filename:file.getName(),
      url:file.getUrl(),
      generatedAt:String(payload.generatedAt || ''),
      faction:String(payload.faction || ''),
      reportType:String(payload.reportType || '')
    });
  } catch (error) {
    return json_({ ok:false, error:String(error && error.message || error) });
  }
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
