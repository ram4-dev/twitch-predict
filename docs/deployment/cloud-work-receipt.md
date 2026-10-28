# Ejecución cloud de Plot

Fecha: 26 de octubre de 2026. Piloto público en SOL devnet, sin wallet operadora y sin mainnet.

## Checkout y alcance

Origen: feat/expo-seeker-mobile, commit 149b061, checkout sin cambios pendientes. Worktrunk creó feat/cloud-deploy en /Users/ramiro/.t3/projects/twitch-predict.feat-cloud-deploy. El checkout anterior se conserva. T3 mantiene su vínculo de conversación anterior; los comandos de implementación usaron explícitamente el nuevo directorio.

Supabase no se utiliza. Sus proyectos existentes no se modificaron. La organización vacía Plot, creada durante la preparación, no contiene una base ni servicios desplegados.

## Recursos y acceso

- Web y API canónica: https://plot-devnet.vercel.app
- APK: https://plot-devnet.vercel.app/downloads/plot-android.apk
- Extensión MV3: https://plot-devnet.vercel.app/downloads/plot-extension.zip
- Vercel: proyecto plot-devnet, scope ramirocshubs-projects.
- Railway: proyecto plot, ID 6ba664d5-18dd-48dd-8c55-df51e364a893, workspace Ramiro's Projects. Entorno staging, ID 9c5d02d2-0748-408d-aace-029522fbc0bf. El entorno llamado production sigue vacío; el origen público sirve este piloto devnet.
- API: 726bc6ab-4ae8-4f9b-b7ef-56519ffcc914. Dominio interno de despliegue público https://api-staging-c32d.up.railway.app, con los mismos controles de permisos. Vercel reenvía /api y /auth.
- Worker: 7a442461-bad9-4519-beac-3eff03e05c27. Una réplica, sin suspensión por inactividad, lease renovable y verificación SQL de propietario antes de cada mutación.
- PostgreSQL 18: 174d9bbf-436a-45a1-93fd-01808fab7650. Región us-west2 y volumen postgres-volume. API y worker usan DATABASE_URL por referencia privada al servicio.
- Backups: f1ef46a9-653f-4378-93d8-3b9784da377e. Cron 0 6 * * *, volumen backups-volume, retención de siete días. Sin ampliación de plan. Los snapshots administrados fueron rechazados porque requieren Pro; se usa pg_dump con pg_restore de comprobación en una base temporal.

El origen de firma y callbacks se toma de AUTH_ORIGIN, nunca del hostname interno o headers enviados por un cliente. /api/pair y el bridge global no existen en cloud. Panel y extensión reciben sesiones distintas de la misma cuenta. La clave pública de la extensión se conserva. Las operaciones manuales se rechazan sin una wallet configurada; la web oculta los controles correspondientes.

Los secretos existentes se trasladaron opacamente a vault y a Railway por stdin. Vercel no recibe claves SQL ni Byte. Las variables son unmanaged en .railway/railway.ts: IaC no lee ni escribe valores. Twitch OAuth queda deshabilitado por falta de TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET para este origen; buscar mercados, conectar wallets y apostar no dependen de ese OAuth.

## Migración

Fuente: /Users/ramiro/.t3/projects/twitch-predict.feat-byte-partner-markets/data. Se detuvo su árbol de procesos local (62310 y descendientes), se preservaron points.json, byte.json y byte-twitch.json en artifacts/migration con permisos privados y se importaron atómicamente. El worker cloud estuvo detenido durante la importación. Un primer intento se rechazó por un lease todavía vigente; no hizo una importación parcial. Se esperó su vencimiento y se repitió.

Resultado: 1 cuenta, 16 sesiones, 18 notas/operaciones Byte y 8 canales. Ninguna creación pendiente. Fingerprint: f101f8f5f5ae917eb9d8d575a7bef5da7a8c1ec406cc6a5ed2ce39a57b4590b9. Se verificaron 18 mercados remotos con sus 18 notas. Se admiten los ocho canales previos; los viewers no pueden habilitar canales arbitrarios. La base independiente de puntos/demos del prototipo se conservó local y no se mezcló con los datos Byte.

