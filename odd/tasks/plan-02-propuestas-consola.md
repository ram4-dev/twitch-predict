# Plan 2: propuestas de viewers y consola completa del streamer

Estado: borrador revisado, pendiente de aprobación del usuario. Fecha: 2026-11-09.
Se planifica por separado del [Plan 1](/home/meeting/projects/twitch-predict.plot-chat-predictions/odd/tasks/plan-01-saldo-mercados-login.md). No se inicia implementación en este paso.

## 1. Resultado esperado

Un usuario autenticado puede proponer un mercado para un canal desde la app o desde el chat aunque no sea moderador. En el chat se usa el mismo comando `!plot crear Pregunta, Sí, No`: el servidor detecta el rol en ese canal. Si es el dueño o un moderador, publica el mercado; si es un viewer, registra una propuesta que el dueño decide si publicar. Esta entrada por chat y el comando único son requisitos confirmados por el usuario. El streamer también puede crear y administrar sus mercados desde la app, con las mismas reglas que en el chat.

Los moderadores pueden crear mercados. El dueño del canal es la única persona que puede resolverlos o cancelarlos, incluido un mercado creado por un moderador o nacido de una propuesta. El autor de la propuesta y el creador del mercado no adquieren por eso autoridad para liquidarlo.

Las propuestas de este plan corresponden a mercados propios de Plot y puntos internos. No generan predicciones nativas de Twitch ni mercados BYTE automáticamente. Las integraciones existentes se muestran con su fuente y reglas; no se ofrecen controles que simulen modificar Twitch o BYTE sin una operación soportada por ese proveedor.

## 2. Base revisada

Actualmente [consoles.tsx:38](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/ui/consoles.tsx:38) lista mercados y resultados, pero la consola renderizada no tiene un recorrido completo para crear y operarlos. [points.ts:272](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/points.ts:272) ya contiene acciones de administración y vista previa de liquidación que se deben revisar y reutilizar. El chat tiene un camino separado de creación, cierre y resolución en [points.ts:104](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/points.ts:104).

El handler de chat actual comprueba al dueño del canal y no modela la creación por moderadores. No se encontró un flujo de propuestas en los módulos de dominio, auth y UI revisados. Se necesita una entidad persistente de propuesta y una política común de permisos, no solo nuevos botones.

La base de planificación es el worktree `plot-chat-predictions`, derivado de `a14d3fd` y con cambios aún sin publicar. En la implementación se deben preservar esos cambios y revisar qué parte ya esté integrada en la rama de destino.

## 3. Matriz de permisos

La política se aplica en el servidor antes de mutar datos. La UI usa las capacidades devueltas por ese mismo servidor para mostrar acciones. Ocultar un botón no sustituye el control de permisos.

| Acción sobre un canal | Viewer autenticado | Moderador verificado de ese canal | Dueño verificado de ese canal |
| --- | --- | --- | --- |
| Ver mercados públicos | Según decisión de acceso del Plan 1 | Sí | Sí |
| Apostar con puntos | Sí, sujeto a saldo y estado | Sí, misma regla | Sí, sujeto a decisión sobre conflictos de interés |
| Enviar una propuesta | Sí, desde app o con `!plot crear` | Sí desde la app; `!plot crear` publica directamente | Puede crear directamente |
| Retirar su propia propuesta pendiente | Sí | Sí | Sí, si es suya |
| Crear/publicar un mercado directamente | No | Sí | Sí |
| Aceptar o rechazar propuestas ajenas | No | No | Sí |
| Cerrar apuestas | No | Pendiente de decisión; se propone no en la primera entrega | Sí |
| Resolver un mercado | No | No | Sí |
| Cancelar un mercado | No | No | Sí |
| Cambiar bot, permisos o configuración del canal | No | No | Sí |
| Cambiar un resultado final | No | No | No en el flujo normal |

Solo la fila de cierre queda abierta a discusión; resolver y cancelar como acciones exclusivas del dueño son requisitos confirmados. La propiedad del canal se prueba por el Twitch user ID del broadcaster, no por wallet, email, nombre visible ni autor del mercado.

Para operar desde la app como dueño o moderador, la cuenta de Plot debe tener Twitch conectado. Un viewer con Google o Phantom puede proponer desde la app. Para proponer o crear por chat debe tener Twitch vinculado a Plot; el mensaje firmado por Twitch identifica al actor, pero no debe crearle a escondidas una cuenta con saldo inicial.

