# Plot para Android

## Alcance

App Expo SDK 55 / React Native 0.83 en TypeScript. Buscar un canal de Twitch, ver sus mercados SOL devnet abiertos, elegir opción e importe, firmar con una wallet Android y recuperar recibos al volver a abrir la app. Conserva los colores, fuentes y mascota del Plot actual. La extensión conserva su proveedor Phantom y sus claves de almacenamiento.

La búsqueda acepta un login, @login o enlace canónico de Twitch. Solo muestra mercados que Plot ya conoce y tiene habilitados. No registra canales ni crea mercados desde el teléfono: esas acciones siguen protegidas por los permisos del operador. Las predicciones demasiado cortas o ya cerradas no se convierten en apuestas disponibles.

## Wallets

MWA usa el SDK oficial para Android y web3.js v1. La autorización se guarda en SecureStore. Seeker Connect se configura expresamente en `solana:devnet`, y el botón directo aparece cuando el SDK detecta una wallet certificada. El usuario puede elegir otra wallet compatible. La app no genera ni importa claves privadas.

No se exige un login adicional: las operaciones móviles disponibles son consultas públicas, sincronización y transmisión de una transacción firmada por su titular. No se entrega acceso a la cuenta web ni permisos de operador por conocer una dirección. La integración de firmas de mensajes existe en los SDK, pero este MVP no necesita una segunda firma para iniciar sesión.

El núcleo compartido verifica el hash de génesis, el programa, la cuenta de wallet, el cierre actual del mercado y la transacción firmada. Guarda la firma antes de transmitir, bloquea otra apuesta mientras un recibo está pendiente y distingue confirmación en Solana de sincronización con Byte. AsyncStorage guarda recibos por servidor; no es un indexador de toda la wallet.

## API móvil

El gateway es un proceso separado, con una lista explícita de rutas. Reenvía solo consultas, configuración, RPC de devnet y chain-sync al backend local. Nunca reenvía cabeceras de autorización, cookies ni credenciales de operador. No publica rutas de bridge, creación, conciliación, seguimiento ni resolución. Conserva un límite por cliente y tamaños de solicitud acotados.

Ejecutar desde la raíz con `npm ci` y `npm run dev:mobile-api`. Portless expone `plot-mobile-api.localhost`. `MOBILE_UPSTREAM` permite indicar el origen del backend local; su valor predeterminado es el alias de Byte existente. El gateway escucha en loopback. Para un teléfono físico hace falta un origen HTTPS accesible que publique exclusivamente este gateway, nunca el backend de operador completo. No se modificó el despliegue actual.

En `mobile`, instalar con `npm ci`, ejecutar `npm start` para Metro a través de Portless y `npm run android` para compilar el cliente nativo. Expo Go no sirve porque MWA y Seeker Connect contienen módulos nativos. `EXPO_PUBLIC_API_URL` configura un servidor inicial sin secretos; también se puede guardar desde Conexión.

Los APK normales exigen HTTPS. `EXPO_PUBLIC_LOCAL_GATEWAY=1` habilita, solo para el build local de pruebas, HTTP en loopback, alias .localhost y la dirección del host del emulador 10.0.2.2. No habilita HTTP a servidores arbitrarios.

Para compilar el APK: configurar ANDROID_HOME y JAVA_HOME (JDK 17), y ejecutar `npm run build:android` dentro de `mobile`. El APK generado usa la firma de desarrollo de Android, para instalación interna. Una publicación necesita identidad HTTPS propia, firma de distribución y el proceso de la tienda.

## Recibo del workspace

Origen: `/Users/ramiro/.t3/projects/twitch-predict`, rama `branding/plot-mascot`, commit `ceee878041560d58b9d0b39b0e7fa50a6dba1f15`, sin cambios pendientes al comenzar.

Worktree creado mediante el handoff de T3: `/Users/ramiro/.t3/worktrees/twitch-predict/feat-expo-seeker-mobile`, rama `feat/expo-seeker-mobile`. Se conserva para revisión, sin merge a la rama original.

Identidad visual: se conserva la marca actual, incluidos fondo #fff4dd, tinta #232039, naranja #ff7049, Inter y Fraunces. Las opciones opuestas y la distribución del pozo son el elemento principal. Márgenes de 20 dp y acciones de 44–48 dp como mínimo. No se inventa actividad: los datos de las capturas de pruebas pertenecen a un fixture identificado como tal.

## Fuentes verificadas

- https://docs.solanamobile.com/solana-mobile-stack/mobile-wallet-adapter
- https://docs.solanamobile.com/solana-mobile-stack/seeker-connect-quickstart
- https://docs.solanamobile.com/get-started/react-native/invoke-mwa-sessions-directly
- https://docs.expo.dev/versions/v55.0.0/

## Validación del 26 de octubre de 2026

`npm run check` aprobó typecheck, lint, 51 tests unitarios/integración y build. `npm run test:e2e` aprobó 34 casos web/MV3 y omitió 5 por sus condiciones de modo. La réplica automática de Byte se ejecutó además por separado con `E2E_MARKET_MODE=byte`: 1 caso aprobado, incluida resolución sin pestañas de Twitch. La extracción del núcleo de apuestas conserva el recorrido existente de Chrome, incluida firma, rechazo, persistencia y prevención de duplicados.

