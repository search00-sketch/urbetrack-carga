/**
 * Registro de cargas en Google Sheets (para el panel "Carga automática · WhatsApp → Urbetrack").
 *
 * INSTALACIÓN (una sola vez):
 *  1. Crear una planilla de Google nueva (por ejemplo "Registro cargas Urbetrack").
 *  2. Menú Extensiones → Apps Script. Borrar lo que haya y pegar TODO este archivo. Guardar.
 *  3. Engranaje "Configuración del proyecto" → "Propiedades de la secuencia de comandos" →
 *     Agregar propiedad: CLAVE = una palabra secreta que inventes (ej. govna-2026-xyz). Guardar.
 *  4. Botón "Implementar" → "Nueva implementación" → tipo "Aplicación web":
 *       Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
 *     → Implementar → autorizar con tu cuenta → copiar la "URL de la aplicación web".
 *  5. En el panel de Urbetrack → "Registro en Google Sheets": pegar la URL y la CLAVE → "Probar".
 *
 * La URL y la CLAVE NO se suben al repositorio (es público). Si se filtran: cambiar la CLAVE en el paso 3.
 */
var HOJA = 'Registro';
var COLUMNAS = ['registrado', 'operador', 'estado', 'incidencia', 'fecha_aviso', 'direccion', 'grupo', 'tipo_servicio',
  'detalle_servicio', 'solicitante', 'turno', 'codigo', 'numero_orden_sap', 'fotos', 'contexto', 'mensaje', 'fila', 'version'];

function doPost(e) {
  var datos;
  try { datos = JSON.parse(e.postData.contents); } catch (x) { return respuesta('error: datos inválidos'); }
  var clave = PropertiesService.getScriptProperties().getProperty('CLAVE');
  if (!clave || datos.clave !== clave) return respuesta('error: clave incorrecta');
  var filas = (datos.filas || []).map(function (f) {
    return COLUMNAS.map(function (c) { return c === 'registrado' ? new Date() : (f[c] == null ? '' : String(f[c])); });
  });
  if (!filas.length) return respuesta('ok: 0');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
    if (hoja.getLastRow() === 0) { hoja.appendRow(COLUMNAS); hoja.setFrozenRows(1); }
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, COLUMNAS.length).setValues(filas);
  } finally { lock.releaseLock(); }
  return respuesta('ok: ' + filas.length);
}

function respuesta(t) { return ContentService.createTextOutput(t).setMimeType(ContentService.MimeType.TEXT); }
