# Urbetrack · Carga automática desde WhatsApp (GOVNA)

Userscript para Tampermonkey que carga en "Nueva incidencia" de Urbetrack las incidencias
exportadas de un chat de WhatsApp (ya convertidas a JSON/CSV), con sus fotos.

## Instalación (una sola vez por computadora)
1. Instalar la extensión **Tampermonkey** en Chrome.
2. En `chrome://extensions`, abrir los detalles de Tampermonkey y activar **Permitir scripts de usuario**.
3. Abrir el archivo crudo del script (botón *Raw* de `urbetrack_carga.user.js`). Tampermonkey muestra la
   pantalla de instalación: **Instalar**.
4. Recargar Urbetrack (F5). Tiene que aparecer el panel "Carga automática · v…" arriba a la izquierda.

Las actualizaciones llegan solas: Tampermonkey revisa la dirección de `@updateURL` y compara el `@version`.

## Uso
1. Convertir el chat con el conversor *Operativo Callejero* y descargar el **Excel (.xlsx)**, CSV o JSON. Conversor online: https://search00-sketch.github.io/urbetrack-carga/ (descarga directa, funciona con cualquier cuenta).
2. En el panel: **1 · Cargar JSON/CSV/Excel** (o **Pegar datos…** si copiaste el contenido desde el conversor) y **2 · Carpeta de fotos** (la carpeta descomprimida del chat).
3. Elegir el **Solicitante** (POLIGONO / PATRULLA / OPERATIVO / SEGUN FILA).
4. Probar primero con **Simulación** tildada y **Pausar en cada fila**: completa el formulario sin guardar.
5. Destildar **Simulación** para guardar de verdad. Las filas guardadas se destildan solas.
6. Al terminar, bajar el **Log** y cotejar contra el listado de Urbetrack.

Urbetrack recarga la página completa al guardar; el script conserva filas, fotos y log en el navegador
y continúa solo con las filas que faltan.

## Registro en Google Sheets (opcional)
Para que cada carga y cada error quede anotado solo en una planilla compartida:
1. Crear una planilla de Google → **Extensiones → Apps Script** → pegar `google-sheets/Registro.gs` (las instrucciones están al principio del archivo).
2. Definir la propiedad **CLAVE**, implementar como **Aplicación web** (Ejecutar como: Yo · Acceso: Cualquier persona) y copiar la URL.
3. En el panel de Urbetrack → **📄 Registro en Google Sheets**: pegar URL y clave, poner tu nombre en Operador y tocar **Probar**.

La URL y la clave **no** se suben a este repositorio: quedan solo en el navegador de cada operador.

## Reglas de carga (GOVNA)
- Sin descripción, solo ubicación → Grupo RELEVAMIENTO, Tipo y Detalle SIN INCIDENCIAS.
- Comentario del vecino vacío salvo que el texto aclare algo más que la ubicación.
- Fecha de aviso = hora real del mensaje. Plazo según turno: TM/TT/TN SEMANA; SADOFE desde el viernes 19 h hasta el lunes 7 h
  (la madrugada del viernes sigue siendo TN SEMANA). Los feriados (campo "Feriados" del conversor) cuentan como SADOFE.
- Las fotos se suben antes de guardar y se tildan; el script frena si en la lista hay fotos que no son de la fila.

## Seguridad
- El script corre con la sesión del usuario que lo ejecuta; las incidencias quedan a su nombre.
- Una fila con algún dato que no se pueda completar o verificar no se guarda y queda marcada con error.
- Quien controle este repositorio controla el código que corre dentro de Urbetrack en cada computadora
  con la actualización automática: mantener la edición restringida.

## Publicar una versión nueva
1. Editar `urbetrack_carga.user.js` y **subir `@version`** (si no sube, Tampermonkey no actualiza).
2. Anotar el cambio en `CHANGELOG.md`, `git commit` y `git push` a `main`.

## Reemplazar search00-sketch/urbetrack-carga
Las líneas `@updateURL` y `@downloadURL` del encabezado apuntan a `search00-sketch/urbetrack-carga`; reemplazarlas por los
reales antes del primer push:

    sed -i 's#search00-sketch/urbetrack-carga#mi-usuario/mi-repo#g' urbetrack_carga.user.js