### Un mismo comando, resultado según el rol

| Actor verificado en el canal | `!plot crear Pregunta, Sí, No` produce | Confirmación del bot |
| --- | --- | --- |
| Dueño del canal | Mercado publicado | ID de mercado y opciones para apostar. |
| Moderador del canal | Mercado publicado, propiedad del broadcaster | ID de mercado y opciones para apostar. |
| Viewer con Twitch vinculado a Plot | Propuesta pendiente | ID de propuesta y aviso de que espera aprobación del streamer. |
| Usuario sin Twitch vinculado a una cuenta de Plot | Petición de iniciar sesión o vincular Twitch | Enlace de acceso; no abre mercado ni crea una propuesta sin autor identificado. |

No habrá un comando separado para proponer. El usuario no declara su rol ni elige una bandera para publicar: el servidor lo determina para el canal del mensaje. Si no se puede verificar el rol por un fallo externo, informa el problema y permite reintentar; no publica ni convierte silenciosamente una creación de moderador en propuesta.

La validación del contenido es la misma para los tres roles. El recibo del evento guarda si produjo un mercado o una propuesta y su ID. Si el usuario cambia de rol después, repetir el mismo evento devuelve el resultado original; no transforma una propuesta ya creada en otro mercado.

### Comprobación del rol de moderador

Usar evidencia del servidor. En el chat, el evento firmado identifica actor y canal; los badges de EventSub pueden aportar evidencia para esa acción. En la app hace falta comprobar el rol fuera del mensaje: propuesta de diseño, consultar Get Moderators con autorización del broadcaster y mantener una caché corta por canal y usuario.

Verificar durante el diseño técnico el alcance OAuth mínimo y el soporte actual del token de aplicación. La referencia consultada admite `moderation:read` autorizado por el broadcaster. No pedir permisos de resolución de predicciones de Twitch para crear un mercado propio de Plot. Si hay que agregar un permiso al onboarding del canal, explicarlo como configuración del streamer, sin pedir a cada viewer que autorice el bot.

La caché de rol no debe ser indefinida. Ante rol vencido, revocado o consulta fallida, no publicar por una credencial vieja. Tampoco elevar a moderador a partir de un booleano enviado por el navegador. Revalidar en la operación de publicación y probar la revocación entre abrir el formulario y confirmar.

## 4. Flujo del viewer: proponer un mercado

1. Entrar a la página del canal o a su detalle desde la app.
2. Pulsar “Proponer mercado”. Si no hay sesión, iniciar acceso preservando el canal y el borrador.
3. Completar pregunta, entre dos y seis opciones y duración propuesta. Mostrar el canal de destino antes de enviar.
4. Enviar y recibir un ID de propuesta, por ejemplo `P4N8`, con estado “Pendiente de revisión”. No se abre un pozo ni se reserva saldo.
5. Consultar el estado desde “Mis propuestas”. Si sigue pendiente, poder retirarla.
6. Si el streamer acepta, mostrar el enlace al mercado creado. Si rechaza, mostrar el estado y, si escribió uno, el motivo.

La propuesta no aparece en el feed de mercados abiertos. No puede recibir apuestas, resultados, reembolsos ni comandos de administración de mercado. El viewer no publica directamente cuando cambia un parámetro de la petición.

### Entrada del viewer por chat

1. Escribir `!plot crear ¿Gana el equipo rojo?, Sí, No` en el chat del canal.
2. El bot verifica el evento, la identidad de Plot vinculada y el rol del actor en ese canal.
3. Para un viewer, registra una propuesta con los mismos límites y estados que en la app. Responde, por ejemplo, “Propuesta P4N8 enviada al streamer; pendiente de aprobación”. No anuncia apuestas abiertas.
4. La propuesta aparece en la misma bandeja del streamer y en “Mis propuestas” del autor, marcada con origen `chat` para auditoría.
5. Solo si el streamer acepta se publica el mercado, comienza el plazo de apuestas y se anuncia su ID de mercado.

Enviar desde el chat es parte de la primera entrega de propuestas. Los caminos de app y chat deben converger en la misma operación de dominio y en el mismo recibo de creación.

