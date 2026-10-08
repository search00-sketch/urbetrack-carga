# Cambios

## Conversor 2026-10-08e
- **Feriados**: campo editable en "3 · Procesar" (dd/mm/aaaa, separados por coma; queda guardado en el navegador). Un feriado cuenta como sábado/domingo: DIURNO SADOFE de 7 a 19 h y NOCTURNO SADOFE el resto; la víspera desde las 19 h y la madrugada siguiente (antes de las 7) también son NOCTURNO SADOFE.
- Viene cargado con lo que queda de 2026: 12/10, 23/11, 08/12 y 25/12.

## 0.11.1 (script) y conversor 2026-10-08d
- Secuestro dentro de un **Punto crónico / Hoja de ruta / Evento / Partido / Reclamo** → ese grupo con tipo SECUESTRO (antes siempre OFICIO). Sin esas palabras sigue yendo a OFICIO.
- En los secuestros la dirección es la línea con calle y número (antes podía tomar "Punto crónico" o el nombre del lugar).
- Las actas se cargan tal cual, con sus ceros: AS0013235 y AS13235 son de camadas distintas.
- Panel: Solicitante **POLIGONO AMBULANTE**.

## 0.11.0 (script) y conversor 2026-10-08c
- **Registro duplicado**: con Urbetrack abierto en dos pestañas, cada fila se mandaba dos veces a la planilla. Ahora manda una sola pestaña por vez, cada fila lleva un `id` y la planilla descarta los repetidos (hay que actualizar el Apps Script: ver `google-sheets/Registro.gs`). El script no corre dentro de iframes.
- **Direcciones**: si el geocodificador no encuentra el texto, el panel prueba sin "Recorrido x", "Intersección", "frente a" y con la última palabra + altura ("Carola Lorenzini 300" → "Lorenzini 300"). Una dirección sin altura da un error claro antes de intentar.
- **Avisos en el log**: "SIN N° DE ACTA" en secuestros e intimaciones sin acta, y "secuestro sin tipo de vendedor". El acta se normaliza ("As 0013235" → "AS0013235").
- Conversor: el número de la dirección ya no se toma como acta ("Secuestro rivadavia 2846" quedaba como dirección "rivadavia" y acta AS2846). Solo se toma un número final como acta si la línea ya tiene altura ("Florida 900 64521").
- Conversor: limpia "Recorrido x", "Intersección", "Dársenas frente a" al principio de la dirección.
- Conversor: un tipo que no existe en el grupo se corrige (PUNTO CRONICO / "SIN INCIDENCIAS" → RELEVAMIENTO; RELEVAMIENTO / "RELEVAMIENTO" → SIN INCIDENCIAS).
- Conversor: cada fila REVISAR dice por qué (sin altura, falta tipo de vendedor, falta N° de acta…) en la tabla y en la nueva columna **observaciones** del Excel/CSV/JSON.

## 0.10.0
- **Registro en Google Sheets**: cada fila guardada, con error u omitida se agrega sola a una planilla (hoja "Registro"), con operador, estado, N° de incidencia, fecha, dirección, grupo/tipo/detalle, turno, código, fotos y mensaje. Las simulaciones no se registran.
- Si no hay conexión, las filas quedan en cola en el navegador y se mandan en el próximo envío o al recargar.
- La URL y la clave se cargan en el panel y quedan solo en el navegador (no en el repo). Script de la planilla: `google-sheets/Registro.gs`.

## 0.9.0
- Panel: la parte de arriba (botones, opciones, estado y filtros) queda fija; solo se desplaza la lista de filas, con los títulos siempre visibles.
- Filtros **Ver: pendientes / con error / cargadas**, con la cantidad de cada uno.
- "Tildar / destildar las que se ven" actúa solo sobre las filas visibles y nunca vuelve a tildar las ya cargadas. Muestra cuántas quedan tildadas para procesar.

## Conversor (2026-10-08)
- Si el primer renglón del mensaje es el nombre de un Grupo de Urbetrack (Reclamo, Derivado, Evento, Desalojo, Same, Agresión, Partido de fútbol, Hoja de ruta, Fuera de operatoria…), se usa ese grupo en cualquier chat (antes Hoja de ruta / Punto crónico solo funcionaban en chats de patrulla).
- "Punto crítico" se reconoce igual que "Punto crónico".

## Conversor (2026-10-06)
- Chats donde el texto va **antes** de las fotos ("Pilar 2000 / Sin incidencias", "SECUESTRO / Av X 123…" y después varias fotos): se detecta solo y cada texto se lleva todas sus fotos. Los chats con la foto primero siguen igual.
- Se ignoran los mensajes vacíos y los "Se eliminó este mensaje".
- N° de acta completo: AS00053254 ya no se corta (antes tomaba solo 6 dígitos).
- Mensajes que empiezan con INTIMACIÓN / DISUASIÓN / COMPROBACIÓN → OFICIO con ese tipo; el acta AI… / AS… va en Código.
- "Panchera" / "tortillas" → detalle COMIDA ARTESANAL.

## Conversor (2026-10-05)
- Nuevo Plazo **PATRULLA 4AM**: si el título del chat dice "4AM" / "4 AM", todas las filas de ese chat van con ese Plazo. También está en los desplegables del Excel.
- El nombre del grupo se lee también del nombre del archivo exportado ("Chat de WhatsApp con PATRULLA - 4AM.txt"): ahí se detectan patrullas y el operativo 4 AM aunque el chat no lo mencione.
- Chats con hora de 24 h ("14:46" sin a. m./p. m.): ya no les suma 12 horas (salía 26:46 y Urbetrack rechazaba la Fecha de aviso).

## Conversor (2026-10-02)
- Chats donde la foto va sola y el texto llega en el mensaje siguiente (típico de Android): se unen si son del mismo remitente y con menos de 5 minutos de diferencia.
- Direcciones con texto alrededor: "Corrientes 872 teatro opera, sin incidencias" → Corrientes 872; "Teatro Gran Rex corrientes 857" → corrientes 857.
- Se toma también la dirección entre paréntesis aunque la línea siga ("Plaza … (Av Corrientes 1041) sin infractores").

## 0.8.1
- El panel muestra la versión real instalada (antes decía siempre v0.6.5).

## 0.8.0
- Script: si Guardar no arranca al primer clic (cartel "Fuera de la zona de servicio"), reintenta solo hasta 2 veces. Es seguro porque en ese caso no se mandó nada.
- Script: si el Detalle tiene una sola opción (SIN INCIDENCIAS, AGRESION, SAME…), la elige aunque el archivo venga vacío.
- Conversor: completa Grupo / Tipo / Detalle contra el catálogo de Urbetrack, sin importar el perfil guardado:
  repite el valor cuando hay una sola opción, corrige nombres que no coinciden (EVENTOS MASIVOS → EVENTO, etc.),
  y en RECLAMO, PUNTO CRONICO, HOJA DE RUTA, EVENTO y PARTIDO DE FUTBOL deduce del texto el tipo (sin incidencias, disuasión, intimación, comprobación, suspendido)
  y el tipo de vendedor. Lo que no se pudo completar queda marcado REVISAR.
- Conversor: turnos. La madrugada del viernes es TN SEMANA (sigue el equipo del jueves) y la madrugada del lunes es NOCTURNO SADOFE (sigue el equipo del domingo).
- Conversor: "sin incidencias" al final de la dirección ya no queda pegado a la dirección.

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
