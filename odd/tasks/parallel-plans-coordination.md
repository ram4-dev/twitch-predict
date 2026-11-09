# Aplicación paralela de los dos planes

Autorización: el usuario pidió aplicar ambos planes en paralelo y crear dos sesiones adicionales, cada una en su worktree (2026-11-09).

## Base y reglas

Los dos worktrees deben nacer del mismo checkpoint local de `plot-chat-predictions`, con los cambios de UI, infraestructura, comandos y planes existentes. No partir de `main` sin esos cambios, porque todavía no están publicados. No push, force-push, merge a main ni despliegue de producción. Commits locales permitidos sin atribución de IA. Conservar cambios ajenos y registrar evidencia y SHA en cada entrega.

Se usan dos sesiones de T3 Code en este host, con Codex gpt-6.1-sol y razonamiento high. Herdr no está activo en este entorno. No crear sesiones ni subagentes adicionales. El coordinador se ocupa de compatibilidad entre entregas e integración final.

## Decisiones para avanzar

Aplicar las recomendaciones de los planes donde no hubo otra elección del usuario y registrarlas en la entrega:

- Lectura pública de canales, búsqueda y QR; sesión obligatoria para la app personal y operaciones de participación. No convertir los overlays en pantallas de login.
- Reembolso automático al cancelar, incluyendo reparación histórica preparada en simulación. No ejecutar reparación sobre datos persistentes compartidos sin un reporte revisable. Premios ganadores mantienen por ahora el cobro actual.
- Varios mercados simultáneos con ID estable/corto. Ante ambigüedad en comandos, pedir ID sin mutar ni apostar al primer mercado.
- Cada nuevo evento de apuesta intencional puede apostar otra vez; repetir el mismo evento no duplica el débito.
- Comas en comandos y soporte explícito para texto entre comillas si contiene comas. Atajos anteriores seguros cuando haya un único destino.
- Twitch primero, Google y Phantom como accesos alternativos; cuenta interna estable y vínculo seguro de identidades. No exigir wallet para puntos ni para una propiedad de canal verificada por Twitch.
- Moderadores pueden crear; cerrar, resolver y cancelar quedan inicialmente solo para el dueño. Ningún creador o proponente hereda esos derechos.
- `!plot crear` es único: dueño/moderador publican; viewer autenticado genera propuesta. Proponer desde chat es obligatorio, no un extra ni otro comando.
- Propuestas: tres pendientes por persona/canal y cinco envíos por hora como valores iniciales configurables, sin expiración automática. Solo dueño acepta/rechaza; guardar versión original y publicada si edita al aceptar. No cambiar silenciosamente la regla actual de apuestas de dueños/moderadores.

## Propiedad de archivos y dependencias

No están solos en el repositorio. No reviertan trabajo de la otra sesión. Cada uno modifica solo su worktree y sus archivos asignados. Compartir commits y contratos, no editar el checkout de la otra sesión.

### Sesión 1: Plan 1 y contrato central

Responsable de `src/points.ts`, identidad/autenticación (`src/auth.ts`, `src/twitch-auth.ts`, `src/cloud/auth.ts`, `src/cloud/twitch-auth.ts` y nuevos módulos equivalentes), parser `src/plot-chat.ts`, política de capacidades por canal y operaciones comunes de mercado. Responsable de routers principales `src/offchain-server.ts`, `src/cloud/app.ts` y adaptador `src/cloud/twitch-bot.ts`. Responsable de UI de login/perfil (`src/ui/onboarding.tsx`, `src/ui/streamer-onboarding.tsx`, `src/ui/mobile-app.tsx`) y componentes de cuentas conectadas. Responsable de sus pruebas, migraciones y scripts de reembolso.

Publicar primero un commit local de contrato/dominio: tipos del actor/canal, capacidades, DTO de mercado con ID/versión/dueño/autor, y funciones/endpoints previstos para crear/cerrar/previsualizar/resolver/cancelar. Incluir tipos o interfaces reales donde resulte útil y un documento de contrato en `odd/tasks/plan-01-contract.md`.

