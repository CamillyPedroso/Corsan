// Cole este código em Extensões > Apps Script, dentro da sua planilha do Google.
// A primeira linha da aba deve ter: date, metric, value, target, category, status, note

const SHEET_NAME = "Dados"; // nome da aba (troque se a sua tiver outro nome)

function doPost(e) {
  try {
    const entry = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      entry.date,
      entry.metric,
      Number(entry.value),
      Number(entry.target),
      entry.category,
      entry.status,
      entry.note || "",
    ]);
    // mantém a data como texto (AAAA-MM-DD) para o site ler corretamente
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat("@").setValue(entry.date);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