La persistencia inicial usa agregados JSONB con SELECT FOR UPDATE y transacciones anidadas en una conexión. La unicidad de wallets/requestId se verifica dentro de la fila bloqueada. Es un límite del piloto: medir tamaño y contención antes de ampliar tráfico, y normalizar por entidad cuando sea necesario. El worker y la API leen estado vigente; no sobrescriben snapshots de otro proceso. Una creación Byte incierta queda reservada y exige conciliación.

## Validación

- npm run check: typecheck, lint, 51 pruebas locales aprobadas y build. Las cinco pruebas SQL se ejecutan por separado con una base real.
- npm run test:e2e: 34 aprobadas; seis omitidas, incluyendo la prueba cloud opt-in que se ejecutó por separado y escenarios de otros modos. Se corrigió la preparación de la extensión de prueba para incluir app-config.js, donde ahora vive el origen configurable.
- E2E_MARKET_MODE=byte: réplica MV3 aprobada por separado, desde detección hasta resolución sin tabs Twitch.
- test:cloud contra PostgreSQL Railway real: cinco aprobadas. Tres procesos concurrentes, rollback entre agregados, nonce consumido una sola vez, sesiones persistidas, rate limit compartido, fencing del worker, creación Byte única, bloqueo de bridge/operador local y OAuth durable sin transacciones abiertas durante llamadas externas.
- E2E público: login con firma Ed25519, extensión descargada desde Vercel, sesión de extensión distinta sin bridge y vinculación desde el panel. Los controles manuales no conceden acceso. La extensión cloud lleva versión 0.10.0; cada inicio de su worker migra una URL local al origen público, borra el bridge local y conserva la sesión de wallet.
- Prueba desde un contenedor Railway: base accesible, configuración Byte devnet válida, 18 mercados del partner y Twitch GraphQL accesible.
- Backup y restauración: ejecución a599614f-33fb-407e-b53a-d6744e938aec produjo un dump de 12502 bytes y restauró seis agregados en una base temporal que luego se eliminó. Se conservan las ejecuciones fallidas iniciales: la fuente de imagen oficial impedía usar el Dockerfile de backups; se desconectó esa fuente antes de desplegar el script.
- Android: APK release instalado en el emulador normal plot_mobile_api36 / emulator-5554. Instalación limpia, API HTTPS por defecto, health móvil, búsqueda de eggsterr, estado vacío verificado y preferencia de servidor después de reiniciar. MWA mostró el origen público y devnet en la wallet oficial Fake Wallet; la app recibió la clave pública. No se utilizó un Seeker físico ni Phantom Android en esta corrida.

Durante la prueba no había mercados abiertos elegibles. No se presenta esta corrida como una apuesta real confirmada en cadena. Las firmas, rechazo y recuperación de apuestas quedan cubiertos por fixtures locales; falta repetir una apuesta real cuando Twitch abra una ventana elegible y haya fondos devnet disponibles.

El inspector colaborativo falló dos veces con Preview automation snapshot timed out after 15000ms. La verificación pública se completó mediante el workflow Playwright del repositorio y Android. Los artifacts de esta ejecución se guardan en artifacts/cloud y mobile/artifacts, fuera de Git.

## Operación y rollback

Consultar /api/health: la base debe responder y worker debe figurar active. El bloqueo de apuestas por fuente vencida continúa a los 30 segundos. El worker conserva el seguimiento de IDs que Twitch retira del listado activo.

Para desplegar: npm ci; npm run check; railway config plan; railway config apply --yes; railway up --service api --detach --yes; railway up --service worker --detach --yes; railway up --service backups --detach --yes. Vercel: vercel deploy --prod --yes --scope ramirocshubs-projects. Los comandos usan el proyecto y entorno previamente vinculados. El backend tiene un lockfile de runtime separado en cloud, con las dependencias que realmente usa.

