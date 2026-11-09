# Contrato Plan 1

Base 504d3cb; rama apply-plan-01; worktree /home/meeting/projects/twitch-predict.apply-plan-01. Autorizado 2026-11-09.

Tipos importables: src/market-contract.ts. Actor contiene accountId estable y twitchId verificado; canal contiene id Twitch y login. capabilities(actor, channel, verifiedModerator) permite crear a dueño/mod, proponer a cuenta autenticada, cerrar/resolver/cancelar/revisar solo a dueño. creator nunca concede autoridad. verifiedModerator solo desde evidencia firmada del adaptador.

Points conserva agregado transaccional (Documents.update en SQL). Mercado expone key estable, shortId persistente, version, ownerTwitchId, creatorTwitchId. Nuevos mercados permiten concurrencia. Operaciones: plotCommand(channelId, actorId, command, eventId, verifiedModerator=false), createMarket(token, channelId, input, requestId, verifiedModerator=false), streamerAction(token,{key,action,winnerId?,expectedVersion?,requestId}), previewSettlement(token,key,winnerId). Creación HTTP POST /api/streamer/markets; acciones y preview mantienen /api/streamer/action y /api/streamer/preview. GET /api/channels/:id/capabilities para sesión. Version se valida antes de mutar, replay retorna recibo original.

Sesión 2 entrega ProposalCreateHandler (tipo real): recibe actor/canal/input/eventId y devuelve {kind:'proposal',id,text}. El bot decide !plot crear por evidencia firmada owner/mod; viewer requiere cuenta vinculada y deriva al handler. No se implementa otra entidad ni otro comando. Sesión 2 puede usar createMarket para publicar desde aceptación; confirmar atomicidad en su Documents.update compartida. No pasar roles del body HTTP.

Sintaxis: !plot crear Pregunta, Sí, No; campos con comas entre comillas dobles. !plot mercados; !plot apostar ID, 1; !plot cerrar ID; !plot resolver ID, 1; !plot cancelar ID. Atajos sin ID solo con destino único. IDs se resuelven dentro del canal. Cada evento Twitch es una apuesta nueva; replay usa eventId.

Cancelación devuelve cada posición pendiente dentro de la misma transacción y marca claimed/creditedAt/creditMethod=refund; ledger kind=refund. claim/distribution excluyen posiciones acreditadas. Ganador sin apuestas conserva resultado resolved y devuelve apuestas (reason explícita). Auditoría histórica solo reporte, sin escritura de datos compartidos.

Identidad: login Twitch sin token previo; link explícito con token conserva accountId; conflicto entre proveedores nunca fusiona. Proveedor Google sin configuración se declara no disponible.
