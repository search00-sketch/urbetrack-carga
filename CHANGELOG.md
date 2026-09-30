# Cambios

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
