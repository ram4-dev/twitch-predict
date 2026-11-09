# Plan 1: reembolsos, mercados simultáneos y acceso a Plot

Estado: borrador revisado, pendiente de aprobación del usuario. Fecha: 2026-11-09.
Este archivo define el trabajo. No autoriza su implementación ni modifica el servicio en ejecución.

## 1. Resultado esperado

Una cancelación devuelve los puntos al saldo sin exigir que cada participante los reclame. Un canal puede tener varios mercados abiertos. Cada operación identifica el mercado correspondiente. Para usar una cuenta de Plot hay que autenticarse con Twitch, Google o Phantom; Twitch aparece como acceso principal y puede vincularse desde el perfil.

La cuenta interna de Plot conserva su ID, saldo, historial y posiciones al agregar otro proveedor. Las operaciones de puntos internos siguen separadas de las apuestas BYTE en devnet. Este plan no introduce depósitos, retiros, custodia ni transferencias de SOL.

El [Plan 2](/home/meeting/projects/twitch-predict.plot-chat-predictions/odd/tasks/plan-02-propuestas-consola.md) usa estas bases para propuestas de viewers, creación por moderadores y gestión desde la consola del streamer.

## 2. Lo que existe y lo que falta

| Hallazgo comprobado | Consecuencia | Cambio previsto |
| --- | --- | --- |
| [points.ts:165](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/points.ts:165) calcula `payout=amount` para mercados anulados; [points.ts:190](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/points.ts:190) acredita al ejecutar `claim`. | Cancelar deja puntos por cobrar, pero el saldo no sube en ese momento. | Acreditación automática al cancelar, con registro contable y protección contra duplicados. |
| [points.ts:111](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/points.ts:111) busca un único mercado pendiente y rechaza el siguiente. | No se pueden mantener dos mercados propios de Plot simultáneos. | Identificar y operar cada mercado por su ID. |
| [twitch-bot.ts:142](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/cloud/twitch-bot.ts:142) selecciona un mercado para `!yes`, `!no` y opciones numéricas. | Quitar solo el bloqueo de creación haría ambiguas las apuestas. | Selector explícito cuando hay más de un destino posible. |
| [onboarding.tsx:49](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/ui/onboarding.tsx:49) ofrece Phantom como acceso. [twitch-auth.ts:18](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/twitch-auth.ts:18) exige una cuenta ya iniciada para vincular Twitch. | Twitch no sirve todavía como primera entrada. | Separar iniciar sesión de vincular un proveedor a una sesión existente. |
| [mobile-app.tsx:66](/home/meeting/projects/twitch-predict.plot-chat-predictions/src/ui/mobile-app.tsx:66) muestra identidad y acceso a Phantom, pero no un botón visible para vincular Twitch. | Un viewer no descubre cómo habilitar apuestas desde el chat. | Acceso y sección de cuentas conectadas compartidos entre superficies. |
| Las operaciones de puntos y varios controles de streamer aún dependen de `wallet`. | Un login social por sí solo no completa el flujo solicitado. | Autorizar acciones por cuenta interna e identidad de Twitch, reservando la wallet para operaciones que la necesitan. |

Al implementar se debe comprobar el estado de los cambios aún sin publicar. La base revisada es el worktree `plot-chat-predictions`, derivado de `a14d3fd`, con los cambios de UI y bot heredados. No se debe suponer que `main` ya contiene este comportamiento.

## 3. Requisitos confirmados y propuestas de diseño

Son requisitos del usuario: devolución al cancelar, varios mercados simultáneos y una identidad autenticada mediante Twitch, Google o Phantom. También está confirmado que solo el dueño del canal puede resolver o cancelar; los moderadores pueden crear. El Plan 2 desarrolla esos permisos.

Son propuestas para revisar: conservar lectura pública sin sesión; exigir ID en chat cuando haya ambigüedad; acreditar automáticamente reembolsos, manteniendo por ahora el cobro de premios ganadores actual; y permitir apuestas repetidas intencionales con eventos distintos. Ninguna de estas propuestas se considera aprobada por estar escrita aquí.

## 4. Reembolsos automáticos

### Regla de saldo