### Datos y estados propuestos

| Campo | Uso |
| --- | --- |
| `proposalId` y código corto | Identificación persistente, distinta de la de un mercado. |
| `channelId` | Canal de Twitch al que se propone; no se deduce del usuario logueado. |
| `authorAccountId` | Cuenta interna del proponente, cualquiera sea su proveedor de acceso. |
| Origen y recibo de entrada | App o chat, ID de petición/evento y resultado de su procesamiento para evitar duplicados. |
| Pregunta, opciones y duración | Contenido validado y límites comunes con creación directa. |
| Estado y versión | Pendiente, aceptada, rechazada o retirada; protección frente a acciones concurrentes. |
| Creación, revisión y actor de revisión | Historial de qué pasó y quién lo decidió. |
| `acceptedMarketId` | Mercado resultante de una aceptación; único por propuesta. |
| Motivo de rechazo y revisión publicada | Explicación opcional y evidencia del contenido finalmente aprobado. |

Transiciones: `pending → accepted`, `pending → rejected` y `pending → withdrawn`. Una propuesta terminal no vuelve a pendiente por reintentar una petición. Si se aprueba expiración automática, agregar `expired` con fecha y motivo explícitos; no descartarla silenciosamente.

El autor puede tener varias propuestas según los límites acordados. Validar longitudes, opciones distintas y duración en el servidor. Aplicar límites por cuenta, canal y tiempo para evitar que la bandeja se llene de spam. No confiar solo en IP, porque varios usuarios pueden compartir una conexión.

## 5. Flujo del streamer: revisar y publicar

La consola tendrá una bandeja “Propuestas” con cantidad de pendientes. Cada entrada muestra autor, pregunta, opciones, duración y antigüedad. Puede abrirse sin salir de los mercados en curso.

El dueño puede aceptar o rechazar. Propuesta: permitir editar el contenido antes de aceptar, mostrando qué se cambió y guardando la versión original y la publicada. La aceptación confirma contenido final y canal; no se aplica una edición invisible que parezca atribuida al viewer.

Aceptar y crear el mercado forman una operación atómica. Dos pestañas aceptando la misma propuesta producen un único mercado. Una aceptación concurrente con retirar o rechazar tiene un solo ganador; la segunda acción muestra el estado vigente. Si no se puede publicar, la propuesta permanece pendiente y no queda marcada como aceptada sin mercado.

Al publicarse se asigna el ID de mercado del Plan 1. La duración de apuestas empieza al publicar, no cuando el viewer envió la propuesta. El enlace entre propuesta y mercado se conserva para la consola y para el autor.

### Avisos

Primera entrega recomendada: bandeja persistente, contador y actualización en la app; “Mis propuestas” informa al autor. El dato persistido es la fuente de verdad, y SSE o polling solo avisan que debe refrescarse.

Una publicación aceptada usa el anuncio existente del bot con su ID de mercado. El fallo de envío al chat no revierte la publicación. El reintento del bot no duplica el anuncio ni vuelve a publicar el mercado. El bot confirma una propuesta enviada por chat como respuesta al comando de su autor, con su ID y estado pendiente. No agrega anuncios públicos de promoción por cada propuesta pendiente. No se notifican por email o servicios externos sin definir ese alcance.

## 6. Consola con las mismas operaciones que el chat

| Operación | Desde la app | Desde el chat |
| --- | --- | --- |
| Crear mercado como dueño o moderador | Formulario con pregunta, opciones, duración y canal confirmado | `!plot crear Pregunta, Sí, No`; el rol verificado permite publicar. |
| Ver mercados simultáneos | Listado con ID, fuente, estado, tiempo de cierre y pozo | `!plot mercados` |
| Cerrar apuestas | Acción sobre un ID concreto | `!plot cerrar M7K2` |
| Resolver | Seleccionar resultado, revisar impacto y confirmar | `!plot resolver M7K2, 1` |
| Cancelar | Ver importe a devolver y confirmar | `!plot cancelar M7K2` |
| Proponer como viewer | Formulario en modo propuesta | El mismo `!plot crear Pregunta, Sí, No`; el rol verificado genera una propuesta pendiente. |
| Revisar propuestas | Bandeja con aceptar/rechazar | Propuestos: `!plot propuestas`, `!plot aceptar P4N8`, `!plot rechazar P4N8` |

