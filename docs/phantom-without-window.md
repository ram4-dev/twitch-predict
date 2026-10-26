# Firma de apuestas sin ventana auxiliar · 0.9.0

Apostar ya no crea una ventana de Plot. La extensión prepara la transacción y solicita la firma desde una pestaña existente de Twitch o del panel. Se prioriza una pestaña activa compatible; si no existe, se busca una pestaña abierta de Twitch o del mismo servidor de Plot. Si no hay ninguna, muestra un error sin abrir ventanas ni pestañas automáticamente.

El proveedor de Phantom se usa en el contexto principal de esa página con chrome.scripting.executeScript. Solo se inyectan bytes públicos de la transacción y la dirección esperada; los tokens y las consultas autenticadas permanecen en el worker. Se fija el documentId entre la inyección y la llamada para evitar firmar en otro documento tras una navegación. La página puede devolver datos no confiables: el worker verifica firma, wallet, programa, cuentas, nonce, opción, importe, blockhash y comisiones antes de guardar el recibo y transmitir. El usuario confirma únicamente en Phantom.

La primera conexión a Phantom desde Twitch puede requerir su permiso de conexión a ese origen. La wallet identifica la solicitud con el origen de la pestaña utilizada. Esta modificación corresponde a las apuestas; el acceso inicial a la cuenta de Plot mantiene su flujo de autenticación.

El worker mantiene una solicitud de firma durante un máximo de 150 segundos, con actividad de la API de Chrome cada 20 segundos. Cerrar el popup no interrumpe esa solicitud. Los recibos se guardan antes del envío, y se siguen consultando al reabrir. Un worker reiniciado no vuelve a transmitir ni duplica una operación pendiente. Se eliminan la página extension-wallet, su script y la mensajería externa del antiguo firmante.

Referencias de plataforma: [proveedor de Phantom](https://docs.phantom.com/solana/integrating-phantom), [scripting de Chrome](https://developer.chrome.com/docs/extensions/reference/api/scripting), [ciclo de vida del worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). El manifest incorpora scripting y acceso al host www.twitch.tv; los demás hosts permanecen limitados al servidor local ya configurado.

## Recibo

- Fuente: /Users/ramiro/.t3/projects/twitch-predict, main c60304e.
- Worktrunk: fix/phantom-without-window, /Users/ramiro/.t3/projects/twitch-predict.fix-phantom-without-window. Se conserva el checkout y los archivos de output del checkout principal.
- Cambios: worker de apuestas, ejecución de transacciones compartida y almacenamiento de recibos, adaptador de Phantom en la pestaña, eliminación del firmante auxiliar, build, manifest 0.9.0 y pruebas.
- npm run check: typecheck, lint, 49 pruebas unitarias y build aprobados.
- Playwright completo final: 34 aprobados y 5 omitidos por modo. Una corrida anterior detectó una carrera en el setup de autenticación: el acceso de instalación podía coincidir con otro clic en Conectar y dejar un onboarding abierto. El test prepara una sesión autenticada y cierra sus páginas de acceso antes de probar las apuestas; el recorrido de firma pasó dos repeticiones consecutivas y la suite completa posterior.
- E2E MV3 específica: aprobada. Verifica rechazo sin envío, manipulación del resultado rechazada, cierre del popup antes de devolver la firma, exactamente un envío, ningún aumento de ventanas o pestañas, recibo recuperable, caché y saldo estable.
- La firma del E2E usa un proveedor de prueba con Ed25519 real y RPC/partner de fixture. No confirma visualmente el popup nativo de Phantom ni usa fondos de la wallet personal.
- La extensión personal requiere recarga manual a 0.9.0: la herramienta rechazó previamente el acceso a la administración de extensiones de Chrome. No se intentó eludir ese bloqueo.
