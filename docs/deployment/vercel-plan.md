# Plan de despliegue de Plot: Vercel, Railway y Supabase

Estado: propuesta de ejecución. Revisión de código y documentación de Vercel, Railway y Supabase realizada el 26 de octubre de 2026. Esta versión incorpora la elección de Supabase y la posibilidad de alojar el backend en Railway. No se crearon recursos ni se hizo un deploy.

Base funcional: commit `947633c`, con web, extensión y app Expo Android en SOL devnet.

## Resultado buscado

La web, la extensión y Android consumen una API HTTPS estable que funciona con el Mac apagado. El seguimiento de Twitch continúa aunque no haya usuarios conectados. Cuentas, mercados, operaciones y resultados sobreviven a reinicios y despliegues. El despliegue seguirá en SOL devnet. Mainnet y el prototipo legacy de Doppler no se activan en esta migración; el modo de puntos y las cuentas existentes se contemplan en la persistencia y las pruebas.

Vercel alojará la web. Se recomienda Railway para la API Express y el worker continuo de Twitch, en dos servicios separados. Supabase alojará PostgreSQL gestionado; no se requiere una base local para operar el sistema. Android seguirá siendo una app instalada y la extensión seguirá ejecutándose en Chrome. Sus binarios podrán distribuirse desde una página de descargas; su ejecución no se traslada al servidor.

## Arquitectura propuesta

- Vercel sirve la web React/esbuild y conserva un origen HTTPS estable por entorno. No hace falta migrar la UI a Next.js.
- Railway ejecuta dos servicios del mismo código: API Express y worker. La API atiende HTTP; el worker sigue Twitch y concilia operaciones aunque no haya usuarios conectados. El worker no corre dentro del proceso de cada réplica HTTP.
- Supabase proporciona PostgreSQL compartido por API y worker. Elegir una región cercana a Railway, limitar el pool de cada proceso y usar conexiones TLS. No se usan volúmenes Railway ni archivos JSON para persistencia de negocio.
- Mantener un origen público canónico para los clientes: Vercel puede reenviar `/api/*` a Railway mediante rewrites externos. También hay que reenviar los callbacks OAuth bajo `/auth/*` que use el backend. Las URLs públicas deben seguir funcionando sin acceso al Mac.
- Staging y producción tienen entornos Railway y proyectos Supabase separados. Las previews de la web solo se conectan a staging autorizado; no usan credenciales ni datos de producción.

Supabase sustituye la propuesta anterior de Neon. Se propone usarlo inicialmente como base SQL: se conserva la autenticación por wallet y sus desafíos firmados. No se incorpora Supabase Auth ni acceso directo de los clientes a las tablas como parte de esta migración.

Los límites de solicitudes, TTL y leases se implementarán inicialmente en PostgreSQL. Redis o una cola adicional se añadirán solo si una medición lo justifica. Railway pasa a ser la opción recomendada para API y worker; desplegar solo el worker allí y mantener la API en Vercel queda como alternativa, no como otra implementación simultánea.

## Por qué hay que adaptar el código

`src/offchain-server.ts` mezcla arranque HTTP, lectura/escritura de datos, permisos locales y un intervalo de sincronización cada cinco segundos. `src/byte.ts`, `src/points.ts` y `src/byte-twitch.ts` persisten JSON y serializan operaciones solo dentro del proceso. Los desafíos de firma, los flujos de vinculación y OAuth viven en Maps de memoria. Esas garantías no se conservan al repartir solicitudes entre instancias.

`src/mobile-gateway.ts` está pensado para consultar un backend en loopback. En el backend Railway, las rutas móviles usarán los mismos servicios de negocio que la web, sin depender del Mac ni hacer una llamada HTTP interna a localhost. Se mantendrán sus contratos públicos, incluido el health que valida Android.

La extensión tiene dominios locales fijados tanto en JavaScript como en el manifiesto y en `externally_connectable`. Se actualizarán mediante configuración de build, preservando la clave pública y el ID de extensión.

## 1. Probar conectividad y preparar staging

