# Mis turnitos — PWA personal

Aplicación web instalable para consultar un cuadro mensual de turnos desde el celular. Versión 1.3.1 (paquete preparado para Vercel).

## Incluye

- Calendario mensual con códigos **D** (Descanso), **C** (Corrido), **P** (Posturno) y **N** (Noche).
- El símbolo **/** del cuadro original se interpreta automáticamente como **P** (Posturno).
- En el calendario se muestran solo las iniciales de turno.
- Códigos alfanuméricos que empiezan por D, C, P o N (por ejemplo, `P123A`, `D04` o `N-ZONA2`) muestran esa primera letra como turno en el calendario y conservan el código completo como **zona/código** en el detalle.
- Selección de auxiliar guardada en el dispositivo.
- Al abrir o reanudar la app, muestra el mes actual y deja seleccionado/resaltado el día de hoy.
- Actualización desde un enlace de Google Sheets.
- Importación manual de archivos `.xlsx`, `.xls` o `.csv` como respaldo.
- Copia local del último calendario para consulta sin conexión.
- PWA instalable en Android y iPhone (desde el navegador compatible).
- No requiere Supabase ni una base de datos externa.

## Requisitos

- Node.js 20.19+ o 22.12+ recomendado.
- Acceso a Internet para instalar dependencias y para leer el enlace de Google.

La lectura de Excel utiliza la versión oficial corregida de SheetJS (0.20.3), instalada desde su distribución oficial y no desde el paquete npm antiguo.

## Ejecutar localmente

1. Descomprime el proyecto.
2. Abre una terminal dentro de la carpeta `turnitos-pwa`.
3. Ejecuta:

   ```bash
   npm install
   npm run dev
   ```

4. Abre la dirección local que muestra Vite. Para probarlo desde el celular, el computador y el celular deben estar en la misma red Wi-Fi y debes usar la dirección de red que muestra Vite.

## Instalar en el celular

Después de publicar la app en una dirección HTTPS:

- **Android (Chrome):** abre la dirección y elige “Instalar aplicación” o “Añadir a pantalla de inicio”.
- **iPhone (Safari):** abre la dirección, toca Compartir y selecciona “Añadir a pantalla de inicio”.

## Publicar en Vercel

Este paquete está aplanado: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` y `src/` están directamente en la raíz. En Vercel utiliza Root Directory `./`, Framework `Vite`, Build Command `npm run build` y Output Directory `dist`. También se incluye `vercel.json`. Consulta `VERCEL_DEPLOY.md` para el paso a paso.

## Publicar en Cloudflare Pages

1. Sube esta carpeta a un repositorio de GitHub.
2. En Cloudflare Pages, crea un proyecto conectado al repositorio.
3. Configura:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Publica el sitio. La dirección HTTPS que entrega Cloudflare permite instalar la PWA.

También se puede publicar en otro hosting estático que sirva HTTPS.

## Configurar el documento de Google

El enlace que compartiste ya está configurado como fuente inicial en `src/App.tsx`.

Para lectura directa sin iniciar sesión, el documento debe permitir lectura a quien tenga el enlace:

**Google Sheets → Compartir → Acceso general → Cualquier persona con el enlace → Lector.**

La aplicación intenta leer el documento exportándolo como Excel y luego como CSV. El lector busca una tabla con los nombres de las auxiliares, fechas y códigos D/C/P/N. Como el diseño interno del cuadro original aún no se ha verificado, puede ser necesario ajustar la función `parseScheduleGrid` en `src/lib/schedule.ts` cuando se pruebe con el archivo real.

Si la lectura del enlace falla, la sección de ajustes permite subir el Excel manualmente. La selección de auxiliar y el último calendario se guardan en el almacenamiento local del navegador de ese celular.

### Importante sobre privacidad

- Los turnos se guardan en el almacenamiento local del navegador; no se envían a una base de datos creada por esta app.
- El enlace de Google se consulta desde el navegador. Cualquier persona que tenga permiso de lectura sobre ese documento puede ver su contenido.
- Si el cuadro contiene datos privados, no lo publiques como “cualquier persona con el enlace”. En ese caso se necesitaría implementar autenticación de Google o un pequeño servicio seguro de lectura.
- No borres los datos del sitio ni uses navegación privada si quieres conservar el último calendario y la auxiliar seleccionada.

## Funcionamiento sin conexión

La PWA almacena los archivos de la aplicación y conserva una copia local de los turnos que se hayan importado correctamente. Sin Internet no puede descargar el cuadro nuevo, pero sí mostrar el último que quedó guardado.

## Estructura del proyecto

```text
turnitos-pwa/
├── public/
│   └── icon.svg
├── src/
│   ├── lib/
│   │   └── schedule.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```


### Turnos con códigos de zona

Cuando una celda contiene un código como `P123A`, `C04`, `D-ZONA1` o `N_02`, la primera letra se usa también como turno del calendario (P, C, D o N), mientras el código completo se conserva para el detalle del día. El símbolo `/` continúa representando posturno (P).
