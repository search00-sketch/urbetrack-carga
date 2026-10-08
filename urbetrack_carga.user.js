// ==UserScript==
// @name         Urbetrack – Carga automática desde WhatsApp (GOVNA)
// @namespace    dgfis-govna
// @version      0.9.0
// @description  Carga incidencias en "Nueva incidencia" de Urbetrack a partir del JSON del conversor WhatsApp → Urbetrack, incluyendo fotos.
// @match        https://gcaba.urbetrack.com/HigieneUrbana/Soporte/Default.aspx*
// @run-at       document-idle
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @updateURL    https://raw.githubusercontent.com/search00-sketch/urbetrack-carga/main/urbetrack_carga.user.js
// @downloadURL  https://raw.githubusercontent.com/search00-sketch/urbetrack-carga/main/urbetrack_carga.user.js
// ==/UserScript==

/*
 * USO
 *  1. Instalar en Tampermonkey/Violentmonkey, o pegar TODO este archivo en la consola (F12) de la
 *     página "Nueva incidencia" de Urbetrack.
 *  2. Aparece el panel "Carga automática" (arriba a la izquierda).
 *  3. Cargar el records-*.json que exporta el conversor, y elegir la carpeta con las fotos del chat.
 *  4. Dejar "Simulación" tildada: completa el formulario pero NO guarda. Revisar.
 *  5. Destildar "Simulación" para guardar de verdad. Pide confirmación antes de empezar.
 *
 * SEGURIDAD
 *  - Una fila con algún dato que no se pueda completar/verificar NO se guarda; queda marcada con error.
 *  - Las filas ya guardadas por este script se recuerdan (en este navegador) y no se repiten.
 *  - "Frenar" corta la corrida después de la fila en curso.
 */