Si una persona empieza con 10.000 pts y apuesta 100 pts, su saldo pasa a 9.900 pts. Al cancelar el mercado, vuelve a 10.000 pts. Su recibo muestra apuesta de 100 pts, devolución de 100 pts y neto de 0 pts. Si apostó varias veces, se devuelve la suma efectivamente debitada que todavía no fue acreditada.

Cancelar el mercado devuelve todas sus posiciones. No se agrega en este alcance una operación para retirar individualmente una apuesta ya aceptada. Si ese era el sentido de “cancelar una apuesta”, se necesita una regla de retiro aparte.

### Implementación prevista

1. Crear una operación de dominio única para cancelar y devolver puntos, usada por chat, API y consola. El cierre del mercado, la acreditación del saldo, el asiento contable y la marca de cada posición deben confirmarse juntos.
2. Registrar un movimiento explícito de reembolso. Conservar el importe original de la apuesta y marcar cuánto se acreditó, cuándo y por qué operación. No usar únicamente un texto de UI como evidencia de devolución.
3. Usar una clave de idempotencia por posición y devolución. Un reintento del chat, una doble pulsación en la app o una carrera con `claim` no pueden pagar dos veces.
4. Adaptar `claim` y el reparto del streamer para excluir importes ya devueltos. La cancelación debe devolver incluso si el usuario cerró sesión o no está conectado.
5. Separar el resultado del mercado del estado de acreditación. Un ganador sin apuestas tiene un resultado válido y una devolución por pozo sin ganadores; no debe confundirse en la UI con una cancelación solicitada.
6. Unificar las rutas de cancelación propias de Plot. Auditar también las anulaciones de mercados internos replicados desde Twitch que llegan a `Points`; aplicar la misma garantía de acreditación donde corresponda.
7. En almacenamiento local, confirmar una sola escritura del agregado. En SQL, confirmar una transacción y restricciones o recibos que protejan también entre procesos. No realizar llamadas a Twitch dentro de esa transacción.
8. Si falla la persistencia, no informar cancelación completada ni actualizar solo la mitad del saldo. Reintentar la misma operación tras recuperar el servicio.

Los premios de mercados resueltos continúan con la política de cobro actual salvo que se apruebe expresamente la acreditación automática de todos los premios. Esa decisión no debe bloquear los reembolsos automáticos de cancelaciones.

### Reparación de cancelaciones anteriores

Preparar primero una auditoría de solo lectura: mercado, cuenta, apuesta debitada, importe de devolución previsto y créditos ya registrados. Calcular la diferencia pendiente usando posiciones, `claimed`, `creditedAt`, `creditMethod` y el historial contable; no volver a pagar únicamente porque un mercado tenga estado `void`.

La reparación debe tener modo de simulación, reporte revisable, copia de respaldo y un ID de operación estable. Al ejecutarla dos veces, la segunda no acredita nada. Si hay datos contradictorios, separar esos casos para revisión en vez de adivinar. Validar las sumas antes y después. La migración de datos históricos se revisa antes de ejecutarse sobre datos persistentes compartidos.

## 5. Mercados simultáneos y comandos sin ambigüedad

### Identificación

Cada mercado tendrá un ID interno estable y un código corto visible, por ejemplo `M7K2`. El código pertenece a un canal y no se reutiliza para otro mercado de ese canal. Debe sobrevivir reinicios y ser único por restricción persistente; no basta un contador en memoria.

En el modelo, distinguir dueño del canal, autor de la creación y fuente del mercado. Un mercado creado por un moderador sigue perteneciendo al canal del streamer. La búsqueda actual por `creatorTwitchId` no puede seguir siendo el criterio para encontrar todos los mercados del canal.

### Sintaxis propuesta

| Operación | Ejemplo |
| --- | --- |
| Crear | `!plot crear ¿Gano la partida?, Sí, No` |
| Listar abiertos y cerrados pendientes de resultado | `!plot mercados` |
| Apostar en un mercado específico | `!plot apostar M7K2, 1` |
| Cerrar apuestas | `!plot cerrar M7K2` |
| Resolver | `!plot resolver M7K2, 1` |
| Cancelar | `!plot cancelar M7K2` |