Para compilar Android: npm ci --prefix mobile; EXPO_PUBLIC_API_URL=https://plot-devnet.vercel.app npm --prefix mobile run build:android. El APK publicado se copia a public/downloads/plot-android.apk antes del deploy Vercel; es generado y no se incluye en Git. El build no habilita EXPO_PUBLIC_LOCAL_GATEWAY. No se publicó en tiendas.

Para rollback, detener primero el worker cloud con railway down --service worker --yes. Revertir web/API a una versión compatible con el esquema y conservar PostgreSQL vigente. Antes de recuperar el proceso local hay que conciliar y exportar los cambios posteriores al corte: no encenderlo con el snapshot viejo. Los despliegues no revierten datos. Los backups se restauran primero en una base separada, se verifican y recién después se planifica el reemplazo. No restaurar sobre movimientos nuevos ni ejecutar workers locales y cloud sobre los mismos mercados.

Railway Hobby cobra consumo por encima de los USD 5 incluidos; no se configuró un corte automático que pudiera detener apuestas o resoluciones. El consumo de los primeros minutos no alcanza para pronosticar una factura mensual. Revisar RAM/CPU y tamaño de ambos volúmenes después de un día de actividad.

## Dependencias y configuración declarativa

El contenedor backend instala exclusivamente cloud/package-lock.json (Express, pg, Zod y Solana Kit); npm audit --prefix cloud --omit=dev informó cero advisories. El árbol raíz conserva cuatro avisos moderados heredados de la cadena Node RPC de web3 v1, cuya actualización automática exige un cambio mayor. stream-json no entra en los bundles de navegador inspeccionados; no se aplicó una actualización mayor que pudiera romper MWA o la extensión.

La configuración .railway/railway.ts conserva los servicios y volúmenes existentes y deja los secretos fuera de IaC. El plan previo al apply no añadía ni destruía recursos. Un apply inicial falló al decodificar una respuesta de Railway; el siguiente confirmó tres actualizaciones de servicios. Se verificaron por GraphQL ON_FAILURE para API/worker, NEVER para backups, cron diario y sleepApplication false. La CLI puede volver a mostrar diferencias null en esos campos pese a que el estado efectivo consultado es correcto; no se modificaron las suscripciones ni se reemplazaron volúmenes.

La prueba pública final incluyó cerrar Chrome, cambiar la versión del paquete en el perfil de prueba y volver a abrirlo: conservó la sesión y migró la URL local a HTTPS. Las corridas fallidas previas se conservan; se corrigió la preparación de Phantom para no recargar una autenticación automática en curso y la migración dejó de depender exclusivamente de onInstalled.

## Cierre y limpieza

Se eliminaron las identidades sintéticas de las pruebas con guardas contra apuestas/movimientos y un respaldo privado previo. El agregado de cuentas volvió a 1 cuenta y 16 sesiones originales. No quedaron agregados de namespaces test-*.

Se retiró el proxy TCP público temporal de PostgreSQL. La API, el worker y los backups siguieron funcionando por red privada. Se eliminaron de vault la URL temporal de pruebas y la contraseña generada para el proyecto Supabase que no llegó a crearse; PLOT_BYTE_API_KEY se conserva para operar el proyecto. Para repetir test:cloud hay que provisionar una conexión temporal y su CA de confianza de forma opaca; las credenciales no se documentan ni se pasan como argumentos visibles. La clave SSH temporal de esta ejecución se retiró de Railway y del equipo.

Se conservan el worktree y la rama para revisión y continuación; no se fusionó ni se publicó una PR. Los snapshots privados y las corridas fallidas quedan fuera de Git. El emulador conserva el APK HTTPS y la conexión MWA de prueba.
