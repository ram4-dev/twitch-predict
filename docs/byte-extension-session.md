# Cuenta de Byte en la extensión

La versión 0.6.0 vincula la cuenta del panel con el popup. Al conectar Phantom se intenta vincular la extensión instalada; el botón Vincular extensión permite repetirlo con una sesión existente. La extensión genera su propio estado aleatorio, el servidor autoriza el traspaso desde la sesión autenticada del mismo origen y el popup recibe una sesión independiente mediante un código de un solo uso. El token del panel no se envía por mensajería de extensión.

El popup verifica su sesión con el servidor, muestra la wallet conectada y consulta el saldo SOL devnet por RPC. Las elecciones siguen abriéndose en el panel para confirmar con Phantom. Las consultas asíncronas del saldo no descartan las raíces React que guardan el importe.

## Recibo

Origen: `/Users/ramiro/.t3/projects/twitch-predict`, main `93a3bba`. Worktree creado con Worktrunk: `/Users/ramiro/.t3/projects/twitch-predict.feat-byte-extension-session`, rama `feat/byte-extension-session`. Se conservan los archivos originales sin seguimiento en output y el worktree.

Cambios: Auth y ruta de autorización de sesión; handshake de la extensión; conexión automática y manual en el panel; wallet y saldo en el popup; manifest 0.6.0; pruebas de autorización y MV3. Se comprobó origen, sesión autenticada, rechazo de cuentas anónimas, estado, expiración y rechazo de reutilización del código.

`npm run check`: typecheck, lint, 40 unitarios y build aprobados. Playwright completo: 34 aprobados, 4 legacy Solana omitidos por modo. Una primera corrida detectó pérdida del importe al refrescar; se corrigió moviendo la reconciliación React después de las consultas asíncronas y la corrida completa posterior pasó. La E2E MV3 verifica misma wallet en panel y extensión, saldo devnet, importe retenido, apertura del mercado y firma de la apuesta con el fixture del proyecto.

Chrome bloqueó que la automatización abriera su página de administración de extensiones. La activación de la versión instalada puede requerir que el usuario recargue Plot desde esa página, o cargue la carpeta extension del checkout principal si la instalación apunta a otro worktree. No se intentó eludir ese bloqueo.