El Plan 2 define el comportamiento confirmado de `!plot crear` por rol: dueño y moderador publican; un viewer envía una propuesta pendiente. No se agrega un comando distinto para proponer. Cuando se publica un mercado, el bot devuelve su código y lo muestra en anuncios y enlaces. Los separadores visibles siguen siendo comas. El parser debe definir cómo tratar una coma que forme parte del título u opción; propuesta: admitir texto entre comillas, con ejemplos en la ayuda y validación de comillas incompletas.

Los atajos `!yes`, `!no`, `!1` a `!6` continúan solo si hay exactamente un mercado al que puedan dirigirse. Con dos o más candidatos, el bot lista los códigos y pide seleccionar uno, sin debitar puntos. Tampoco se debe elegir “el último creado”, “el primero abierto” ni otro mercado porque el seleccionado se haya cerrado.

La misma regla rige para comandos administrativos sin ID: se admiten solo cuando hay un único mercado válido. Con varios mercados, el bot pide el ID. La consola siempre envía el ID completo y la versión del mercado que mostró al usuario.

### Operaciones concurrentes

Eliminar el límite de un mercado pendiente después de implementar IDs, selectores y validaciones. Un mercado cerrado en espera de resultado no impide abrir otro. Cerrar, resolver o cancelar uno no altera ningún otro mercado.

El saldo es común a todas las posiciones de una cuenta. Dos apuestas concurrentes en mercados distintos deben validar y debitar el saldo de forma serializada o transaccional. La suma nunca puede volverse negativa. Al cancelar uno, solo se acreditan sus posiciones.

Revisar el recibo actual del chat, que agrupa por usuario, predicción y opción. Propuesta: usar el ID verificado del evento de Twitch como identidad de cada apuesta, de forma que un mismo evento no duplique el débito y un nuevo mensaje intencional sí pueda agregar otra apuesta de 100 pts. La huella incluye cuenta, canal, mercado, opción e importe. Este cambio de comportamiento requiere aprobación antes de implementarse.

Las predicciones propias de Plot y las replicadas de Twitch mantienen origen y liquidación diferenciados. La convivencia con BYTE no debe convertir una orden de puntos en una transacción de wallet ni modificar las reglas de los mercados externos.

## 6. Login e identidades conectadas

### Experiencia de acceso

La pantalla de entrada mostrará “Continuar con Twitch” como primera opción, seguida de Google y Phantom. Cada método disponible debe funcionar como primer acceso, no exigir una cuenta iniciada por otro método. Un proveedor sin configurar no puede presentarse como un botón funcional.

La app personal requiere una sesión; apostar, proponer y administrar mercados siempre requieren autenticación. Queda pendiente confirmar si las páginas públicas `/s`, `/join`, el overlay y la búsqueda también deben exigir login. Recomendación: conservar su lectura pública y mostrar el acceso al intentar participar, preservando canal, mercado, opción e importe.

En el perfil habrá una sección “Cuentas conectadas”: Twitch, Google y wallet, con estado visible y acción de conectar. Si no hay Twitch vinculado, mostrar “Conectá Twitch para apostar desde el chat”. Una cuenta iniciada con Google o Phantom puede usar puntos desde la app y vincular Twitch después; para gestionar un canal o actuar como moderador debe demostrar su identidad de Twitch.

No se debe activar seguimiento, agregar el bot ni crear mercados por el solo hecho de iniciar sesión con Twitch. Entrar como viewer y activar las herramientas de streamer son acciones distintas.

### Modelo y autorizaciones

- Mantener `accountId` como referencia interna de balances, apuestas y recibos. Agregar identidades externas con unicidad por proveedor y sujeto verificado: Twitch user ID, Google `sub` y dirección de wallet validada por firma.
- Mostrar nombre y avatar de Twitch cuando esté conectado; si no, Google o una representación de wallet. Un nombre visible o un correo no otorgan identidad ni propiedad de canal.
- Separar `login`, `link` y `unlink`. Una sesión existente que conecta otro proveedor conserva el mismo `accountId`. Iniciar sesión con un proveedor que ya existe recupera la cuenta correspondiente.
- Si Twitch y Phantom pertenecen a cuentas diferentes, no fusionarlas automáticamente ni emitir un segundo bono inicial. Diseñar una recuperación o fusión separada que exija prueba de control de ambas cuentas y conserve contabilidad e historial.
- Impedir que se quite el último método de acceso. Al quitar Twitch, revocar capacidades de chat y gestión asociadas sin perder posiciones ni saldo.
- Rotar o revocar sesiones según el evento de seguridad; soportar cierre de sesión y expiración. El transporte web, móvil y extensión debe reconocer la misma cuenta.
- El login social debe permitir apostar, consultar historial y cobrar puntos internos sin wallet. La wallet sigue siendo necesaria para firmar operaciones BYTE que lo requieran.

