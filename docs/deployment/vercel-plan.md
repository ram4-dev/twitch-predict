# Plan de despliegue de Plot en Vercel

Estado: propuesta de ejecución. Revisión de código, documentación de Vercel y acceso de cuenta realizada el 26 de octubre de 2026. No se crearon recursos ni se hizo un deploy.

Base funcional: commit `947633c`, con web, extensión y app Expo Android en SOL devnet.

## Resultado buscado

La web, la extensión y Android consumen una API HTTPS estable que funciona con el Mac apagado. El seguimiento de Twitch continúa aunque no haya usuarios conectados. Cuentas, mercados, operaciones y resultados sobreviven a reinicios y despliegues. Se conserva el modo SOL devnet; Mainnet y el prototipo legacy de Doppler no se activan en esta migración; el modo de puntos y las cuentas existentes se contemplan en la persistencia y las pruebas.

Vercel alojará los archivos de la web, la API Express y el worker de seguimiento. PostgreSQL será un servicio gestionado, propuesto Neon mediante Vercel Marketplace. Android seguirá siendo una app instalada y la extensión seguirá ejecutándose en Chrome. Sus binarios podrán distribuirse desde una página de descargas; su ejecución no se traslada al servidor.

## Arquitectura propuesta

- Un origen HTTPS estable para la web y la API compartida. Empezar con el dominio estable del proyecto `*.vercel.app`; un dominio propio puede añadirse después. Los nombres concretos quedan sujetos a disponibilidad.
- Express como Vercel Function, manteniendo React/esbuild. No hace falta una migración a Next.js para desplegar este backend.
- PostgreSQL compartido por API y worker, en una región cercana a ambos y con conexiones agrupadas. No usar archivos JSON ni memoria de una instancia como estado persistente.
- Un Vercel Daemon para el seguimiento continuo de Twitch y la conciliación de operaciones. Empezar con una instancia y proteger igualmente los trabajos con leases e idempotencia en PostgreSQL, porque pueden solaparse despliegues.
- Dos proyectos aislados, staging y producción, con bases y credenciales separadas. Los Daemons beta solo corren en el entorno production del proyecto: staging necesita su propio proyecto, no alcanza con una Preview Deployment.

Se propone inicialmente PostgreSQL también para TTL, límites de solicitudes y coordinación. Redis o una cola adicional se incorporarán solo si una medición lo justifica.

## Por qué hay que adaptar el código

`src/offchain-server.ts` mezcla arranque HTTP, lectura/escritura de datos, permisos locales y un intervalo de sincronización cada cinco segundos. `src/byte.ts`, `src/points.ts` y `src/byte-twitch.ts` persisten JSON y serializan operaciones solo dentro del proceso. Los desafíos de firma, los flujos de vinculación y OAuth viven en Maps de memoria. Esas garantías no se conservan al repartir solicitudes entre instancias.

`src/mobile-gateway.ts` está pensado para consultar un backend en loopback. En Vercel, las rutas móviles usarán los mismos servicios de negocio que la web, sin depender del Mac ni hacer una llamada HTTP interna a localhost. Se mantendrán sus contratos públicos, incluido el health que valida Android.

La extensión tiene dominios locales fijados tanto en JavaScript como en el manifiesto y en `externally_connectable`. Se actualizarán mediante configuración de build, preservando la clave pública y el ID de extensión.

## 1. Probar la viabilidad en la cuenta

La CLI está autenticada y la cuenta consultada tiene plan Hobby. Daemons está documentado como beta pública para todos los planes; todavía no se comprobó un despliegue en esta cuenta. La cuota Hobby documentada es de 5 horas de CPU activa por mes, compartidas entre los proyectos del equipo; al agotarse se detienen los Daemons. Medir consumo con la cantidad inicial de canales y registrar el presupuesto antes del corte.

Realizar una prueba mínima en un proyecto staging separado: función HTTP, conexión PostgreSQL y daemon con heartbeat persistido. Comprobar desde Vercel acceso real de lectura a Twitch, configuración/listado de Byte y RPC devnet. No crear mercados ni enviar apuestas en esa prueba de conectividad. Verificar también límites de tiempo, región y accesibilidad de la API desde Android.

El origen Twitch actual usa GraphQL del sitio. Hay que comprobar que funciona desde la red de Vercel; no se da por demostrado por funcionar en el Mac. Si falla, evaluar por separado una fuente oficial y los permisos que requiere. El OAuth actual prueba identidad y revoca el token: no equivale a tener autorización para suscripciones de predicciones de cualquier streamer.

