# Encargo para Claude Cowork: dejar configurados los agentes de Estudio Viral

Copia todo lo que hay debajo de la línea y pégalo en Claude Cowork, en tu PC con Windows.

---

Hola. Configura en este PC los agentes de mi proyecto **Estudio Viral**. Todo lo necesario ya está en el repositorio; solo tienes que instalar, comprobar y dejar accesos directos. Trabaja en español.

**Proyecto:** `C:\tmp\Estudio Viral IA` (repositorio Git de `andyRS/studio-viral-ia`, rama `main`). Si no está ahí, búscalo; tiene la carpeta `montaje\local` y el archivo `opencode.json`.

**Qué son los agentes:** dos agentes de **OpenCode** con el modelo gratuito **DeepSeek V4.1 Flash** (`opencode/deepseek-v4.1-flash-free`), ya definidos en `.opencode\agents\`:
- **guionista:** escribe guiones y fichas en JSON en `trabajo\guiones\<proyecto>\` y los valida;
- **buscador:** descarga material con licencia libre (Pexels, Pixabay, Wikimedia Commons) en `Descargas\EstudioViral\<proyecto>\`.

Claude (en Claude Code, en la nube) es quien revisa lo que entregan. La guía completa está en `docs\agentes\README.md`: léela primero.

## Pasos

1. Abre PowerShell en la carpeta del proyecto y ejecuta:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\agentes\instalar-agentes.ps1
   ```
   El script:
   - hace `git pull`;
   - comprueba Node e instala OpenCode (`npm install -g opencode-ai`) si falta;
   - comprueba que salen los agentes `guionista` y `buscador` y el modelo gratuito;
   - prueba el validador de guiones y la herramienta de material;
   - crea en el escritorio tres accesos directos: **Agente guionista**, **Agente buscador** y **Bajar material**.
2. **Si alguna línea sale con «!!»**, arréglala y vuelve a ejecutar el script hasta que diga «Todo listo». Casos típicos:
   - falta Node: instala la versión LTS de nodejs.org;
   - `npm` no está en el PATH: cierra y abre PowerShell;
   - no sale el modelo gratuito: abre `opencode` una vez, pulsa la tecla para elegir modelo y elige «DeepSeek V4.1 Flash · Gratis».
3. **Claves opcionales del buscador:** pregúntame si quiero poner las claves gratis de Pexels y Pixabay.
   - Si digo que sí, abre en el navegador https://www.pexels.com/api/ y https://pixabay.com/api/docs/ para que las cree yo.
   - Después ejecuta `powershell -ExecutionPolicy Bypass -File scripts\agentes\claves.ps1`: las escribo yo en la ventana, no en el chat.
   - **No me pidas las claves por el chat ni las escribas tú.**
4. **Prueba real del guionista,** sin escribir archivos:
   ```powershell
   opencode run --agent guionista "Responde en una línea: qué archivo de pautas lees antes de escribir y cuántas palabras como máximo lleva cada clip. No escribas archivos."
   ```
   Debe nombrar `docs/peliculas/pautas-json-para-claude.md` y decir 18 (o 20 como tope).
5. **Prueba real del buscador:**
   ```powershell
   opencode run --agent buscador "Busca (solo buscar, no descargar) 3 fotos de Wikimedia de 'Tigris river'."
   ```
   Debe usar `node scripts/material/descargar.mjs buscar …` y listar licencias de dominio público o CC.
6. Al terminar, dame un resumen corto:
   - qué quedó instalado y qué versión de OpenCode;
   - si las dos pruebas funcionaron;
   - si hay claves de Pexels y Pixabay;
   - cualquier problema que no pudiste resolver.

## Límites (no los cambies)

- **No modifiques** el código de la app, `opencode.json` ni `.opencode\agents\*.md`. Si algo de ahí falla, anótalo en el resumen para que lo arregle Claude Code.
- **No hagas `git push`** ni commits de nada que no sea lo que generen las pruebas (las pruebas no deberían generar archivos).
- **No instales descargadores** de YouTube o TikTok (yt-dlp u otros). El buscador solo usa fuentes con licencia libre.
- **No gastes dinero:** el modelo es el gratuito de OpenCode. Si OpenCode pide una suscripción, para y avísame.