### Proveedores y seguridad del flujo

Reutilizar la prueba de identidad de Twitch, pero crear un flujo de login que no llame a `points.me` antes de autenticar. Distinguirlo del vínculo de una cuenta ya iniciada. Mantener estado OAuth de un solo uso, cookie de correlación, destino de retorno validado y consumo transaccional del callback.

Para Google, usar OpenID Connect y una biblioteca mantenida. Validar firma, emisor, audiencia, expiración y nonce del ID token. Usar `sub` como identificador estable; nunca unir cuentas solo por correo coincidente. Registrar callbacks exactos por entorno y guardar secretos mediante `vault-env`. No hace falta pedir acceso a Gmail, Drive ni Calendar.

Conservar el acceso Phantom y la prueba de posesión por firma. No poner tokens de sesión en URLs de Phantom, QR, enlaces compartidos ni logs. La extensión debe conservar su handoff de un solo uso; revisar que no exija wallet cuando la identidad primaria sea social. No compartir cookies copiándolas entre navegadores.

Las restricciones de cuenta única y el bono inicial deben cumplirse también con dos callbacks concurrentes. Agregar Google depende de una aplicación OAuth y credenciales configuradas; se verifican nombres y configuración disponible durante la implementación, sin pedir al usuario que haga pasos rutinarios que el agente pueda resolver.

## 7. Tareas y orden de implementación propuesto

| ID | Trabajo | Depende de | Evidencia de terminación |
| --- | --- | --- | --- |
| P1-01 | Reproducir cancelación, registrar invariantes y preparar fixtures de posiciones ya cobradas y pendientes. | Aprobación | Falla reproducible sin modificar saldos reales. |
| P1-02 | Operación única de cancelación y reembolso atómico; recibos y movimiento contable. | P1-01 | Pruebas de reintentos, carrera con claim y fallo de persistencia. |
| P1-03 | Actualizar saldo, historial y recibos de UI al cancelar. Preparar auditoría histórica de solo lectura. | P1-02 | E2E de devolución inmediata; simulación histórica revisable. |
| P1-04 | IDs cortos persistentes, dueño/autor/fuente y selección explícita de mercado. | Aprobación de comandos | Pruebas de unicidad, reinicios y canal incorrecto. |
| P1-05 | Permitir concurrencia de mercados y adaptar apuestas/comandos/ayuda a IDs. | P1-04 | E2E con dos mercados y saldo compartido. |
| P1-06 | Servicio común de capacidades: dueño, moderador, viewer. Definir verificación de moderadores con el Plan 2. | P1-04 | API y chat rechazan acciones según la misma matriz. |
| P1-07 | Identidades externas, unicidad, migración de cuentas existentes y estrategia de conflictos. | Aprobación del acceso | Pruebas de no duplicar saldo, sesiones ni bono. |
| P1-08 | Login Twitch sin wallet previa; conservar link/unlink y destinos seguros. | P1-07 | E2E de primera entrada y regreso a una apuesta pendiente. |
| P1-09 | Login Google y adaptación del login Phantom al modelo común. | P1-07 y proveedor configurado | E2E por proveedor con fixtures y validación manual OAuth disponible. |
| P1-10 | Acceso y cuentas conectadas en app, perfil, canal público, móvil y extensión. | P1-08/P1-09 | Revisión en 700 × 600 y 360 px; estados de error/cancelación. |
| P1-11 | Revisar gates de wallet: puntos y permisos de canal frente a firma BYTE. | P1-06/P1-10 | Cuenta social opera puntos sin Phantom; BYTE sigue exigiendo firma. |
| P1-12 | Verificación completa, revisión de migraciones y entrega por etapas. | Anteriores | Checks verdes y reporte de pruebas reales y externas pendientes. |

Primera entrega recomendada: reembolsos. Segunda: IDs, mercados simultáneos y capacidades. Tercera: identidades y acceso. Se pueden revisar diseños del Plan 2 en paralelo, pero sus operaciones no se implementan sobre selectores ambiguos o permisos duplicados.

