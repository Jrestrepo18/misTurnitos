# Despliegue de Mis turnitos en Vercel

Esta entrega está organizada para que **la raíz del repositorio de GitHub sea la raíz del proyecto Vite**. `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` y la carpeta `src/` están al mismo nivel.

## 1. Comprobar el proyecto localmente

Abre una terminal en esta carpeta (la que contiene `package.json`) y ejecuta:

```bash
npm install
npm run build
```

La compilación correcta debe terminar creando `dist/`.

## 2. Subirlo a GitHub

Crea un repositorio vacío en GitHub, por ejemplo `mis-turnitos-pwa`.

Sube **el contenido de esta carpeta**, no una carpeta contenedora adicional. En la raíz del repositorio deben verse directamente:

```text
package.json
 tsconfig.json
 vite.config.ts
 index.html
 src/
 public/
 vercel.json
```

También puedes usar Git desde esta carpeta:

```bash
git init
git add .
git commit -m "Publicar Mis turnitos 1.3.1"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mis-turnitos-pwa.git
git push -u origin main
```

## 3. Importar en Vercel

1. Entra a https://vercel.com/new e importa el repositorio.
2. En **Root Directory**, deja `./` (la raíz del repositorio).
3. Framework Preset: `Vite`.
4. Install Command: `npm install`.
5. Build Command: `npm run build`.
6. Output Directory: `dist`.
7. Despliega.

El archivo `vercel.json` incluido ya declara Vite, el comando de construcción y la carpeta de salida. Revisa igualmente que Root Directory sea `./`.

## 4. Si vuelve a aparecer TS18003

Ese error indica que TypeScript está leyendo `tsconfig.json` en un directorio que no contiene `src/`. En GitHub verifica que `src/` esté en el mismo nivel que `tsconfig.json`. En Vercel confirma que Root Directory sea `./` (o el subdirectorio exacto donde estén juntos esos archivos).

## 5. Actualizaciones

Cuando cambies el proyecto y subas los cambios a la rama conectada, Vercel iniciará un nuevo despliegue automáticamente.

## Nota sobre datos y privacidad

El proyecto sigue guardando la auxiliar seleccionada y el último cuadro importado en el almacenamiento local del navegador. No incorpora una base de datos. La lectura automática desde Google Sheets depende de que el archivo permita acceso de lectura al navegador; no publiques un documento privado sin autorización. Para información privada se debe implementar acceso autenticado antes de compartir la app.