(function () {
  'use strict';
  if (window.__ubCarga) { window.__ubCarga.toggle(); return; }

  // ------------------------------------------------------------------ utilidades
  var LS_CFG = 'ub_carga_cfg_v1', LS_DONE = 'ub_carga_done_v1', LS_ROWS = 'ub_carga_rows_v1', LS_LOG = 'ub_carga_log_v1';
  // versión que se muestra en el panel: la real del encabezado (Tampermonkey), o esta si se pegó en la consola
  var VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '0.9.0';
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $id = function (id) { return document.getElementById(id); };
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/INSIDENCIA/g, 'INCIDENCIA').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();   // tolera el "SIN INSIDENCIAS" mal escrito del catálogo
  }
  function stem(s) { return norm(s).split(' ').map(function (t) { return t.replace(/S$/, ''); }).join(' '); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
  function rowKey(r) { return [r.datetime || (r.date + ' ' + r.time), norm(r.direccion), hash(String(r.caption || ''))].join('|'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var cfg = Object.assign({
    distrito: 'GOVNA',          // texto del combo "Distrito"
    rango: 'Solicitud',         // texto del combo "Rango de incidencia"
    actaEn: 'txtCode',          // dónde va el N° de acta (AS####): txtCode | txtExternalIdentifier | comentario | ninguno
    precintoEn: 'comentario',   // dónde va el precinto: comentario | txtExternalIdentifier | ninguno
    ordenEn: 'txtSapNroOrden',  // dónde va el N° de orden (S########/YY, EX-...): txtSapNroOrden | comentario | ninguno
    solicitante: 'POLIGONO',    // POLIGONO / PATRULLA / OPERATIVO / SEGUN FILA (usa el del JSON)
    inferirDetalle: false,      // inferir el tipo de vendedor (detalle) en SECUESTRO/DISUASION/etc. a partir del texto (apagado: no adivina)
    subirEnSim: true,           // en simulación también sube las fotos (y las borra al terminar la fila)
    dryRun: true,
    stepMode: true,             // pausa después de completar cada fila para revisarla
    ver: { pendiente: true, error: true, cargada: true }   // filtros de la lista
  }, lsGet(LS_CFG, {}));
  function saveCfg() { lsSet(LS_CFG, cfg); }

  var state = { rows: [], photos: new Map(), running: false, stop: false, log: [], gate: null };
  var done = lsGet(LS_DONE, {});

  // ------------------------------------------------------------------ postbacks (ASP.NET UpdatePanel)
  function prm() { return window.Sys && Sys.WebForms && Sys.WebForms.PageRequestManager.getInstance(); }

  // Cambia un campo y espera a que termine el postback parcial que dispare (si dispara alguno).
  function change(id, value) {
    return new Promise(function (resolve) {
      var m = prm(), started = false, finished = false, errMsg = null;
      function onB() { started = true; }
      function onE(s, args) {
        var e = args && args.get_error && args.get_error();
        if (e) { errMsg = e.message; args.set_errorHandled(true); }
        finish();
      }
      function finish() {
        if (finished) return; finished = true;
        if (m) { m.remove_beginRequest(onB); m.remove_endRequest(onE); }
        resolve(errMsg);
      }
      if (m) { m.add_beginRequest(onB); m.add_endRequest(onE); }
      var el = $id(id);
      if (!el) { finish(); return; }
      var oc = el.getAttribute('onchange') || '';
      var autoPostBack = el.tagName === 'SELECT' || /doPostBack/i.test(oc);
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.tagName !== 'SELECT') el.blur();
      if (!autoPostBack) { setTimeout(finish, 60); return; }        // campo de texto sin postback: no esperar
      setTimeout(function () { if (!started) finish(); }, 800);    // no hubo postback (el postback arranca enseguida si lo hay)
      setTimeout(finish, 30000);                                   // tope
    }).then(function (err) { return sleep(250).then(function () { return err; }); });
  }

  // Click en un botón y espera el postback (devuelve {started, error}).
  function clickAndWait(btn, startTimeout) {
    return new Promise(function (resolve) {
      var m = prm(), started = false, finished = false, errMsg = null;
      function onB() { started = true; }
      function onE(s, args) {
        var e = args && args.get_error && args.get_error();
        if (e) { errMsg = e.message; args.set_errorHandled(true); }
        finish();
      }
      function finish() {
        if (finished) return; finished = true;
        if (m) { m.remove_beginRequest(onB); m.remove_endRequest(onE); }
        resolve({ started: started, error: errMsg });
      }
      if (m) { m.add_beginRequest(onB); m.add_endRequest(onE); }
      btn.click();
      setTimeout(function () { if (!started) finish(); }, startTimeout || 4000);
      setTimeout(finish, 60000);
    }).then(function (r) { return sleep(400).then(function () { return r; }); });
  }

  // ------------------------------------------------------------------ guardas (window.open/close/alert/confirm)
  var guard = { alerts: [], saved: [], orig: null };
  function installGuards() {
    if (guard.orig) return;
    guard.orig = { open: window.open, close: window.close, alert: window.alert, confirm: window.confirm };
    // Al guardar bien, Urbetrack (onGuardado) abre una pestaña nueva con Default.aspx y cierra esta: se anotan como señal de guardado.
    window.open = function (u) { guard.saved.push('open ' + (u || '')); return null; };
    window.close = function () { guard.saved.push('close'); };
    window.alert = function (m) { guard.alerts.push('alert: ' + m); };
    window.confirm = function (m) {
      guard.alerts.push('confirm: ' + m);
      return /cambios sin guardar en el mapa|borrar|eliminar|archivo/i.test(String(m));  // confirmaciones conocidas
    };
  }
  function removeGuards() {
    if (!guard.orig) return;
    window.open = guard.orig.open; window.close = guard.orig.close;
    window.alert = guard.orig.alert; window.confirm = guard.orig.confirm;
    guard.orig = null;
  }

  // ------------------------------------------------------------------ campos del formulario
  function pickOption(sel, wanted) {
    var w = norm(wanted), opts = Array.prototype.slice.call(sel.options), m;
    m = opts.filter(function (o) { return norm(o.text) === w; });
    if (m.length === 1) return m[0];
    m = opts.filter(function (o) { return stem(o.text) === stem(wanted); });
    if (m.length === 1) return m[0];
    m = opts.filter(function (o) { var t = norm(o.text); return t && (t.indexOf(w) >= 0 || w.indexOf(t) >= 0); });
    if (m.length === 1) return m[0];
    return null;
  }
  async function setSelect(id, label, wanted) {
    var sel = $id(id);
    if (!sel) throw new Error('No encuentro el combo ' + label);
    var opt = pickOption(sel, wanted);
    if (!opt) {
      throw new Error('"' + wanted + '" no existe en ' + label + '. Opciones: ' +
        Array.prototype.map.call(sel.options, function (o) { return o.text; }).join(' / '));
    }
    if (sel.value !== opt.value) {
      var err = await change(id, opt.value);
      if (err) throw new Error('Error del servidor al elegir ' + label + ': ' + err);
    }
    if ($id(id).value !== opt.value) throw new Error(label + ' no quedó en "' + opt.text + '"');
    return opt.text;
  }
  async function setText(id, label, value) {
    if (!$id(id)) throw new Error('No encuentro el campo ' + label);
    if ($id(id).value === value) return;
    var err = await change(id, value);
    if (err) throw new Error('Error del servidor al completar ' + label + ': ' + err);
    if ($id(id).value !== value) throw new Error(label + ' no quedó como se cargó (' + $id(id).value + ')');
  }

  async function setAddress(text) {
    var a = $id('txtAddress'), $j = window.jQuery;
    if (!a || !$j || !$j(a).autocomplete) throw new Error('No encuentro el autocompletado de dirección');
    var widget = $j(a).autocomplete('widget')[0];
    $j(a).autocomplete('close'); widget.innerHTML = '';
    $id('hidLatLon').value = '';
    a.focus(); a.value = text;
    $j(a).autocomplete('search', text);
    var items = [], t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await sleep(300);
      items = Array.prototype.slice.call(widget.querySelectorAll('li')).filter(function (li) { return li.textContent.trim(); });
      if (items.length) break;
    }
    if (!items.length) throw new Error('Dirección no encontrada por el geocodificador: "' + text + '"');
    var num = (text.match(/(\d+)\s*$/) || [])[1], warn = null, pick = null;
    if (num) {
      var withNum = items.filter(function (li) { return (' ' + norm(li.textContent) + ' ').indexOf(' ' + num + ' ') >= 0; });
      if (withNum.length) pick = withNum[0];
    }
    if (!pick) { pick = items[0]; if (items.length > 1 || num) warn = 'dirección aproximada: ' + pick.textContent.trim(); }
    if (items.length > 1 && !warn) warn = 'varias sugerencias, se eligió "' + pick.textContent.trim() + '"';
    var target = pick.querySelector('div,a') || pick;
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    t0 = Date.now();
    while (Date.now() - t0 < 8000 && !$id('hidLatLon').value) await sleep(250);
    if (!$id('hidLatLon').value) throw new Error('La dirección no se geocodificó (sin coordenadas) para "' + text + '"');
    await sleep(900);   // afterGeocoding: marcar en mapa, ruta, calles
    return { chosen: a.value, warn: warn };
  }

  // ¿El texto es solo la ubicación (calle, altura, "plaza de la república (av X 123)", "A y B 500")? Entonces no es una aclaración.
  function soloUbicacion(cap, dir) {
    var t = norm(String(cap).replace(/\([^)]*\)/g, ' ')).replace(/^\S+ (y|e) /, '');
    var dirWords = norm(dir || '').split(' ').filter(Boolean);
    var ignore = ['y', 'e', 'esq', 'esquina', 'plaza', 'de', 'la', 'el', 'republica', 'av', 'avenida', 'calle', 'altura', 'frente', 'al', 'a', 'en'];
    var left = t.split(' ').filter(function (w) { return w && ignore.indexOf(w) < 0 && dirWords.indexOf(w) < 0 && !/^\d+$/.test(w); });
    return left.length === 0;
  }

  function buildComment(r) {
    var parts = [];
    var cap = String(r.caption || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).join(' | ');
    if (/^(si|true|1)$/i.test(String(r.usar_comentario || ''))) cap = String(r.comentario || '').trim();   // patrullas: solo las aclaraciones
    else if (cap && soloUbicacion(cap, r.direccion)) cap = '';   // el texto es solo la ubicación: no se repite en el comentario
    if (cap) parts.push(cap);
    // solo se agrega lo que el texto original todavía no dice
    var has = function (v) { return norm(cap).replace(/ /g, '').indexOf(norm(v).replace(/ /g, '')) >= 0; };
    if (r.codigo && cfg.actaEn === 'comentario' && !has(r.codigo)) parts.push('Acta: ' + r.codigo);
    if (r.precinto && cfg.precintoEn === 'comentario' && !has(r.precinto)) parts.push('Precinto: ' + r.precinto);
    if (r.numero_orden_sap && cfg.ordenEn === 'comentario' && !has(r.numero_orden_sap)) parts.push('Orden: ' + r.numero_orden_sap);
    return parts.join(' | ');
  }

  // En GOVNA, los SECUESTRO / COMPROBACION / DISUASION / INTIMACION llevan como "Detalle de servicio" el
  // tipo de vendedor (ARTESANO, MANTERO, PARRILLA…). El conversor no lo trae, así que se infiere del texto.
  // Editar esta lista si hace falta: [expresión, detalle]. Se prueba en orden.
  var DETALLE_POR_TEXTO = [
    [/parrill/i, 'PARRILLA'], [/food\s*truck|foodtruck/i, 'FOOD TRUCK'], [/comida|chipa|alimento|choripan|garrapi/i, 'COMIDA ARTESANAL'],
    [/artesan/i, 'ARTESANO'], [/mantero|manta\b|remera|ropa|calzado|zapatill/i, 'MANTERO'], [/comercio|local\b/i, 'COMERCIO'],
    [/puesto|carro|carrito/i, 'PUESTO DE VENTA AMBULANTE']
  ];
  var TIPOS_CON_DETALLE_DE_VENDEDOR = /^(SECUESTRO|COMPROBACION|DISUASION|INTIMACION)$/;
  // POLIGONO si son zonas, PATRULLA si son patrullas, OPERATIVO si es por fuera de esas dos.
  function solicitanteDe(r) { return cfg.solicitante && cfg.solicitante !== 'SEGUN FILA' ? cfg.solicitante : (r.solicitante || 'OPERATIVO'); }
  function effDetalle(r) {
    if (r.detalle_servicio) return { v: r.detalle_servicio, inferido: false };
    if (/^SIN INCIDENCIAS/.test(norm(r.tipo_servicio))) return { v: 'SIN INCIDENCIAS', inferido: false };
    if (cfg.inferirDetalle && TIPOS_CON_DETALLE_DE_VENDEDOR.test(norm(r.tipo_servicio).replace(/ \d+$/, ''))) {
      for (var i = 0; i < DETALLE_POR_TEXTO.length; i++) {
        if (DETALLE_POR_TEXTO[i][0].test(String(r.caption || ''))) return { v: DETALLE_POR_TEXTO[i][1], inferido: true };
      }
    }
    return { v: '', inferido: false };
  }

  // Completa TODOS los campos de una fila (los que no aplican se limpian).
  async function fillRow(r) {
    var res = { warnings: [] };
    await setSelect('cbEmpresa', 'Distrito', cfg.distrito);
    await setSelect('cbGrupo', 'Grupo', r.grupo);
    if (r.tipo_servicio) await setSelect('cbTipoServicio', 'Tipo de servicio', r.tipo_servicio);
    else if ($id('cbTipoServicio').options.length > 1) {
      res.warnings.push('sin tipo de servicio en el JSON: quedó el primero del grupo ("' + $id('cbTipoServicio').selectedOptions[0].text + '")');
    }
    var det = effDetalle(r);
    if (!det.v) {   // si el detalle tiene una sola opción (ej. SIN INCIDENCIAS → SIN INCIDENCIAS, AGRESION → AGRESION) se elige esa
      var unicas = Array.prototype.filter.call($id('cbDetalleServicioHu').options, function (o) { return o.value && norm(o.text) && !/^SELECCION/.test(norm(o.text)); });
      if (unicas.length === 1) det = { v: unicas[0].text, inferido: false };
    }
    if (det.v) {
      await setSelect('cbDetalleServicioHu', 'Detalle de servicio', det.v);
      if (det.inferido) res.warnings.push('detalle inferido del texto: ' + det.v);
    } else if (TIPOS_CON_DETALLE_DE_VENDEDOR.test(norm(r.tipo_servicio).replace(/ \d+$/, ''))) {
      res.warnings.push('sin detalle de servicio (no se reconoció el tipo de vendedor en el texto)');
    }
    await setSelect('cbSolicitante', 'Solicitante', solicitanteDe(r));
    await setSelect('cbTipoIncidencia', 'Rango de incidencia', cfg.rango);
    await setSelect('cbPrioridad', 'Plazo', r.turno);

    var dt = r.datetime || ((r.date || '') + ' ' + (r.time || ''));
    await setText('dtFechaAviso_dtFechaAviso_textBox', 'Fecha de aviso', dt);

    var ad = await setAddress(r.direccion);
    if (ad.warn) res.warnings.push(ad.warn);

    var code = '', ext = '', sap = '';
    if (r.codigo) { if (cfg.actaEn === 'txtCode') code = r.codigo; else if (cfg.actaEn === 'txtExternalIdentifier') ext = r.codigo; }
    if (r.precinto && cfg.precintoEn === 'txtExternalIdentifier') ext = ext ? ext + ' / ' + r.precinto : r.precinto;
    if (r.numero_orden_sap && cfg.ordenEn === 'txtSapNroOrden') sap = r.numero_orden_sap;
    await setText('txtCode', 'Código', code);
    await setText('txtExternalIdentifier', 'Código externo', ext);
    await setText('txtSapNroOrden', 'N° orden SAP', sap);
    await setText('txtComentarioVecino', 'Comentario del vecino', buildComment(r));
    return res;
  }

  // Relee el formulario y compara con lo esperado. Devuelve lista de diferencias.
  function verifyRow(r) {
    var diffs = [];
    function selText(id) { var s = $id(id); return s && s.selectedIndex >= 0 ? s.options[s.selectedIndex].text : ''; }
    function expectSel(id, label, wanted) {
      if (!wanted) return;
      var o = pickOption($id(id), wanted);
      if (!o || $id(id).value !== o.value) diffs.push(label + ': esperado "' + wanted + '", hay "' + selText(id) + '"');
    }
    expectSel('cbEmpresa', 'Distrito', cfg.distrito);
    expectSel('cbGrupo', 'Grupo', r.grupo);
    expectSel('cbTipoServicio', 'Tipo de servicio', r.tipo_servicio);
    expectSel('cbDetalleServicioHu', 'Detalle', effDetalle(r).v);
    expectSel('cbSolicitante', 'Solicitante', solicitanteDe(r));
    expectSel('cbTipoIncidencia', 'Rango', cfg.rango);
    expectSel('cbPrioridad', 'Plazo', r.turno);
    var dt = r.datetime || ((r.date || '') + ' ' + (r.time || ''));
    if ($id('dtFechaAviso_dtFechaAviso_textBox').value !== dt) diffs.push('Fecha de aviso: esperado ' + dt + ', hay ' + $id('dtFechaAviso_dtFechaAviso_textBox').value);
    if (!$id('hidLatLon').value) diffs.push('Dirección sin coordenadas');
    if ($id('txtComentarioVecino').value !== buildComment(r)) diffs.push('Comentario distinto al esperado');
    return diffs;
  }

  // ------------------------------------------------------------------ guardado y fotos
  function readIncidentId() {
    var v = ($id('hIdIncidencia') && $id('hIdIncidencia').value) || ($id('hidIdIncidencia') && $id('hidIdIncidencia').value) || '';
    if (v.indexOf('|') > 0) v = v.substr(0, v.indexOf('|'));
    return v.trim();
  }
  function infoText() {
    return ['updInfoLabel', 'infoLabel1', 'upTitulo'].map(function (i) { var e = $id(i); return e ? e.innerText.trim() : ''; })
      .filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 300);
  }

  // Textos de error visibles en la página (validadores de ASP.NET y textos en rojo), para saber por qué no guardó.
  function problemasVisibles() {
    var out = [];
    try {
      if (window.Page_Validators) window.Page_Validators.forEach(function (v) { if (v && v.isvalid === false) out.push('validador: ' + (v.errormessage || v.id)); });
    } catch (e) { }
    try {
      Array.prototype.forEach.call(document.querySelectorAll('span,div,label,font,td'), function (e) {
        if (e.children.length > 2 || !e.offsetParent) return;
        var tx = (e.innerText || '').trim(); if (!tx || tx.length > 160) return;
        var m = getComputedStyle(e).color.match(/\d+/g); if (!m) return;
        if (+m[0] > 150 && +m[1] < 90 && +m[2] < 90 && out.indexOf('en rojo: ' + tx) < 0) out.push('en rojo: ' + tx);
      });
    } catch (e) { }
    return out.slice(0, 6).join(' | ');
  }

  // Listado de "Imágenes de aviso" (archivos subidos y todavía no asociados a una incidencia guardada).
  function pendingNames() {
    return Array.prototype.map.call(document.querySelectorAll('#chkFiles label span'), function (e) { return e.textContent.trim().toLowerCase(); });
  }
  async function waitPending(pred, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms) { if (pred(pendingNames())) return true; await sleep(300); }
    return pred(pendingNames());
  }
  // Borra del listado todos los archivos pendientes (los tilda y aprieta "Borrar archivos seleccionados").
  async function clearPending() {
    var boxes = document.querySelectorAll('#chkFiles input[type=checkbox]');
    if (!boxes.length) return;
    Array.prototype.forEach.call(boxes, function (c) { c.checked = true; });
    await clickAndWait($id('btnDeleteFile'), 5000);
    await waitPending(function (n) { return n.length === 0; }, 8000);
  }
  // Tilda el cuadradito SOLO de las fotos de esta fila (por nombre) y destilda cualquier otra que haya quedado en la lista.
  function lblOf(c) { var l = c.parentNode && c.parentNode.querySelector('label span'); return (l ? l.textContent : (c.parentNode ? c.parentNode.textContent : '')).trim().toLowerCase(); }
  function tickPending(names) {
    var want = (names || []).map(function (n) { return n.toLowerCase(); });
    var boxes = document.querySelectorAll('#chkFiles input[type=checkbox]');
    Array.prototype.forEach.call(boxes, function (c) {
      var mine = want.some(function (n) { return lblOf(c).indexOf(n) >= 0; });
      if (c.checked !== mine) { c.click(); if (c.checked !== mine) c.checked = mine; }
    });
    return boxes.length;
  }
  // true si la lista tiene exactamente las fotos de esta fila y todas tildadas
  function pendingOk(names) {
    var want = (names || []).map(function (n) { return n.toLowerCase(); }).sort().join('|');
    var boxes = Array.prototype.slice.call(document.querySelectorAll('#chkFiles input[type=checkbox]'));
    var have = boxes.map(function (c) { return lblOf(c); }).sort().join('|');
    return have === want && boxes.every(function (c) { return c.checked; });
  }
  // Sube las fotos ANTES de guardar: quedan en "Imágenes de aviso" y se asocian al guardar la incidencia.
  async function uploadPhotos(files) {
    var ifr = $id('iFileUpload'), out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (pendingNames().indexOf(f.name.toLowerCase()) >= 0) { out.push({ name: f.name, ok: true, msg: 'ya estaba' }); continue; }
      var doc = ifr.contentDocument, win = ifr.contentWindow;
      var inp = doc.getElementById('fileUpload');
      if (!inp) { out.push({ name: f.name, ok: false, msg: 'no encuentro el campo de archivo' }); continue; }
      var dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
      try { win.getIdIncidencia(); } catch (e) { /* el id queda vacío: la incidencia todavía no existe */ }
      var loaded = new Promise(function (res) { ifr.addEventListener('load', function () { res(true); }, { once: true }); setTimeout(function () { res(false); }, 45000); });
      doc.getElementById('btUploadFile').click();
      await loaded;
      var listed = await waitPending(function (n) { return n.indexOf(f.name.toLowerCase()) >= 0; }, 10000);
      var txt = ''; try { txt = ifr.contentDocument.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 160); } catch (e) { }
      out.push({ name: f.name, ok: listed, msg: listed ? '' : ('no aparece en el listado. ' + txt) });
    }
    return out;
  }

  async function newForm() {
    var b = $id('btNuevo');
    if (!b) throw new Error('No encuentro el botón "Nuevo"');
    var r = await clickAndWait(b, 5000);
    if (r.error) throw new Error('Error al limpiar el formulario: ' + r.error);
    await sleep(600);
  }

  // ------------------------------------------------------------------ persistencia (sobrevive a la recarga que hace Guardar)
  function idb() {
    return new Promise(function (res, rej) {
      var q = indexedDB.open('ub_carga', 1);
      q.onupgradeneeded = function () { q.result.createObjectStore('kv'); q.result.createObjectStore('photos'); };
      q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
    });
  }
  function idbTx(store, mode, fn) {
    return idb().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), out = fn(t.objectStore(store));
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function persistRows() {
    var copy = state.rows.map(function (r) { return Object.assign({}, r); });
    try { localStorage.setItem(LS_ROWS, JSON.stringify(copy)); } catch (e) { }
    return idbTx('kv', 'readwrite', function (st) { return st.put(copy, 'rows'); })
      .catch(function (e) { setStatus('⚠ No pude guardar las filas en el navegador: ' + (e && e.message || e)); });
  }
  function persistPhotos() {
    var entries = [];
    state.photos.forEach(function (f, k) { entries.push([k, f]); });
    return idbTx('photos', 'readwrite', function (st) {
      st.clear();
      entries.forEach(function (e) { st.put(e[1], e[0]); });
    }).then(function () {
      return idb().then(function (d) {
        return new Promise(function (res) {
          var t = d.transaction('photos', 'readonly'), q = t.objectStore('photos').count();
          t.oncomplete = function () { res(q.result); };
          t.onerror = function () { res(-1); };
        });
      });
    }).then(function (n) {
      setStatus(n === entries.length ? state.photos.size + ' fotos cargadas y guardadas en el navegador (sobreviven a la recarga).'
        : '⚠ Se cargaron ' + entries.length + ' fotos pero solo ' + n + ' quedaron guardadas en el navegador.');
    }).catch(function (e) { setStatus('⚠ No pude guardar las fotos en el navegador: ' + (e && e.message || e)); });
  }
  async function restoreFromDb() {
    try {
      var d = await idb();
      await new Promise(function (res) {
        var t = d.transaction(['kv', 'photos'], 'readonly');
        var rq = t.objectStore('kv').get('rows');
        var ks = t.objectStore('photos').getAllKeys(), vs = t.objectStore('photos').getAll();
        t.oncomplete = function () {
          if (Array.isArray(rq.result) && rq.result.length) state.rows = rq.result;
          state.photos = new Map();
          (ks.result || []).forEach(function (k, i) { state.photos.set(k, vs.result[i]); });
          res();
        };
        t.onerror = function () { res(); };
      });
    } catch (e) { }
    var lg = lsGet(LS_LOG, []); if (Array.isArray(lg) && lg.length && !state.log.length) state.log = lg;
    if (!state.rows.length) { var ls = lsGet(LS_ROWS, []); if (Array.isArray(ls) && ls.length) state.rows = ls; }
  }

  // ------------------------------------------------------------------ orquestación
  function log(idx, estado, msg, extra) {
    var e = Object.assign({ fila: idx + 1, estado: estado, mensaje: msg || '', hora: new Date().toLocaleString('es-AR') }, extra || {});
    state.log.push(e);
    try { localStorage.setItem(LS_LOG, JSON.stringify(state.log)); } catch (x) { }
    var r = state.rows[idx]; if (r) { r._estado = estado; r._msg = msg || ''; if (estado === 'guardada') r._sel = false; }   // una fila guardada se destilda sola para no repetirla
    persistRows();
    render();
  }
  function waitGate(text) {
    setStatus(text);
    return new Promise(function (res) { state.gate = res; render(); });
  }

  async function processRow(idx) {
    var r = state.rows[idx], key = rowKey(r), tRow = Date.now();
    log(idx, 'trabajando', 'completando formulario…');
    guard.alerts = [];
    await clearPending();          // por si quedó algún archivo suelto de una prueba anterior
    var fill = await fillRow(r);
    var diffs = verifyRow(r);
    if (diffs.length) throw new Error('Verificación fallida → ' + diffs.join('; '));
    var warn = fill.warnings.join('; ');

    var files = (r.files || (r.file ? [r.file] : [])).map(function (n) { return { name: n, file: state.photos.get(n.toLowerCase()) }; });
    var missing = files.filter(function (x) { return !x.file; }).map(function (x) { return x.name; });
    if (missing.length && !cfg.dryRun) throw new Error('Faltan fotos en la carpeta elegida: ' + missing.join(', '));
    if (missing.length) warn += (warn ? '; ' : '') + 'faltan fotos: ' + missing.join(', ');

    // ---- fotos: se suben antes de guardar (quedan en "Imágenes de aviso")
    var upNote = '';
    if (!cfg.dryRun || cfg.subirEnSim) {
      var up = await uploadPhotos(files.map(function (x) { return x.file; }).filter(Boolean));
      var badUp = up.filter(function (u) { return !u.ok; });
      if (badUp.length) throw new Error('Fallaron fotos: ' + badUp.map(function (u) { return u.name + ' (' + u.msg + ')'; }).join(', '));
      upNote = up.length + ' foto(s) subidas';
    }
    var myNames = files.map(function (x) { return x.name; });
    if (files.length && (!cfg.dryRun || cfg.subirEnSim)) {
      tickPending(myNames);
      if (!cfg.dryRun && !pendingOk(myNames)) throw new Error('La lista de fotos no coincide con las de esta fila (hay otras o falta tildar): ' + pendingNames().join(', '));
      upNote += ' y tildadas';
    }

    if (cfg.stepMode) {
      log(idx, 'esperando', 'completa y verificada' + (upNote ? ' · ' + upNote : '') + (warn ? ' — ' + warn : ''));
      var go = await waitGate('Fila ' + (idx + 1) + ' completa' + (cfg.dryRun ? ' (SIMULACIÓN)' : '') + '. Revisá el formulario y elegí Continuar' + (cfg.dryRun ? '' : ' → GUARDA') + ' u Omitir.');
      if (go === 'skip') { await clearPending(); log(idx, 'omitida', 'omitida por el usuario'); return; }
    }
    if (cfg.dryRun) {
      await clearPending();     // la simulación no deja fotos pendientes
      log(idx, 'simulada', 'formulario completo y verificado' + (upNote ? ' · ' + upNote + ' (borradas)' : '') + (warn ? ' — ' + warn : ''));
      return;
    }

    // ---- guardar de verdad
    if (files.length) {
      tickPending(myNames);     // sin el cuadradito tildado, Urbetrack no asocia la foto
      if (!pendingOk(myNames)) throw new Error('Antes de guardar, la lista de fotos no coincide con las de esta fila: ' + pendingNames().join(', '));
    }
    sessionStorage.setItem('ub_carga_pending', JSON.stringify({ key: key, fila: idx + 1, t: Date.now() }));
    guard.saved = [];
    var tSave = Date.now();
    var res = await clickAndWait($id('btGuardar'), 6000);
    // A veces el primer clic en Guardar no arranca (aparece "Fuera de la zona de servicio" y no hace nada); el segundo sí.
    // Si no arrancó, no se mandó nada al servidor: se puede reintentar sin riesgo de duplicar.
    for (var intento = 0; intento < 2 && !res.started && !res.error; intento++) {
      await sleep(1500);
      res = await clickAndWait($id('btGuardar'), 6000);
    }
    var info = infoText();
    if (!res.started) throw new Error('El guardado no arrancó (validación del formulario). ' + guard.alerts.join(' | ') + ' ' + info + ' · Página dice: ' + (problemasVisibles() || 'nada visible'));
    if (res.error) throw new Error('Error del servidor al guardar: ' + res.error);
    // Señales de que se guardó: N° de incidencia, aviso de Urbetrack (abre/cierra ventana) o, si había fotos, que salgan de la lista de pendientes.
    // Si Urbetrack recarga la página, este script termina acá y se retoma en resumeAfterReload.
    // Se revisa cada 1/4 s para seguir apenas haya señal; el tope es 150 s con fotos y 20 s sin fotos.
    var id = '', how = '', tope = files.length ? 150000 : 20000;
    while (true) {
      id = readIncidentId();
      if (id) { how = 'N° de incidencia'; break; }
      if (guard.saved.length) { how = 'aviso de Urbetrack'; break; }
      if (files.length && pendingNames().length === 0) { how = 'fotos asociadas'; break; }
      if (Date.now() - tSave > tope) break;
      await sleep(250);
    }
    var secs = function (t) { return Math.round((Date.now() - t) / 1000) + ' s'; };
    var tiempos = 'fila ' + secs(tRow) + ', guardado ' + secs(tSave);
    if (!how && files.length) {
      throw new Error('No hay señal de que se haya guardado (sin N° de incidencia y las fotos siguen pendientes, ' + secs(tSave) + '). Info: ' + info + ' ' + guard.alerts.join(' | ') + ' · Página dice: ' + (problemasVisibles() || 'nada visible'));
    }
    done[key] = { id: id || '?', t: Date.now() }; lsSet(LS_DONE, done);
    if (!how) {
      sessionStorage.removeItem('ub_carga_pending');
      state.stop = true;
      log(idx, 'guardada', 'se guardó pero no pude confirmarlo ni leer el N° de incidencia; corrida frenada para que lo verifiques (' + tiempos + '). Info: ' + info + (warn ? ' — ' + warn : ''));
      return;
    }
    log(idx, 'guardada', (id ? 'incidencia ' + id : 'guardada (' + how + '; N° no leído)') + ' · ' + (upNote || 'sin fotos') + ' · ' + tiempos + (warn ? ' — ' + warn : ''), id ? { incidencia: id } : null);
    // Formulario nuevo para la fila siguiente. La marca de "guardado en curso" se borra recién después:
    // si la página se recarga mientras tanto, resumeAfterReload sigue con la cola sin repetir esta fila.
    try { await newForm(); }
    catch (e) { state.stop = true; setStatus('Fila ' + (idx + 1) + ' guardada, pero no pude limpiar el formulario (' + e.message + '). Apretá Nuevo y volvé a Procesar.'); }
    sessionStorage.removeItem('ub_carga_pending');
  }

  async function run(indices, resumed) {
    if (state.running) return;
    if (!indices.length) { setStatus('No hay filas seleccionadas.'); return; }
    if (!state.rows.length) return;
    if (!resumed && !cfg.dryRun && !confirm('Se van a GUARDAR ' + indices.length + ' incidencia(s) en Urbetrack (distrito ' + cfg.distrito + ').\n\n¿Confirmás?')) return;
    state.running = true; state.stop = false; installGuards(); render();
    try {
      for (var i = 0; i < indices.length && !state.stop; i++) {
        var idx = indices[i];
        try { sessionStorage.setItem('ub_carga_run', JSON.stringify({ indices: indices, pos: i, t: Date.now() })); } catch (e) { }
        try { await processRow(idx); }
        catch (e) {
          log(idx, 'error', e.message);
          // si falló en medio, limpiar para que la fila siguiente arranque de cero
          // (salvo que haya un guardado en curso: ahí no se toca el formulario)
          var inFlight = false; try { var pp = JSON.parse(sessionStorage.getItem('ub_carga_pending') || 'null'); inFlight = !!pp && Date.now() - pp.t < 90000; } catch (e3) { }
          if (inFlight) { state.stop = true; setStatus('Corrida frenada: hay un guardado en curso de la fila ' + (idx + 1) + '. Verificá en Urbetrack antes de seguir.'); break; }
          try { await clearPending(); if (!cfg.dryRun) await newForm(); } catch (e2) { state.stop = true; }
        }
      }
    } finally {
      try { sessionStorage.removeItem('ub_carga_run'); } catch (e) { }
      removeGuards(); state.running = false; state.gate = null;
      var ok = state.log.filter(function (l) { return /guardada|simulada/.test(l.estado); }).length;
      setStatus(state.stop ? 'Corrida frenada.' : 'Terminó la corrida. OK: ' + ok + ' · Errores: ' + state.log.filter(function (l) { return l.estado === 'error'; }).length);
      render();
    }
  }

  // ------------------------------------------------------------------ interfaz
  var panel, statusEl, listEl, bodyEl;
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  function css() {
    var s = document.createElement('style');
    s.textContent =
      '#ubc{position:fixed;top:8px;left:8px;width:430px;max-height:92vh;z-index:2147483000;background:#fff;color:#1c231f;font:12.5px/1.35 -apple-system,Segoe UI,Arial,sans-serif;border:1px solid #0f6e5c;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.28);display:flex;flex-direction:column}' +
      '#ubc *{box-sizing:border-box}#ubc .h{background:#0f6e5c;color:#fff;padding:7px 10px;border-radius:9px 9px 0 0;font-weight:700;cursor:pointer;display:flex;justify-content:space-between}' +
      '#ubc .b{padding:8px 10px;display:flex;flex-direction:column;min-height:0;overflow:hidden}' +
      '#ubc .top{flex:0 0 auto}#ubc #ubc-list{flex:1 1 auto;min-height:90px;overflow:auto;border-top:1px solid #cfd8d3;margin-top:4px}' +
      '#ubc #ubc-list th{position:sticky;top:0;background:#fff;z-index:1}#ubc .flt label{background:#f1f4f2;border-radius:9px;padding:1px 7px}#ubc button{font:inherit;padding:4px 9px;border:1px solid #9aa;border-radius:6px;background:#f1f4f2;cursor:pointer}' +
      '#ubc button.p{background:#0f6e5c;color:#fff;border-color:#0f6e5c}#ubc button.d{background:#b23a2f;color:#fff;border-color:#b23a2f}#ubc button:disabled{opacity:.45;cursor:not-allowed}' +
      '#ubc .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0}#ubc label{display:flex;gap:4px;align-items:center}' +
      '#ubc select,#ubc input[type=text]{font:inherit;padding:2px 4px;border:1px solid #9aa;border-radius:5px;max-width:150px}' +
      '#ubc table{width:100%;border-collapse:collapse;margin-top:0;font:inherit}#ubc td,#ubc th{border-bottom:1px solid #e1e5e2;padding:3px 4px;text-align:left;vertical-align:top}' +
      '#ubc .st{font-size:11px;padding:1px 6px;border-radius:9px;background:#eee;white-space:nowrap}' +
      '#ubc .st.guardada,#ubc .st.simulada{background:#dff3e2;color:#1e6b34}#ubc .st.error{background:#fbe4e1;color:#a3352a}#ubc .st.trabajando{background:#fdf1d6;color:#8a5a09}' +
      '#ubc .st.repetida{background:#e6e6f5;color:#3a3a8a}#ubc .m{color:#666;font-size:11px}#ubc .s{background:#f4f6f3;border-radius:6px;padding:5px 7px;margin:4px 0;min-height:30px}';
    document.head.appendChild(s);
  }

  function build() {
    css();
    panel = document.createElement('div'); panel.id = 'ubc';
    panel.innerHTML =
      '<div class="h"><span>Carga automática · WhatsApp → Urbetrack · v' + VERSION + '</span><span id="ubc-tg">–</span></div>' +
      '<div class="b" id="ubc-body"><div class="top">' +
      '<div class="r"><a href="https://search00-sketch.github.io/urbetrack-carga/" target="_blank" rel="noopener" style="color:#0a58ca;font-weight:600;margin-right:6px">🔗 Abrir conversor</a><button id="ubc-json">1 · Cargar JSON/CSV/Excel…</button><button id="ubc-paste">Pegar datos…</button><button id="ubc-fotos">2 · Carpeta de fotos…</button><span class="m" id="ubc-info"></span></div>' +
      '<input type="file" id="ubc-jf" accept=".json,.csv,.xlsx,.xls" style="display:none"><input type="file" id="ubc-ff" webkitdirectory multiple style="display:none">' +
      '<div class="r"><label>Distrito <input type="text" id="ubc-dist" size="8"></label><label>Rango <input type="text" id="ubc-rango" size="9"></label></div>' +
      '<div class="r"><label>Solicitante <select id="ubc-sol"><option>POLIGONO</option><option>PATRULLA</option><option>OPERATIVO</option><option>SEGUN FILA</option></select></label></div>' +
      '<div class="r"><label>N° acta en <select id="ubc-acta"><option value="txtCode">Código</option><option value="txtExternalIdentifier">Código externo</option><option value="comentario">Comentario</option><option value="ninguno">no cargar</option></select></label>' +
      '<label>Precinto en <select id="ubc-prec"><option value="comentario">Comentario</option><option value="txtExternalIdentifier">Código externo</option><option value="ninguno">no cargar</option></select></label></div>' +
      '<div class="r"><label><input type="checkbox" id="ubc-dry"> <b>Simulación</b> (completa pero NO guarda)</label><label><input type="checkbox" id="ubc-step"> Pausar en cada fila</label><label><input type="checkbox" id="ubc-inf"> Inferir tipo de vendedor</label><label><input type="checkbox" id="ubc-sim-up"> Subir fotos también en simulación</label></div>' +
      '<div class="r"><button class="p" id="ubc-run">▶ Procesar seleccionadas</button><button class="d" id="ubc-stop">■ Frenar</button><button id="ubc-dl">⬇ Log</button></div>' +
      '<div class="r" id="ubc-pastebox" style="display:none;flex-direction:column;align-items:stretch"><textarea id="ubc-pta" rows="6" placeholder="Pegá acá el contenido (JSON o CSV) que copiaste del conversor" style="width:100%;font:11px/1.3 monospace"></textarea><div class="r"><button class="p" id="ubc-pok">Cargar</button><button id="ubc-pno">Cancelar</button></div></div>' +
      '<div class="s" id="ubc-status">Cargá el JSON del conversor y la carpeta de fotos.</div>' +
      '<div class="r" id="ubc-gate" style="display:none"><button class="p" id="ubc-go">Continuar</button><button id="ubc-skip">Omitir esta fila</button></div>' +
      '<div class="r flt"><b>Ver:</b><label><input type="checkbox" id="ubc-v-pendiente"> pendientes <span id="ubc-n-pendiente"></span></label>' +
      '<label><input type="checkbox" id="ubc-v-error"> con error <span id="ubc-n-error"></span></label>' +
      '<label><input type="checkbox" id="ubc-v-cargada"> cargadas <span id="ubc-n-cargada"></span></label></div>' +
      '<div class="r"><label><input type="checkbox" id="ubc-all" checked> tildar / destildar las que se ven</label><span class="m" id="ubc-nsel"></span></div>' +
      '</div><div id="ubc-list"></div></div>';
    document.body.appendChild(panel);
    statusEl = $id('ubc-status'); listEl = $id('ubc-list'); bodyEl = $id('ubc-body');
    $id('ubc-dist').value = cfg.distrito; $id('ubc-rango').value = cfg.rango;
    $id('ubc-sol').value = cfg.solicitante; $id('ubc-acta').value = cfg.actaEn; $id('ubc-prec').value = cfg.precintoEn;
    $id('ubc-dry').checked = cfg.dryRun; $id('ubc-step').checked = cfg.stepMode; $id('ubc-inf').checked = cfg.inferirDetalle; $id('ubc-sim-up').checked = cfg.subirEnSim;

    panel.querySelector('.h').onclick = function () { api.toggle(); };
    $id('ubc-json').onclick = function () { $id('ubc-jf').click(); };
    $id('ubc-fotos').onclick = function () { $id('ubc-ff').click(); };
    $id('ubc-paste').onclick = function () { $id('ubc-pastebox').style.display = 'flex'; $id('ubc-pta').focus(); };
    $id('ubc-pno').onclick = function () { $id('ubc-pastebox').style.display = 'none'; };
    $id('ubc-pok').onclick = function () { var t = $id('ubc-pta').value.trim(); if (!t) { setStatus('Pegá primero el contenido.'); return; } loadText(t, ''); $id('ubc-pta').value = ''; $id('ubc-pastebox').style.display = 'none'; };
    $id('ubc-jf').onchange = function (e) { loadJson(e.target.files[0]); };
    $id('ubc-ff').onchange = function (e) { loadPhotos(Array.prototype.slice.call(e.target.files)); };
    $id('ubc-dist').onchange = function (e) { cfg.distrito = e.target.value.trim() || 'GOVNA'; saveCfg(); };
    $id('ubc-rango').onchange = function (e) { cfg.rango = e.target.value.trim() || 'Solicitud'; saveCfg(); };
    $id('ubc-sol').onchange = function (e) { cfg.solicitante = e.target.value; saveCfg(); };
    $id('ubc-acta').onchange = function (e) { cfg.actaEn = e.target.value; saveCfg(); };
    $id('ubc-prec').onchange = function (e) { cfg.precintoEn = e.target.value; saveCfg(); };
    $id('ubc-dry').onchange = function (e) { cfg.dryRun = e.target.checked; saveCfg(); };
    $id('ubc-step').onchange = function (e) { cfg.stepMode = e.target.checked; saveCfg(); };
    $id('ubc-inf').onchange = function (e) { cfg.inferirDetalle = e.target.checked; saveCfg(); };
    $id('ubc-sim-up').onchange = function (e) { cfg.subirEnSim = e.target.checked; saveCfg(); };
    // tildar / destildar solo las filas visibles; las ya cargadas nunca se tildan solas
    $id('ubc-all').onchange = function (e) { state.rows.forEach(function (r) { if (visible(r)) r._sel = e.target.checked && cat(r) !== 'cargada'; }); persistRows(); render(); };
    ['pendiente', 'error', 'cargada'].forEach(function (k) {
      $id('ubc-v-' + k).checked = cfg.ver[k] !== false;
      $id('ubc-v-' + k).onchange = function (e) { cfg.ver[k] = e.target.checked; saveCfg(); render(); };
    });
    $id('ubc-run').onclick = function () {
      var idxs = []; state.rows.forEach(function (r, i) { if (r._sel) idxs.push(i); });
      run(idxs);
    };
    $id('ubc-stop').onclick = function () { state.stop = true; if (state.gate) { var g = state.gate; state.gate = null; g('skip'); } setStatus('Frenando después de la fila en curso…'); };
    $id('ubc-go').onclick = function () { if (state.gate) { var g = state.gate; state.gate = null; g('go'); render(); } };
    $id('ubc-skip').onclick = function () { if (state.gate) { var g = state.gate; state.gate = null; g('skip'); render(); } };
    $id('ubc-dl').onclick = downloadLog;
  }

  // CSV del conversor (o editado en Excel): columnas en camelCase o snake_case; fotos separadas por "|".
  function parseCsv(text) {
    text = text.replace(/^\ufeff/, '');
    var delim = (text.split(/\r?\n/)[0].match(/;/g) || []).length > (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  var HMAP = { tipoServicio: 'tipo_servicio', detalleServicio: 'detalle_servicio', numeroOrdenSap: 'numero_orden_sap', usarComentario: 'usar_comentario' };
  function tableToRows(t) {
    var head = t[0].map(function (h) { h = String(h == null ? '' : h).trim(); return HMAP[h] || h; });
    return t.slice(1).filter(function (r) { return r.some(function (v) { return String(v == null ? '' : v).trim(); }); }).map(function (r) {
      var o = {}; head.forEach(function (h, i) { o[h] = String(r[i] == null ? '' : r[i]).trim() || null; });
      o.files = o.files ? o.files.split('|').map(function (x) { return x.trim(); }).filter(Boolean) : (o.file ? [o.file] : []);
      return o;
    });
  }
  function csvToRows(text) { return tableToRows(parseCsv(text.replace(/^\ufeff/, ''))); }
  function xlsxToRows(buf) {
    if (typeof XLSX === 'undefined') throw new Error('Para leer Excel hace falta instalar el script con Tampermonkey (en consola no está la librería). Usá el CSV.');
    var wb = XLSX.read(buf, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    return tableToRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }));
  }

  function loadText(t, name, preRows) {
    try {
      var isCsv = !preRows && (/\.csv$/i.test(name || '') || (!/^\s*[\[{]/.test(t)));
      var data = preRows || (isCsv ? csvToRows(t) : JSON.parse(t));
      if (!Array.isArray(data)) throw new Error('El JSON debería ser una lista de incidencias');
      state.rows = data.map(function (r) {
        r._sel = true; r._estado = ''; r._msg = '';
        if (done[rowKey(r)]) { r._estado = 'repetida'; r._sel = false; r._msg = 'ya cargada antes (incidencia ' + done[rowKey(r)].id + ')'; }
        return r;
      });
      setStatus(state.rows.length + ' filas cargadas de ' + (name || 'los datos pegados') + '.');
      persistRows();
      render();
    } catch (e) { setStatus('No pude leer los datos: ' + e.message); }
  }
  function loadJson(file) {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      file.arrayBuffer().then(function (b) { loadText(null, file.name, xlsxToRows(b)); }).catch(function (e) { setStatus('No pude leer el Excel: ' + e.message); });
      return;
    }
    file.text().then(function (t) { loadText(t, file.name); }).catch(function (e) { setStatus('No pude leer el archivo: ' + e.message); });
  }

  function loadPhotos(files) {
    state.photos = new Map();
    files.forEach(function (f) { state.photos.set(f.name.toLowerCase(), f); });
    setStatus(state.photos.size + ' archivos en la carpeta de fotos. Guardándolos en el navegador…');
    persistPhotos();
    render();
  }

  // Estado de una fila para los filtros: cargada (guardada o ya cargada antes), error, o pendiente (el resto).
  function cat(r) { return /^(guardada|repetida)/.test(r._estado || '') ? 'cargada' : (r._estado === 'error' ? 'error' : 'pendiente'); }
  function visible(r) { return cfg.ver[cat(r)] !== false; }

  function render() {
    if (!listEl) return;
    var n = { pendiente: 0, error: 0, cargada: 0 }, nsel = 0;
    state.rows.forEach(function (r) { n[cat(r)]++; if (r._sel) nsel++; });
    ['pendiente', 'error', 'cargada'].forEach(function (k) { $id('ubc-n-' + k).textContent = '(' + n[k] + ')'; });
    $id('ubc-nsel').textContent = nsel + ' tildadas para procesar';
    var nPhotos = state.photos.size;
    $id('ubc-info').textContent = state.rows.length + ' filas · ' + nPhotos + ' fotos';
    $id('ubc-gate').style.display = state.gate ? 'flex' : 'none';
    $id('ubc-run').disabled = state.running; $id('ubc-json').disabled = state.running; $id('ubc-paste').disabled = state.running; $id('ubc-fotos').disabled = state.running;
    var h = '<table><tr><th></th><th>#</th><th>Fecha · Dirección</th><th>Grupo / Tipo</th><th>Fotos</th><th>Estado</th></tr>';
    state.rows.forEach(function (r, i) {
      if (!visible(r)) return;
      var files = r.files || (r.file ? [r.file] : []);
      var miss = files.filter(function (n) { return !state.photos.has(n.toLowerCase()); }).length;
      var ph = files.length + (nPhotos && miss ? ' <span style="color:#a3352a">(faltan ' + miss + ')</span>' : '');
      h += '<tr><td><input type="checkbox" data-i="' + i + '"' + (r._sel ? ' checked' : '') + (state.running ? ' disabled' : '') + '></td><td>' + (i + 1) + '</td>' +
        '<td>' + esc(r.datetime || r.date + ' ' + r.time) + '<br><b>' + esc(r.direccion) + '</b></td>' +
        '<td>' + esc(r.grupo) + '<br><span class="m">' + esc(r.tipo_servicio || '') + (r.detalle_servicio ? ' / ' + esc(r.detalle_servicio) : '') + '</span></td>' +
        '<td>' + ph + '</td><td>' + (r._estado ? '<span class="st ' + esc(r._estado.split('-')[0]) + '">' + esc(r._estado) + '</span>' : '') +
        (r._msg ? '<div class="m">' + esc(r._msg) + '</div>' : '') + '</td></tr>';
    });
    listEl.innerHTML = h + '</table>';
    Array.prototype.forEach.call(listEl.querySelectorAll('input[data-i]'), function (c) {
      c.onchange = function () { state.rows[+c.dataset.i]._sel = c.checked; persistRows(); render(); };
    });
  }

  function downloadLog() {
    if (!state.log.length) { setStatus('Todavía no hay log.'); return; }
    var cols = ['fila', 'hora', 'estado', 'incidencia', 'mensaje'];
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var csv = cols.join(',') + '\n' + state.log.map(function (l) { return cols.map(function (c) { return q(l[c]); }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = 'log-carga-urbetrack-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  var api = {
    toggle: function () { var hidden = bodyEl.style.display === 'none'; bodyEl.style.display = hidden ? '' : 'none'; $id('ubc-tg').textContent = hidden ? '–' : '+'; },
    state: state, cfg: cfg, fillRow: fillRow, verifyRow: verifyRow   // expuestos para depurar desde la consola
  };
  window.__ubCarga = api;
  build(); render();

  // Al guardar, Urbetrack recarga la página completa: se restauran filas y fotos, se da por guardada la fila en curso y se sigue con la cola.
  (async function resumeAfterReload() {
    var pend = null, runRec = null;
    try { pend = JSON.parse(sessionStorage.getItem('ub_carga_pending') || 'null'); runRec = JSON.parse(sessionStorage.getItem('ub_carga_run') || 'null'); } catch (e) { }
    await restoreFromDb();
    render();
    if (!pend) return;
    sessionStorage.removeItem('ub_carga_pending');
    var idx = pend.fila - 1, recent = Date.now() - pend.t < 5 * 60000;
    var blank = !($id('txtAddress') && $id('txtAddress').value);   // formulario vacío = el guardado hizo su postback
    if (!recent || !blank || !state.rows[idx]) {
      setStatus('⚠ La página se recargó mientras se guardaba la fila ' + pend.fila + ' y no puedo confirmar el resultado. Verificá en Urbetrack si quedó guardada antes de repetirla.');
      try { sessionStorage.removeItem('ub_carga_run'); } catch (e) { }
      return;
    }
    done[pend.key] = { id: '?', t: Date.now() }; lsSet(LS_DONE, done);
    if (state.rows[idx]._estado !== 'guardada') log(idx, 'guardada', 'guardada (la página se recargó; el N° de incidencia no se pudo leer: verificalo en el export de Urbetrack)');
    try { await clearPending(); } catch (e) { }
    var rest = runRec && runRec.indices ? runRec.indices.slice(runRec.pos + 1) : [];
    try { sessionStorage.removeItem('ub_carga_run'); } catch (e) { }
    if (rest.length) {
      setStatus('Fila ' + pend.fila + ' guardada. Sigo con las ' + rest.length + ' restantes…');
      await sleep(1200);
      run(rest, true);
    } else {
      setStatus('Fila ' + pend.fila + ' guardada. No quedan filas en la cola.');
    }
  })();
})();