La cuenta Vercel consultada tiene plan Hobby. Las CLI de Railway y Supabase están instaladas, pero en esta revisión no se validó acceso a sus cuentas ni se crearon proyectos. Concretar cuentas, regiones y presupuesto antes de provisionar recursos; no asumir que los planes gratuitos sostienen una operación continua.

Realizar una prueba mínima en staging: web en Vercel, API y worker en Railway y una tabla de heartbeat en Supabase. Comprobar desde Railway acceso real de lectura a Twitch, configuración/listado de Byte y RPC devnet. No crear mercados ni enviar apuestas en esa prueba. Verificar además API HTTPS desde Android y los rewrites de Vercel, incluidos cookies, redirecciones y callbacks de autenticación.

El origen Twitch actual usa GraphQL del sitio. Hay que comprobar que funciona desde Railway; no se da por demostrado por funcionar en el Mac. Si falla, evaluar por separado una fuente oficial y los permisos que requiere. El OAuth actual prueba identidad y revoca el token: no equivale a tener autorización para suscripciones de predicciones de cualquier streamer.

Configurar el worker como servicio persistente, sin suspensión automática por inactividad. La API debe escuchar en `0.0.0.0` y en el `PORT` que entrega Railway. Su healthcheck de despliegue debe verificar readiness; la supervisión continua del worker se hará mediante heartbeat y alertas, no suponiendo que Railway vuelve a consultar ese healthcheck después del deploy.

Criterio de salida: red, conexiones Supabase, ciclo del worker, HTTPS y consumo demostrados en staging. Esta propuesta deja de depender de la beta de Daemons y su cuota Hobby en Vercel. Se conserva el requisito de bloquear apuestas cuando la fuente supera 30 segundos sin verificar; un cron lento no reemplaza al worker.

## 2. Migrar persistencia y concurrencia a Supabase PostgreSQL

Crear un proyecto Supabase de staging y un esquema de aplicación privado. Definir repositorios SQL para cuentas/wallets, sesiones, desafíos y vinculaciones, estados OAuth, canales seguidos, predicciones, relación Twitch–Byte, operaciones Byte, decisiones de resolución y, para el modo puntos, apuestas/movimientos/recibos.

Mantener unicidad por wallet, predicción original y requestId. Consumir nonce, estado OAuth y código de vinculación mediante operaciones atómicas con vencimiento. Una firma aceptada en una instancia no puede reutilizarse en otra.

Las operaciones críticas se ejecutan en SQL mediante un driver PostgreSQL en el backend. Las apuestas de puntos y su liquidación requieren transacciones y bloqueo de filas: sin sobregiros, cobros repetidos ni pérdidas por actualizaciones concurrentes. La réplica necesita registrar intención y estado antes de llamar a Byte. Si una creación tiene resultado incierto, se concilia; no se repite automáticamente una creación externa porque venció un lease.

El worker y la API leerán el estado vigente de la base. Los Maps locales pueden servir de caché breve, nunca de registro autoritativo. Conservar la regla de frescura de 30 segundos y las comprobaciones de cierre y devnet.

Para los procesos persistentes de Railway, probar conexión directa si la red permite llegar al endpoint de Supabase; si la conectividad es solo IPv4, usar Supavisor en modo session. No adivinar el host: usar el endpoint exacto provisto para el proyecto. Mantener las migraciones en una conexión adecuada para sesiones persistentes. Si en el futuro una Vercel Function accede a SQL, usar su configuración de pooling transaccional y las restricciones de prepared statements correspondientes.

No entregar `DATABASE_URL`, claves secretas o `service_role` a la web, Chrome ni Android. Las tablas internas no deben exponerse mediante las APIs automáticas de Supabase: usar un esquema no expuesto y grants restringidos; deshabilitar la Data API si no se necesita. Si se habilita acceso público a una tabla más adelante, definir y probar RLS para ese caso. La autorización de negocio sigue verificándose en la API.

Entregar esquema, migraciones versionadas, importador de JSON con validación e informe de conciliación. No importar fixtures ni inicializar cuentas reales con los saldos de las demos.

Criterio de salida: tests contra un proyecto Supabase aislado que fuercen solicitudes concurrentes desde procesos separados, reinicios, replays y respuestas inciertas de Byte.

## 3. Separar la API pública del arranque local