Criterio de salida: conectividad, daemon, almacenamiento y consumo medidos. Si Daemons no resulta viable, validar un diseño con Workflows/Queues antes de continuar. No sustituir el seguimiento por un cron lento: el sistema actual bloquea apuestas con fuentes sin verificar durante 30 segundos y Cron tiene una cadencia mínima de un minuto en Pro y diaria en Hobby.

## 2. Migrar persistencia y concurrencia a PostgreSQL

Definir repositorios para cuentas/wallets, sesiones, desafíos y vinculaciones, estados OAuth, canales seguidos, predicciones, relación Twitch–Byte, operaciones Byte, decisiones de resolución y, para el modo puntos, apuestas/movimientos/recibos.

Mantener unicidad por wallet, predicción original y requestId. Consumir nonce, estado OAuth y código de vinculación mediante operaciones atómicas con vencimiento. Una firma aceptada en una instancia no puede reutilizarse en otra.

Las apuestas de puntos y su liquidación requieren transacciones y bloqueo de filas: sin sobregiros, cobros repetidos ni pérdidas por actualizaciones concurrentes. La réplica necesita registrar intención y estado antes de llamar a Byte. Si una creación tiene resultado incierto, se concilia; no se repite automáticamente una creación externa porque venció un lease.

El worker y la API leerán el estado vigente de la base. Los Maps locales pueden servir de caché breve, nunca de registro autoritativo. Conservar la regla de frescura de 30 segundos y las comprobaciones de cierre y devnet.

Entregar esquema, migraciones, importador de JSON con validación e informe de conciliación. No importar fixtures ni inicializar cuentas reales con los saldos de las demos.

Criterio de salida: tests contra PostgreSQL real que fuercen solicitudes concurrentes desde procesos separados, reinicios, replays y respuestas inciertas de Byte.

## 3. Separar la API pública del arranque local

Extraer una fábrica de aplicación y un entrypoint Vercel sin efectos de arranque locales. Conservar un lanzador local independiente con Portless. El build cloud debe publicar únicamente assets necesarios y el backend: no incluir datos locales, archivos de entorno, wallets, fixtures, logs ni artifacts Android como parte del runtime.

Montar web y API bajo el mismo origen. Reutilizar `/api/byte/*` y exponer la búsqueda móvil por canal. El contrato de `/api/health` debe seguir sirviendo a la extensión y satisfacer la identificación que espera Android. Agregar readiness de base, worker y configuración sin devolver secretos.

Eliminar en cloud `/api/pair`, el bridge global, su entrega durante la vinculación y cualquier privilegio basado en loopback. Un visitante del mismo origen no es un operador. Mantener sesiones distintas para panel y extensión y permitir administración únicamente a wallets habilitadas.

Definir la política de alta/seguimiento de canales para conservar la réplica automática sin otorgar permisos generales de creación o resolución. La propuesta para el piloto es controlar los canales admitidos y las cuotas desde el operador; los viewers pueden consultar y seguir esos canales.

Configurar origen canónico, CORS donde corresponda, CSP, callbacks OAuth y límites distribuidos. Mantener el proxy RPC con lista de métodos, validación devnet y credenciales exclusivamente en servidor.

Criterio de salida: web y API en staging, login válido entre instancias, bridge local inaccesible y operaciones de administración rechazadas para un viewer.

## 4. Extraer y desplegar el worker

Crear un entrypoint de worker y un Dockerfile separado. El proyecto Vercel conservará la raíz del repositorio, porque los Daemons beta no admiten proyectos cuya Root Directory sea una subcarpeta. El daemon no sirve HTTP: se comunica con PostgreSQL y los servicios externos.

El ciclo debe tomar trabajo con lease por canal/operación, verificar Twitch, crear o conciliar réplicas, registrar cierres y resultados y continuar siguiendo IDs que desaparecieron del listado activo. Respetar SIGTERM y permitir recuperación después de una caída. No mantener una transacción de base abierta mientras espera una API externa.

Medir la latencia por canal con varios canales y fallos de red. Objetivo inicial: comprobaciones en el orden de 5–10 segundos durante actividad normal; conservar bloqueo al superar 30 segundos sin verificación. El objetivo es una condición a demostrar, no una garantía de la plataforma. Registrar heartbeat, última verificación por canal, errores y operaciones inciertas.

Criterio de salida: con web y Chrome cerrados, una predicción se replica y termina correctamente; al reiniciar o desplegar el worker no aparecen mercados ni resoluciones duplicados. Si el worker cae, las apuestas sobre fuentes vencidas quedan bloqueadas.

