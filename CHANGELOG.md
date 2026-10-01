# Cambios

## 0.7.0
- Guardado más rápido: después de Guardar sigue apenas Urbetrack avisa que guardó (abre/cierra ventana), aparece el N° o las fotos salen de la lista, en vez de esperar la recarga (revisa cada 1/4 s; tope 150 s con fotos, 20 s sin fotos).
- Las filas sin fotos ya no frenan la corrida después de guardar.
- El log anota cuánto tardó cada fila y cada guardado.
- Espera menos en los combos que no recargan el formulario.

## 0.5.1
- Link "Abrir conversor" en el panel.

## 0.5.0
- Acepta **Excel (.xlsx)** además de JSON/CSV (lee la primera hoja; mismas columnas que exporta el conversor).
- Nuevo `index.html`: conversor publicado con GitHub Pages, con descarga directa de Excel, CSV y JSON.

## 0.4.0
- Botón **Pegar datos…**: se pega el JSON/CSV copiado del conversor, sin depender de descargar el archivo (útil con otras cuentas).

## 0.3.4
- Tras Guardar espera hasta 30 s a que la página se recargue; si hay un guardado en curso y falla, frena la corrida sin limpiar el formulario.

## 0.3.3
- El log sobrevive a las recargas y registra fecha y hora.

## 0.3.2
- Una fila guardada se destilda sola para no repetirla.

## 0.3.1
- Avisos visibles si falla el guardado en el navegador; las filas tienen respaldo en localStorage.

## 0.3.0
- Filas y fotos sobreviven a la recarga (IndexedDB); continúa solo después de cada guardado.

## 0.2.0
- Solicitante configurable (POLIGONO por defecto), detalle SIN INCIDENCIAS, comentario vacío cuando el texto es solo ubicación.
- Se tildan solo las fotos de la fila y se controla que la lista coincida antes de guardar.
- Tolera "SIN INSIDENCIAS" (error de tipeo del catálogo).

## 0.1.0
- Primera versión: formulario, dirección con autocompletado, fotos antes de guardar.