## 8. Criterios de aceptación y pruebas

| Caso | Resultado verificable |
| --- | --- |
| Cancelar desde chat con apuestas de tres personas | Las tres recuperan automáticamente lo debitado; no queda cobro pendiente por ese reembolso. |
| Repetir cancelación por chat y app, incluido mismo evento | No se duplica ningún crédito; se devuelve el resultado previo o el estado terminal. |
| Cancelar y cobrar al mismo tiempo | Un solo crédito total por posición. Saldo y ledger coinciden. |
| Fallo entre cambio de estado y escritura | La operación revierte o se recupera íntegra al reintentar; no informa éxito parcial. |
| Cuenta offline, sin wallet o sesión expirada | Recibe igualmente el reembolso en su cuenta persistida. |
| Reparar un mercado cancelado antes del cambio | Solo se acredita lo pendiente; la segunda ejecución acredita cero. |
| Abrir A y B, apostar 100 pts en ambos y cancelar A | Saldo inicial menos 100 pts; la posición en B queda intacta. |
| Dos débitos simultáneos mayores que el saldo disponible | Solo se aceptan operaciones cubiertas por el saldo; nunca saldo negativo. |
| Usar `!yes` con varios mercados posibles | Se pide elegir mercado y no se registra apuesta. |
| Resolver A o introducir un ID de otro canal | Solo cambia A, o se rechaza el canal incorrecto. |
| Login Twitch nuevo sin Phantom | Se crea o recupera una cuenta y aparece el perfil de Twitch. |
| Login Google o Phantom y vínculo posterior a Twitch | Se conserva la cuenta, el saldo y el historial. |
| Dos proveedores ya asociados a cuentas distintas | Conflicto explícito, sin apropiación ni fusión automática. |
| Reintento de callback, state inválido o retorno externo | Rechazo sin crear otra cuenta, bono o sesión. |
| Viewer autenticado solo con Google | Puede operar puntos en la app; el chat pide vincular Twitch; no puede administrar un canal por su nombre. |
| Extensión, 700 × 600, y móvil de 360 px | Login y cuentas conectadas accesibles sin hover ni desbordes; no exponer tokens. |

Ejecutar unitarios e integración sobre el dominio y persistencia local/SQL; luego E2E de login, varias posiciones, cancelación y conservación de saldo. Ejecutar typecheck, lint, build y los E2E existentes de BYTE y acceso público. Provisionar dependencias locales cuando sea posible. Si una prueba OAuth real o SQL no puede correr, registrar el proveedor o dependencia externa exacta, sin presentar fixtures como validación real.

## 9. Revisión previa y decisiones pendientes

La revisión encontró cinco riesgos que el plan ya trata: doble devolución por claim concurrente; apuestas dirigidas por orden de una lista; cuentas duplicadas por login social; privilegios derivados de wallet o autor del mercado; y una migración histórica que repague posiciones cobradas.

Antes de comenzar, confirmar:

1. Alcance de “siempre login”: toda página o solo app y participación. Recomendación: lectura pública, sesión obligatoria para participar.
2. Acreditación automática de cancelaciones únicamente, o también de premios ganadores. Recomendación para este plan: cancelaciones primero.
3. Apuestas repetidas: permitir un nuevo mensaje como otra apuesta de 100 pts o conservar una por opción. Recomendación: cada nuevo evento intencional, con límites y saldo suficientes.
4. Sintaxis de IDs y comillas propuesta. El usuario ya pidió comas; ese requisito se conserva.

El cierre de apuestas por moderadores y los límites de propuestas se resuelven en el Plan 2. Este documento no altera la prohibición confirmada: los moderadores no resuelven ni cancelan.

## 10. Fuentes técnicas consultadas

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): identidad estable por `sub` y validación del flujo.
- [Autenticación de Twitch](https://dev.twitch.tv/docs/authentication/): separar prueba de identidad, permisos de API y tokens de aplicación.
- [Get Moderators](https://dev.twitch.tv/docs/api/reference#get-moderators): base para comprobar el rol del moderador en el canal.

Se modifican solo archivos de planificación en este paso. No se ejecutaron migraciones, cambios de saldo, comandos del bot ni despliegues.