La entrada de propuestas por chat mediante `!plot crear` está confirmada y es obligatoria. Lo que queda a revisión son los comandos para listar, aceptar o rechazar propuestas; la consola debe permitir al streamer completar esas acciones y todo el manejo del mercado sin depender del chat.

Resolver muestra pregunta, canal, ID y resultado elegido. La revisión de impacto distingue apuesta, cobro total y neto de cada posición relevante, con unidades explícitas. Cancelar informa que devuelve lo debitado mediante la operación automática del Plan 1. Un estado de éxito requiere confirmación del servidor; al perder conexión se consulta el estado antes de repetir una mutación.

Un mercado ya resuelto no puede recibir un ganador diferente desde otra pestaña. Para resultados concurrentes, usar versión esperada y recibo de operación. La misma política se aplica a chat, API y consola. Una acción de moderador que intente cancelar o resolver debe devolver rechazo, aunque haya creado ese mercado.

Los mercados propios de Plot se identifican como tales. Reemplazar textos que hoy llaman “Predicción de Twitch” a cualquier mercado no demo. Los mercados externos conservan origen visible y acciones permitidas por su integración; no ampliar sus permisos como efecto de esta consola.

### Componentes que conviene compartir

- `MarketComposer`: campos y validación para crear o proponer, según capacidades.
- `ChannelMarketPicker`: selección de canal y mercado por ID, nunca por posición en el array.
- `MarketAdminActions`: cierre, resolución y cancelación con capacidades del servidor.
- `SettlementPreview`: revisión del ganador y de importes; reutilizar los cálculos de dominio, sin fórmulas financieras independientes en UI.
- `ProposalCard`, `ProposalList` y detalle: mismos datos para bandeja del streamer y seguimiento del autor, con acciones distintas.
- `ConnectedAccounts` y `LoginActions`: componentes del Plan 1 para entradas de viewer, moderador y dueño.

Validar primero el espacio de extensión de 700 × 600 px y luego 360 px. La revisión de una propuesta o una resolución no debe depender de hover. Mantener foco, lectura por teclado y estados que no se distingan solo por color. Respetar movimiento reducido.

## 7. Dominio, API y persistencia

Crear un servicio de operaciones de mercado y una política `capabilities(account, channel)`. Chat y rutas HTTP construyen un actor verificado y llaman al mismo servicio. El adaptador de chat verifica firma y evento; el adaptador HTTP verifica sesión. Ninguno debe duplicar las reglas de cancelación, saldo, propiedad o transición de estado.

La entrada `!plot crear` llama a una operación común que decide por rol entre publicar mercado o registrar propuesta. El resultado incluye su tipo y su ID para que el bot confirme la acción correcta. La decisión y el recibo se guardan juntos, evitando que dos entregas del mismo evento creen una propuesta y un mercado por separado.

Operaciones propuestas: publicar mercado; cerrar; previsualizar liquidación; resolver; cancelar; registrar/listar/retirar propuesta; aceptar/rechazar propuesta. Usar la misma validación de pregunta, opciones y duración para propuesta aceptada, creación por moderador y creación por el dueño.

Ejemplos de rutas de diseño, todavía no implementadas: `POST /api/channels/:id/proposals`, `GET /api/me/proposals`, `GET /api/streamer/proposals`, `POST /api/proposals/:id/accept`, `.../reject`, `.../withdraw`, y creación/acciones de mercados por ID. Antes de agregar rutas, revisar qué endpoints existentes se pueden extender sin crear dos APIs incompatibles.

Toda respuesta de administración incluye estado y versión actual del recurso. Las listas se filtran por permisos en el servidor. Un viewer ve sus propias propuestas y los mercados públicos; no la bandeja privada de otro canal ni datos personales de otros proponentes.

Guardar auditoría de actor, canal, operación, recurso, resultado e ID de petición. Un usuario puede ser dueño en un canal, moderador en otro y viewer en un tercero; el rol no es un atributo global de la cuenta. Mantener autoría y dueño por separado incluso si el moderador pierde su rol o el proponente elimina un método de acceso.