## 5. Conectar la extensión y Android

Generar una versión de extensión que permita el origen HTTPS de staging/producción, conserve el ID y complete la vinculación sin recibir un secreto global de operador. Probar detección de canal, consulta, firma, rechazo y recuperación como en la versión local.

Compilar el APK normal con `EXPO_PUBLIC_API_URL` apuntando al origen HTTPS y sin `EXPO_PUBLIC_LOCAL_GATEWAY`. Publicar identidad e icono HTTPS de la app. La URL también podrá configurarse desde Conexión. Si se incorporan Android App Links, configurar el vínculo de dominio y certificado de firma correspondiente.

Criterio de salida: un Android fuera de la red del Mac encuentra mercados y apuesta en devnet; el panel y Chrome usan el mismo backend. La aprobación en Phantom Android/Seed Vault Wallet es una validación distinta de la wallet oficial de desarrollo y debe registrarse por separado.

## 6. Ensayar staging y preparar el corte

Ejecutar typecheck, lint, unitarias, integración PostgreSQL, build, E2E web/MV3 y E2E Android con servicios cloud. Usar un proyecto staging aislado y fixtures para escenarios repetibles; verificar además lecturas reales y una apuesta devnet con fondos de prueba disponibles. Un error de airdrop o ausencia de un Seeker físico se documenta como bloqueo externo, sin contarlo como prueba aprobada.

Cubrir reinicio y solapamiento de workers, cierres tempranos, fuente vencida, fallo de Byte/RPC, nonce repetido, doble firma/envío, idempotencia y conciliación. Mantener evidencia de las corridas fallidas y su corrección.

Configurar `DATABASE_URL`, `BYTE_API_KEY`, `BYTE_RPC_URL`, credenciales Twitch si se usa su vinculación, origen canónico, wallets operadoras y entorno. Secretos existentes se suministran mediante vault-env; las credenciales de la base se inyectan mediante su integración gestionada. Nunca se copian valores al chat, al bundle ni al repositorio.

Criterio de salida: recorrido completo desde HTTPS con el Mac fuera del camino, observabilidad accesible y rollback ensayado. Resolver los advisories relevantes de dependencias antes de una publicación pública.

## 7. Migrar datos y pasar a producción

Respaldar los datos actuales y conciliar mercados y operaciones inciertas antes de importar. Pausar todos los escritores y procesos de réplica locales que puedan actuar sobre esos mismos mercados. Importar IDs, notas, asociaciones de canal, cuentas, movimientos y estados, verificando conteos e invariantes. Conservar los recibos de apuestas existentes en sus clientes.

Activar un único propietario del trabajo en cloud, ejecutar smoke tests y actualizar los clientes al origen definitivo. Los flujos de autenticación iniciados con el dominio local se reinician; no se aceptan firmas para otro dominio. El despliegue debe declarar qué sesiones pueden conservarse y cuáles requieren reconexión.

Empezar con pocos canales, supervisar consumo y errores y ampliar después. Para rollback, pausar el worker, recuperar una versión de código compatible con el esquema vigente y verificar propiedad del trabajo antes de reactivar. No encender el worker local y el cloud simultáneamente ni restaurar un snapshot viejo sobre movimientos nuevos. Usar migraciones compatibles durante el despliegue; el rollback de Vercel no revierte la base.

Criterio de cierre: web, API, worker y clientes funcionando sin dependencia operativa del Mac, con datos conciliados y rollback documentado. La publicación en tiendas de Android o Chrome es una entrega separada de este despliegue del backend.

## Decisiones pendientes al ejecutar

Se proponen Neon/PostgreSQL, un origen por entorno, una región compartida y Daemons para conservar el seguimiento actual. Antes de crear recursos hay que concretar nombres de proyectos, cuenta/región de base, canales del piloto y política de cuotas. El presupuesto se determina con la prueba inicial; el plan no supone que Hobby alcance para una operación continua de producción ni cambia la suscripción.

El trabajo debe comenzar por la prueba de viabilidad y el esquema de persistencia. No se debe publicar el servidor local actual como API pública y luego intentar corregir sus permisos en producción.

## Fuentes verificadas

- Express en Vercel: https://vercel.com/docs/frameworks/backend/express
- Daemons, funcionamiento y estado beta: https://vercel.com/docs/daemons
- Restricciones y cuotas de Daemons: https://vercel.com/docs/daemons/limits
- Almacenamiento PostgreSQL integrado: https://vercel.com/docs/marketplace-storage
- Cadencia de Cron: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Alternativa de tareas durables: https://vercel.com/docs/workflows
