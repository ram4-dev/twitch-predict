# plot · Predicciones

La app Android en Expo está en `mobile`. Recorrido, API móvil, compilación y pruebas: [Plot para Android](docs/mobile/implementation.md).

La integración de mercados con byte está en [BYTE_MARKETS.md](BYTE_MARKETS.md). El `.env` local está preparado para agregar `BYTE_API_KEY`; `npm run dev:byte` abre el modo SOL devnet con Phantom, panel de operador y acceso desde la extensión.

## POC anterior: puntos internos

Extensión Chrome que replica predicciones de Twitch y permite apostar puntos internos. Phantom identifica al usuario mediante una firma; saldo, apuestas, resultado y cobro siguen offchain.

## Recorrido del usuario

1. Instala la extensión. Se abre automáticamente el onboarding.
2. Toca **Conectar Phantom** y aprueba conexión/firma en su wallet.
3. Se vincula la extensión automáticamente y llega al panel. No copia IDs ni credenciales.
4. Panel y extensión usan la misma cuenta, saldo e historial. Volver con la misma dirección recupera esa cuenta desde otro navegador; no entrega otro saldo inicial.

Si Phantom no está instalado, el onboarding ofrece su enlace oficial. La wallet y la aprobación de acceso pertenecen al usuario; el proyecto no guarda claves privadas de Phantom ni importa frases de recuperación.

Las cuentas nuevas reciben 10.000 puntos de prueba. Una wallet nueva puede vincular la cuenta anónima anterior de la extensión y conservar sus apuestas. Si esa wallet ya tiene una cuenta, se usa la cuenta existente; no se mezclan saldos anónimos ni se duplican puntos iniciales.

## Ejecutar en este equipo

Node 22+, npm, Portless y Chromium de Playwright:

```sh
npm ci
npm run build
npx playwright install chromium
```

El servicio local ya está configurado en launchd (`dev.twitchpredict.bridge`). Acceso actual: https://twitch-predict.localhost:1357. Se mantiene http://twitch-predict.localhost:1356 para el puente y los enlaces anteriores; el onboarding redirige a HTTPS.

Para operar manualmente, detené primero el servicio anterior: hay un único proceso escritor de puntos. Prepará un proxy TLS aislado y arrancá el servidor HTTP con su alias TLS:

```sh
PORTLESS_STATE_DIR="$PWD/data/portless-auth" PORTLESS_PORT=1357 PORTLESS_HTTPS=1 portless proxy start -p 1357
AUTH_ORIGIN=https://twitch-predict.localhost:1357 AUTH_PROXY_STATE_DIR="$PWD/data/portless-auth" PORTLESS_PORT=1356 PORTLESS_HTTPS=0 npm run dev
```

El certificado local se gestiona con Portless; los otros proyectos conservan su proxy. El alias HTTPS apunta al puerto que Portless asigna al único backend y se actualiza al arrancar.

```sh
npm run chrome
```

Abre Chrome for Testing con la extensión 0.4.0 y el onboarding. Conserva el perfil `data/chromium`. Si ese perfil ya tiene Phantom, el lanzador permite cargarla sin leer su almacenamiento de wallet. La extensión tiene una clave pública de identidad fija para conservar su ID al cambiar de checkout. Para Chrome habitual, cargá la carpeta `extension` como extensión descomprimida: el onboarding se abre al instalarla, o desde **Conectar Phantom** en su popup.

## Cuentas y autenticación

El servidor crea un desafío por wallet con dominio/puerto, URI, nonce y vencimiento de cinco minutos. Verifica Ed25519 sobre el mensaje original; el cliente no elige el mensaje aceptado. Los desafíos son de un solo uso y no se aceptan firmas vencidas o de otro origen. El flujo de instalación tiene 30 minutos para permitir configurar Phantom; tras firmar hay cinco minutos para entregar la vinculación.

La extensión guarda un estado aleatorio privado. El panel entrega un código ligado a ese flujo y el background lo canjea una sola vez, verificando origen, ID de extensión y estado. Panel y extensión reciben sesiones distintas para la misma cuenta. Los tokens se guardan como hashes en `data/points.json`; las sesiones y el historial sobreviven al reinicio. Los desafíos pendientes son efímeros: después de reiniciar el servidor se vuelve a abrir el acceso desde la extensión.

## Mercados y puntos