Las transacciones y restricciones deben funcionar en SQL entre procesos. El almacenamiento local debe reproducir las mismas reglas para E2E. Las llamadas a Twitch para comprobar roles se realizan fuera del bloqueo transaccional, con vigencia acotada y revalidación prevista; no prolongar una transacción mientras se espera una API externa.

## 8. Tareas y dependencias

| ID | Trabajo | Depende de | Evidencia de terminación |
| --- | --- | --- | --- |
| P2-01 | Revisar matriz de permisos restante y registrar el comando único ya confirmado. | Revisión del usuario | `!plot crear` publica para dueño/moderador y propone para viewer; resolver/cancelar siguen siendo exclusivos del dueño. |
| P2-02 | Extraer operaciones de dominio comunes y capacidades por canal. | P1-04/P1-06 | Mismos resultados para chat y HTTP; creator distinto de owner. |
| P2-03 | Integrar comprobación de moderadores, permisos OAuth y revocación. | P2-01/P2-02 | Moderador crea en su canal y no puede resolver/cancelar. |
| P2-04 | Modelo de propuesta, transiciones, límites y persistencia. | Identidad de cuenta del Plan 1 | Una propuesta pendiente no es apostable ni mueve saldo. |
| P2-05 | API de propuestas de viewer y consulta de estado propio. | P2-04 | Sesión requerida, IDs ajenos protegidos y reintentos seguros. |
| P2-06 | Aceptación/rechazo exclusivo del dueño y publicación atómica. | P2-02/P2-05 y mercados simultáneos | Una propuesta aceptada genera exactamente un mercado. |
| P2-07 | Compositor de mercado compartido y entrada “Proponer mercado”. | P2-05 | Viewer puede enviar sin wallet si tiene login social. |
| P2-08 | Bandeja del streamer y “Mis propuestas” del usuario. | P2-06/P2-07 | Estados persisten, se refrescan y vuelven tras recargar. |
| P2-09 | Consola completa: crear, cerrar, previsualizar, resolver y cancelar. | P1-02, P1-05 y P2-02 | E2E del ciclo completo desde la app sin chat. |
| P2-10 | Implementar `!plot crear` con decisión por rol: mercado para dueño/moderador, propuesta para viewer. Mantener creación de moderador desde la app. | P2-03/P2-05/P2-06 | E2E de los tres roles con idéntico comando; ayuda con IDs y comas, sin comando separado para proponer. |
| P2-11 | Avisos, outbox, historial de decisiones y estados de fallo. | P2-08/P2-10 | Fallo del chat no pierde propuestas ni duplica mercados. |
| P2-12 | Verificación conjunta y revisión visual de experiencias. | Anteriores | E2E por rol, concurrencia y layouts de 700 × 600 / 360 px. |

Orden recomendado tras las bases del Plan 1: dominio y permisos; consola del streamer; propuestas con su bandeja y entrada por app y por `!plot crear`; comandos opcionales de revisión y avisos. Así la recepción de propuestas no se habilita antes de que el streamer tenga una interfaz para atenderlas.

## 9. Criterios de aceptación y pruebas

