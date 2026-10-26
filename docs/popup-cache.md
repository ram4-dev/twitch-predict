# Caché del popup · 0.8.1

El popup guarda mercados, configuración, cuenta y último saldo válido en chrome.storage.local. Al reabrirse, renderiza esa información antes de consultar el servidor. La actualización de mercados, configuración, cuenta y saldo conocido se hace en paralelo. Un error transitorio conserva los valores anteriores y muestra que no pudo actualizarse todo.

La cantidad de SOL parpadeaba porque se reemplazaba por «—» antes de cada consulta RPC. Ahora se reemplaza únicamente cuando llega un nuevo valor válido. Las tarjetas existentes permanecen en el DOM durante la actualización; conservan sus campos, el foco y las animaciones. Las escrituras de caché no disparan nuevas consultas, y las notificaciones concurrentes se agrupan con un intervalo mínimo de cuatro segundos; el botón Actualizar fuerza una consulta.

La caché se separa por origen del servidor y hash de sesión, sin duplicar el token. El saldo solo se muestra para la misma wallet. Cambiar sesión u origen oculta inmediatamente los datos de cuenta anteriores. Los mercados de más de 30 segundos y las configuraciones de más de cinco minutos permanecen visibles con las apuestas deshabilitadas hasta revalidarse. El cliente de firma mantiene sus comprobaciones autoritativas de red, wallet y mercado antes de firmar.

## Recibo

- Fuente: /Users/ramiro/.t3/projects/twitch-predict, main 8ac41df.
- Worktrunk: fix/popup-cache, /Users/ramiro/.t3/projects/twitch-predict.fix-popup-cache. Se conserva el checkout; output del checkout principal permanece intacto.
- Archivos: popup.js, módulo de caché y bundle, manifest, build/lint y pruebas unitarias/E2E.
- npm run check: typecheck, lint, 49 pruebas unitarias y build aprobados. Lint y E2E completos posteriores a los últimos ajustes de invalidación de sesión: 34 aprobados, 5 omitidos por modo.
- La E2E MV3 firma una apuesta con el fixture Ed25519, reabre el popup manteniendo bloqueadas las respuestas de health y saldo, comprueba que el mercado y saldo ya están visibles y luego actualiza de 2 a 3 SOL. Un MutationObserver verifica que no aparece «—» ni se desconecta la tarjeta; el campo conserva importe y foco. Después simula servidor sin conexión, caché caducada y otra sesión: conserva datos útiles, bloquea apuestas antiguas y no reutiliza el saldo de la cuenta anterior.
- La recarga de la extensión personal requiere intervención del usuario: el acceso automatizado a la administración de extensiones de Chrome fue rechazado previamente. Las pruebas usan un perfil aislado de Chromium, sin modificar el perfil personal.