Extraer una fábrica de aplicación y un entrypoint HTTP para Railway sin efectos de arranque locales ni bucles de seguimiento. Conservar un lanzador local independiente con Portless. El build cloud debe publicar únicamente assets necesarios y el backend: no incluir datos locales, archivos de entorno, wallets, fixtures, logs ni artifacts Android como parte del runtime.

Conservar el mismo origen público para web y API mediante los rewrites de Vercel hacia Railway. Reutilizar `/api/byte/*` y exponer la búsqueda móvil por canal. El contrato de `/api/health` debe seguir sirviendo a la extensión y satisfacer la identificación que espera Android. Agregar readiness de base, worker y configuración sin devolver secretos.

Eliminar en cloud `/api/pair`, el bridge global, su entrega durante la vinculación y cualquier privilegio basado en loopback. Un visitante del mismo origen no es un operador. Mantener sesiones distintas para panel y extensión y permitir administración únicamente a wallets habilitadas.

Definir la política de alta/seguimiento de canales para conservar la réplica automática sin otorgar permisos generales de creación o resolución. La propuesta para el piloto es controlar los canales admitidos y las cuotas desde el operador; los viewers pueden consultar y seguir esos canales.

Configurar explícitamente origen canónico, CORS, CSP, callbacks OAuth y límites distribuidos. El hostname interno de Railway no debe cambiar el dominio de un desafío firmado ni la URL pública del callback. Validar los headers de proxy y el origen real de las solicitudes; no conceder permisos por IP de loopback ni confiar en headers arbitrarios del cliente. El endpoint directo de Railway conserva los mismos controles de autenticación aunque pueda recibir tráfico sin pasar por Vercel. Mantener el proxy RPC con lista de métodos, validación devnet y credenciales exclusivamente en servidor.

Criterio de salida: web y API en staging, login válido entre instancias, bridge local inaccesible y operaciones de administración rechazadas para un viewer.

## 4. Extraer y desplegar el worker

Crear un entrypoint de worker separado y definir comandos de inicio independientes para los servicios Railway de API y seguimiento. El worker consulta Supabase y los servicios externos; no requiere un endpoint público. Empezar con una instancia, con restart policy y cierre ordenado. Proteger igualmente los trabajos con leases en la base, porque durante despliegues puede haber procesos superpuestos. No activar suspensión automática en el servicio de seguimiento.

El ciclo debe tomar trabajo con lease por canal/operación, verificar Twitch, crear o conciliar réplicas, registrar cierres y resultados y continuar siguiendo IDs que desaparecieron del listado activo. Respetar SIGTERM y permitir recuperación después de una caída. No mantener una transacción de base abierta mientras espera una API externa.

Medir la latencia por canal con varios canales y fallos de red. Objetivo inicial: comprobaciones en el orden de 5–10 segundos durante actividad normal; conservar bloqueo al superar 30 segundos sin verificación. El objetivo es una condición a demostrar, no una garantía de la plataforma. Registrar heartbeat, última verificación por canal, errores y operaciones inciertas.

Criterio de salida: con web y Chrome cerrados, una predicción se replica y termina correctamente; al reiniciar o desplegar el worker no aparecen mercados ni resoluciones duplicados. Si el worker cae, las apuestas sobre fuentes vencidas quedan bloqueadas.

## 5. Conectar la extensión y Android

Generar una versión de extensión que permita el origen HTTPS de staging/producción, conserve el ID y complete la vinculación sin recibir un secreto global de operador. Probar detección de canal, consulta, firma, rechazo y recuperación como en la versión local.

Compilar el APK normal con `EXPO_PUBLIC_API_URL` apuntando al origen HTTPS y sin `EXPO_PUBLIC_LOCAL_GATEWAY`. Publicar identidad e icono HTTPS de la app. La URL también podrá configurarse desde Conexión. Si se incorporan Android App Links, configurar el vínculo de dominio y certificado de firma correspondiente.

Criterio de salida: un Android fuera de la red del Mac encuentra mercados y apuesta en devnet; el panel y Chrome usan el mismo backend. La aprobación en Phantom Android/Seed Vault Wallet es una validación distinta de la wallet oficial de desarrollo y debe registrarse por separado.