`npm --prefix mobile run check` aprobó TypeScript y lint sin warnings; Expo Doctor aprobó 20/20 comprobaciones. La exportación Android y el APK release arm64 compilaron con los módulos nativos de MWA y Seeker Connect. JDK 17 resolvió la detección de toolchains de Gradle; se instaló el NDK requerido automáticamente. El APK normal rechazó HTTP desde la propia UI; la variante local usa el permiso explícito de build para el host del emulador.

Se abrió un emulador propio `plot_mobile_api36`, Android API 36 arm64, identificado como `emulator-5554` durante esta ejecución. No se modificaron los emuladores que ya estaban abiertos. T3 devolvió `Agent device access is turned off for this environment`, por lo que el control se realizó con ADB y uiautomator2.

La prueba Android usa el APK real y la Fake Wallet oficial de Solana Mobile, descargada de los releases de Mobile Wallet Adapter. La conexión y la firma cruzan aplicaciones mediante MWA; no se inyecta un proveedor falso dentro de Plot. El backend y el gateway son los reales del proyecto, con los transportes de Byte y Solana controlados por el preload de pruebas existente. El RPC de prueba verifica Ed25519, programa, discriminator, cuentas PDA y montos. Esto no demuestra ejecución del contrato ni envío a Solana real.

Se verificaron rechazo sin transmisión, firma y emisión, persistencia al matar el proceso, bloqueo de duplicados, conciliación al reabrir y persistencia de la confirmación. Los recibos de esa corrida están en `android-e2e.json`. Se verificaron búsqueda por enlace, rechazo de dominios que imitan Twitch, estado vacío y retiro de mercados cerrados. Se revisaron capturas en pantalla compacta con fuente al 130% y en horizontal; el listado desplaza verticalmente. El resumen está en `android-states.json`; las imágenes de ejemplo usan mercados de prueba, sin fondos reales.

La primera corrida detectó que Hermes no implementa `AbortSignal.timeout`; el polyfill se carga antes de Expo Router y del núcleo compartido. Otra corrección evita borrar el mensaje de cancelación al volver de la wallet. Una corrida del driver falló al tocar una pestaña antes de que terminara la transición de arranque; la confirmación ya estaba persistida y sincronizada. El driver ahora espera esa transición y la corrida completa pasó. Los logs de las corridas iniciales permanecen en los artifacts locales.

Para repetir Android: arrancar `npm --prefix mobile run dev:fixture`, instalar la Fake Wallet oficial en un emulador propio y configurar una cuenta de desarrollo desde su propia UI (no imprimir ni guardar la frase de recuperación). Ejecutar `npm --prefix mobile run build:local`: descubre el puerto del fixture en Portless y compila el APK local con la dirección del host del emulador. Instalar ese APK. Conectar la wallet una vez en Plot. Crear un venv, instalar `mobile/scripts/requirements-android.txt` y ejecutar `mobile/scripts/android-e2e.py`, luego `mobile/scripts/android-states.py`. `ANDROID_SERIAL` permite indicar otro emulador; `ADB` permite indicar otra instalación del SDK. Nunca ejecutar los drivers de firmas con una wallet personal.

Los APK y logs locales quedan en `mobile/artifacts`, ignorado por Git. El APK HTTPS es el build normal; el APK local es para este entorno. Ambos usan firma Android de desarrollo, no una firma de distribución. Los assets nativos se regeneran con Expo Prebuild y no se versionan. El script invalida el bundle generado al cambiar variables públicas de build para que una compilación HTTPS no conserve accidentalmente el flag del build local.

Límites pendientes: no hay Seeker físico conectado ni se probó Seed Vault Wallet; tampoco se aprobó una transacción en Phantom Android. No se envió una apuesta a Solana real. El gateway no se publicó en internet y no se reemplazaron los servicios existentes. Para usar un teléfono físico se necesita una API HTTPS accesible que exponga solo el gateway, además de una identidad HTTPS propia para la wallet. La búsqueda no concede seguimiento de canales ni permisos de operador.

`npm audit --omit=dev` informa dependencias transitivas con advisories en el árbol de Expo/web3, incluidos cinco avisos altos contabilizados por npm. No se aplicó el downgrade incompatible que propone npm audit. El bundle usa Zod v4 del núcleo compartido; node-forge no figura entre sus fuentes, pero queda pendiente revisar el árbol de tooling y las dependencias transitivas antes de publicar en una tienda. Esta validación es funcional y no declara una auditoría de seguridad completa.

El fixture Android quedó separado en `mobile/artifacts/fixture`. Una corrida adicional de Playwright eliminó su ubicación inicial bajo `test-results`; se corrigió el aislamiento, se reinició únicamente el entorno de prueba y se vaciaron los datos de la instalación propia de Plot en el emulador. La wallet de desarrollo conservó su cuenta. Las evidencias anteriores se preservaron. Se repitieron el recorrido móvil y la réplica web con la nueva ubicación, comprobando que Playwright no elimina el fixture. El driver espera a que los controles estén habilitados después de la recuperación y de las transiciones.

También se consultó el backend real desde Android a través del gateway, sin crear mercados ni solicitar firmas. Se verificó que al cambiar de servidor no aparecen los recibos del fixture y que al volver se recuperan. La API key permaneció exclusivamente en el backend existente.

`npm start` abre Metro mediante Portless. `npm run android` usa el puerto de ese alias, sin iniciar otro bundler. Los scripts de build detectan el SDK y el JDK 17 existentes en este Mac cuando sus variables no están configuradas. Los APK quedan copiados automáticamente en `mobile/artifacts`; sus hashes están en `apk-receipt.json`.