El servidor sigue canales y los IDs de las predicciones originales hasta conocer su resultado, aunque se cierre la extensión. Cada predicción se copia una vez con el mismo título/opciones; las entradas de la extensión se verifican contra Twitch. El pozo interno empieza en cero y nunca copia los puntos de Twitch.

Las apuestas aceptan puntos enteros dentro del saldo, cierran al vencer el plazo o al informar LOCKED, y se bloquean si la fuente lleva más de 30 segundos sin verificar. RESOLVED reparte el pozo proporcionalmente entre los ganadores, conservando cada punto y sin comisión. CANCELED o un ganador sin apuestas generan reembolsos. El cobro usa recibos persistentes contra duplicados. Solo los ejemplos permiten resolver manualmente.

`data/points.json` contiene cuentas, sesiones, mercados, apuestas, movimientos y recibos. Las operaciones se serializan y se persisten por reemplazo atómico. Es una POC local de un solo escritor: no incluye dinero real, recuperación social ni protección contra una persona que cree varias wallets.

## UI y validación

Popup nativo de 700px; Button/Input/Badge de shadcn, React 18, Tailwind, Inter local. Taste Skill está instalado en `.agents/skills/taste-skill`; la dirección visual está en DESIGN.md. Taste Labs privado no está conectado.

```sh
npm run check
npm run test:e2e
```

Las E2E arrancan un servidor y un proxy Portless aislados en http://twitch-predict.localhost:1358 con datos temporales. La fuente Twitch y el proveedor de wallet se controlan en la prueba; las firmas Ed25519 y su verificación del servidor son reales. Prueban instalación, onboarding, cancelación, firma inválida, cuenta compartida entre panel/extensión y otro navegador, apuesta, resultado, cobro, reembolso y popup nativo. No sustituyen la aprobación manual con una instalación real de Phantom.

El prototipo Solana anterior se conserva como modo optativo (`MARKET_MODE=solana`); ver SOLANA_LEGACY.md. Sus E2E están excluidas del flujo offchain.

## Publicación en Chrome Web Store

El workflow publica mediante la API v2 al recibir un push a `main` que afecta la extensión o sus dependencias de build. También admite ejecución manual desde Actions. Las ejecuciones se encolan para evitar publicaciones simultáneas. Google revisa cada envío antes de hacerlo público; una revisión pendiente puede impedir otro envío y requerir que se vuelva a ejecutar el workflow.

La versión en `extension/manifest.json` es la versión base y permanece en el repositorio. CI consulta las versiones publicadas y enviadas a revisión, elige la mayor entre ellas y la base, e incrementa su componente patch. Solo modifica `dist/extension/manifest.json` y vuelve a crear el ZIP; no hace commits a `main`. El ZIP se conserva como artifact del workflow. Si una versión usa cuatro componentes, el incremento de patch descarta el cuarto. Si el patch alcanza 65535, hay que subir la versión base manualmente.

Para habilitar la publicación:

1. En [Google Cloud Console](https://console.cloud.google.com/), creá o seleccioná un proyecto y habilitá Chrome Web Store API. Configurá la pantalla de consentimiento OAuth y agregá como usuario de prueba la cuenta que administra la extensión.
2. En Credenciales, creá un cliente OAuth de tipo aplicación web y agregá `https://developers.google.com/oauthplayground` como URI de redirección autorizada. Guardá el client ID y client secret.
3. En [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/), abrí la configuración y seleccioná “Use your own OAuth credentials”. Ingresá ese client ID y secret, autorizá el scope `https://www.googleapis.com/auth/chromewebstore` con la cuenta propietaria de la extensión e intercambiá el código por un refresh token. Consultá la [guía oficial](https://developer.chrome.com/docs/webstore/using-api/) para los pasos actualizados. Las credenciales de aplicaciones externas en modo Testing pueden vencer; configurá el consentimiento para el uso previsto y renová el token cuando sea necesario.
4. Buscá el publisher ID y el ID de la extensión en el [Developer Dashboard](https://chrome.google.com/webstore/devconsole/). En GitHub, abrí Settings → Secrets and variables → Actions y agregá los secretos de repositorio `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID` y `CWS_PUBLISHER_ID`.

El build usa `PLOT_PUBLIC_ORIGIN` cuando está configurado. Sin él, conserva la configuración local predeterminada del proyecto. Para una distribución conectada a un servidor público, configurá ese origen de HTTPS en el workflow antes de publicar.