## 6. Ensayar staging y preparar el corte

Ejecutar typecheck, lint, unitarias, integración Supabase, build, E2E web/MV3 y E2E Android contra los entornos cloud de staging. Usar un proyecto staging aislado y fixtures para escenarios repetibles; verificar además lecturas reales y una apuesta devnet con fondos de prueba disponibles. Un error de airdrop o ausencia de un Seeker físico se documenta como bloqueo externo, sin contarlo como prueba aprobada.

Cubrir reinicio y solapamiento de workers, cierres tempranos, fuente vencida, fallo de Byte/RPC, nonce repetido, doble firma/envío, idempotencia y conciliación. Mantener evidencia de las corridas fallidas y su corrección.

Configurar `DATABASE_URL` y, cuando corresponda, `MIGRATION_DATABASE_URL`, además de `BYTE_API_KEY`, `BYTE_RPC_URL`, credenciales Twitch si se usa su vinculación, origen canónico, wallets operadoras y entorno. Secretos existentes se suministran mediante vault-env; las credenciales gestionadas nuevas se provisionan mediante un mecanismo seguro y se inyectan en los servicios Railway que las necesitan. Vercel sirve la web y reenvía solicitudes: no necesita credenciales SQL ni la API key de Byte. Nunca se copian valores al chat, al bundle ni al repositorio.

Criterio de salida: recorrido completo desde HTTPS con el Mac fuera del camino, observabilidad accesible y rollback ensayado. Resolver los advisories relevantes de dependencias antes de una publicación pública.

## 7. Migrar datos y pasar a producción

Respaldar los datos actuales y conciliar mercados y operaciones inciertas antes de importar. Pausar todos los escritores y procesos de réplica locales que puedan actuar sobre esos mismos mercados. Importar IDs, notas, asociaciones de canal, cuentas, movimientos y estados, verificando conteos e invariantes. Conservar los recibos de apuestas existentes en sus clientes.

Activar un único propietario del trabajo en cloud, ejecutar smoke tests y actualizar los clientes al origen definitivo. Los flujos de autenticación iniciados con el dominio local se reinician; no se aceptan firmas para otro dominio. El despliegue debe declarar qué sesiones pueden conservarse y cuáles requieren reconexión.

Empezar con pocos canales, supervisar consumo y errores y ampliar después. Para rollback, pausar el worker, recuperar una versión de código compatible con el esquema vigente y verificar propiedad del trabajo antes de reactivar. No encender el worker local y el cloud simultáneamente ni restaurar un snapshot viejo sobre movimientos nuevos. Usar migraciones compatibles durante el despliegue; revertir la web en Vercel o un servicio Railway no revierte los datos ni las migraciones de Supabase.

Criterio de cierre: web, API, worker y clientes funcionando sin dependencia operativa del Mac, con datos conciliados y rollback documentado. La publicación en tiendas de Android o Chrome es una entrega separada de este despliegue del backend.

## Decisiones pendientes al ejecutar

Supabase queda elegido como base gestionada. Se recomienda Vercel para la web y Railway para API y worker. Antes de crear recursos hay que concretar cuentas/proyectos, regiones compatibles, nombres de origen HTTPS, canales del piloto y cuotas de uso. Medir presupuesto conjunto de Railway, Supabase y Vercel; no cambiar suscripciones ni activar recursos pagos como parte de la preparación del plan.

Primero se prueba conectividad y después se migra la persistencia. No se debe publicar el servidor local actual y luego intentar corregir sus permisos en producción. El cambio a Railway evita la adaptación del polling a funciones efímeras, pero no elimina la necesidad de SQL transaccional, autenticación y coordinación entre procesos.

## Fuentes verificadas

- Railway, servicios persistentes: https://docs.railway.com/services
- Railway, despliegue de Express: https://docs.railway.com/guides/express
- Railway, healthchecks: https://docs.railway.com/deployments/healthchecks
- Railway, suspensión de servicios: https://docs.railway.com/deployments/serverless
- Supabase, conexiones PostgreSQL y pooling: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase, permisos y exposición de datos: https://supabase.com/docs/guides/api/securing-your-api
- Vercel, rewrites externos: https://vercel.com/docs/routing/rewrites