No implementar entidad de propuestas ni bandeja de propuestas. Preparar puntos de integración explícitos para un servicio de propuestas y la decisión única por rol en `!plot crear`; no escribir un servicio alternativo o rutas duplicadas. No modificar `src/ui/consoles.tsx` (sesión 2). Para archivos compartidos que deba cambiar la sesión 2, aceptar un parche acotado revisado por el coordinador.

### Sesión 2: Plan 2 y experiencia de consola/propuestas

Responsable de nuevos módulos de propuestas (dominio, persistencia/repositorio, router propio), UI de propuestas/compositor/acciones de administración, y `src/ui/consoles.tsx`. Responsable de pruebas de propuestas, permisos de publicación frente a resolución, ciclo completo de consola y layouts. Puede agregar CSS separado y componentes nuevos para evitar colisiones con el login.

Empezar en paralelo por modelo de propuesta, transiciones, límites, pruebas de concurrencia, componentes y consola. Consultar el contrato de sesión 1 antes de fijar integraciones de identidad/mercado. No editar `src/points.ts`, parser/chat ni routers principales, ni UI de login/perfil asignados a sesión 1.

Entregar un módulo/handler consumible para `!plot crear` y rutas HTTP, con resultado discriminado mercado/propuesta, y parches mínimos de montaje si hacen falta en archivos asignados a sesión 1. Esos parches son material de integración y NO se aplican al checkout de sesión 1. Compartirlos con el coordinador.

Una propuesta aceptada debe llamar a las operaciones comunes de mercado, no copiar reglas de saldo o resolver permisos por su cuenta. Las rutas de creación/moderación verifican el actor en servidor. No confiar en roles enviados por frontend. El moderador de un canal no tiene acceso a la bandeja privada de otro.

### Archivos de integración y generados

`src/ui/streamer-app.tsx`, `src/ui/points-ui.tsx`, estilos compartidos y scripts de build pueden requerir cambios de ambas áreas. El coordinador decide el dueño antes de editar si hay colisión; priorizar componentes nuevos y parches de montaje pequeños. Cada sesión puede ejecutar build dentro de su propio worktree. Los bundles generados se regeneran al integrar, no se fusionan a mano.

No usar servidores E2E del mismo nombre/puerto/estado global simultáneamente. Cada sesión debe parametrizar su launcher/Playwright con estado Portless y puertos de proxy propios, o coordinar ejecución secuencial de E2E con el coordinador; nunca matar el proxy o servidor de la otra. No tocar los servicios `plot-wallet-preview`, `plot-main-preview` ni `plot-bot-webhook-tunnel`; el coordinador actualiza el preview después de integrar y verificar.

## Coordinación y entregas

Al tener contrato o una dependencia, informar en la sesión y enviar un mensaje al coordinador de este hilo. Registrar en `odd/tasks/plan-01-progress.md` o `odd/tasks/plan-02-progress.md`: rama, ruta, base, commits, decisiones, interfaces, pruebas y bloqueos. La sesión 2 puede leer archivos/contrato del otro worktree sin modificarlos. Si hay una incompatibilidad, avisar temprano y continuar trabajo independiente.

Verificación obligatoria: pruebas significativas de dominio/integración, typecheck, lint, build y E2E relevantes. Aprovisionar dependencias locales cuando sea posible. Diferenciar fixtures de OAuth/roles frente a validaciones reales. Si falta acceso externo (por ejemplo configuración Google), verificarlo por herramientas y reportar el bloqueo exacto; no inventar éxito ni pedir secretos por chat. Usar `vault-env` para secretos existentes y no imprimir valores.

El coordinador revisa ambas entregas, integra primero dominio/identidad, luego propuestas/consola, aplica el montaje compartido y ejecuta la verificación combinada antes de actualizar el preview. Esto no autoriza publicación ni merge a main.