| Escenario | Resultado esperado |
| --- | --- |
| Viewer sin rol de moderador propone desde la app | Aparece una propuesta pendiente en el canal elegido; no se publica un mercado. |
| Dueño, moderador y viewer usan el mismo `!plot crear` | Dueño y moderador publican mercados; el viewer genera una propuesta pendiente en la bandeja del mismo canal. |
| Bot confirma la creación de un viewer | Devuelve ID de propuesta y estado pendiente, sin instrucciones para apostar hasta que el dueño acepte. |
| Se repite el evento de un viewer, incluso tras cambiar a moderador | Se conserva una sola propuesta y su recibo original; no aparece otro mercado. |
| Falla la consulta de rol al ejecutar `!plot crear` | Error recuperable sin publicación ni conversión silenciosa a propuesta. |
| Usuario sin Twitch vinculado ejecuta `!plot crear` | Se pide acceso/vinculación, sin alta silenciosa de cuenta ni recurso sin autor identificado. |
| Viewer con Google, sin wallet ni Twitch | Puede proponer desde la app; no obtiene permisos de streamer/moderador. |
| Viewer intenta publicar mediante endpoint o payload alterado | Rechazo del servidor, sin cambios de saldo o estado. |
| Dueño acepta una propuesta válida | Se publica un mercado con ID propio, se conserva la autoría y se vincula la propuesta. |
| Dueño rechaza | No se abre un mercado; el autor ve el rechazo y su motivo si existe. |
| Dos pestañas aceptan a la vez | Se crea un único mercado y ambas muestran el mismo resultado. |
| Aceptar compite con retirar o rechazar | Una sola transición terminal y ningún mercado huérfano. |
| Moderador crea en su canal | Mercado publicado con él como autor y el broadcaster como dueño. |
| Moderador intenta resolver o cancelar su propia creación | Rechazo tanto en chat como por API; ningún crédito o liquidación. |
| Moderador de A intenta crear o ver propuestas privadas de B | Rechazo; los roles no se trasladan entre canales. |
| Moderador pierde el rol con un formulario abierto | La publicación se rechaza al confirmarla. |
| Dueño gestiona todo desde la app | Crea varios mercados, cierra uno, resuelve otro y cancela un tercero sin usar el chat. |
| App y chat operan simultáneamente sobre un mercado | La versión y los recibos impiden resultados contradictorios y pagos duplicados. |
| Cancelación desde la consola | Reembolso automático exacto a todas las posiciones, según Plan 1. |
| Fallan Twitch, el bot o las notificaciones | Se mantiene el estado persistido; no se publica ni acredita dos veces por reintentar. |
| Recarga, cuenta desconectada o token vencido | Se recupera el estado y, cuando corresponde, se pide login conservando el borrador permitido. |
| Spam, título inválido, duración fuera de rango o opciones repetidas | Rechazo explicado sin ensuciar la bandeja ni abrir mercado. |
| Resolución en extensión y móvil | Ganador, perdedores, apuesta, cobro total y neto se leen con unidades y sin depender del color. |

Ejecutar pruebas unitarias de permisos y transiciones, integración SQL de aceptación concurrente y E2E de los tres roles. Probar la creación por chat con eventos firmados y roles simulados, y registrar por separado una prueba real de rol de Twitch cuando haya cuentas disponibles. Verificar typecheck, lint, build y los E2E existentes de apuestas, login, bot y reembolsos. Los permisos externos o cuentas de prueba faltantes se reportan por nombre, sin pedir secretos por chat.

## 10. Revisión previa y decisiones pendientes

La revisión del diseño cubrió especialmente: tratar una propuesta como mercado antes de aceptarla; permitir que el autor liquide su propia creación por accidente; verificar moderación solo en la UI; duplicar mercados con doble aceptación; comenzar el reloj de apuestas al enviar la propuesta; y habilitar una bandeja sin interfaz para revisarla.

Pendiente de aprobación:

1. Cierre de apuestas por moderadores. Propuesta inicial: solo el dueño, igual que resolución y cancelación. Permitir crear ya está confirmado.
2. Comandos de revisión de propuestas por chat: decidir si incluir listar, aceptar y rechazar además de la consola. La propuesta del viewer por chat ya está confirmada mediante `!plot crear`, con decisión automática según rol; no se posterga ni depende de aprobar un comando adicional.
3. Edición de una propuesta al aceptarla. Propuesta: permitida, guardando ambas versiones y mostrando al autor el mercado publicado.
4. Límites y expiración de propuestas. Propuesta de partida: tres pendientes por persona y canal, cinco envíos por hora; sin expiración automática en la primera entrega. Los valores son parámetros de producto a revisar, no requisitos ya acordados.
5. Participación del dueño y moderadores en mercados que administran. Hoy los puntos lo permiten; no cambiar esa regla silenciosamente. La cancelación y resolución siguen reservadas al dueño incluso si no apostó.

Las decisiones de login obligatorio, repetición de apuestas y cobro de premios están centralizadas en el Plan 1 para que los documentos no diverjan.

## 11. Fuentes técnicas consultadas

- [Get Moderators](https://dev.twitch.tv/docs/api/reference#get-moderators): consulta de moderadores y autorización necesaria.
- [Referencia de EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-reference): identidad y badges del mensaje firmado.
- [Scopes de Twitch](https://dev.twitch.tv/docs/authentication/scopes/): pedir solo permisos necesarios para la operación.

Este paso solo agrega planificación. No envía mensajes, no cambia permisos de Twitch, no modifica mercados y no toca el preview.
