# Patch de integración Plan 2 → archivos de sesión 1

Material de coordinación. NO aplicar al checkout de sesión 1; el coordinador lo revisa y aplica (o pide cambios).
Contexto: `src/proposals.ts` (dominio), `src/proposals-service.ts` (servicio + stores), `src/proposals-router.ts` (router HTTP),
`src/proposals-create-handler.ts` (decisión por rol de `!plot crear`) y `src/ui/proposals-*.tsx/css` ya existen en `apply-plan-02`
(commits a8eed97..17c4de4) y se copian tal cual al integrar.

## 1. `src/offchain-server.ts` — montar el router de propuestas

Después de la línea `app.use('/api/byte',byteRouter(byte,points,token,process.env,extensionId,byteMirror));` añadir:

```ts
import {proposalsRouter, type ProposalActorResolver} from './proposals-router.js';
import {ProposalService, cloudProposalStore, localProposalStore} from './proposals-service.js';
import type {MarketActor, MarketChannel} from './market-contract.js';

// Session 2 supplies the seams; identity evidence stays owned by Plan 1 modules.
const proposalActorResolver:ProposalActorResolver={
  // points.me(token) binds the bearer session to the account with its verified Twitch identity.
  actor: async req=>{try{const me=points.me(bearer(req));return {accountId:me.id,twitchId:me.twitch?.id};}catch{return null;}},
  token: async req=>bearer(req)||null,
  channel: async channelId=>{const login=Object.values(state.streamers)...}
};
```

El resolver de canal y dueño debe conectarse a la evidencia real de Plan 1 (`streamers` de Points + verificación de
moderadores que sesión 1 implementa). Borrador exacto para revisar contra el código final de sesión 1:

```ts
  channel: async channelId=>{
    // Map twitch channel id -> login via Points' streamer table; adjust to session 1's final identity module.
    const streamer=Object.values(points.state?.streamers??{}).find(s=>s.twitchId===channelId);
    return streamer?{id:channelId,login:streamer.channel}:null;
  },
  isChannelOwner: async (actor,channelId)=>actor.twitchId===channelId,
};

const proposals=new ProposalService(process.env.PLOT_CLOUD==='1'?cloudProposalStore(documents):localProposalStore(`${directory}/proposals.json`),proposalMarketGateway);
app.use('/api/proposals',proposalsRouter({service:proposals,resolver:proposalActorResolver}));
```

`proposalMarketGateway` (publicación atómica): envolver `createMarket`/`plotCommand` del Plan 1 manteniendo el mismo
`Documents` para que la aceptación y la publicación compartan transacción SQL. Contrato esperado por sesión 2:
`publishMarket({token,channel,input,actor,requestId}) → {key,id}` con recibo idempotente por `requestId`.

## 2. `src/cloud/twitch-bot.ts` — decisión por rol en `!plot crear`

Donde el adaptador maneja `kind:'create'` del comando (`plotCommand`), sustituir la llamada directa por:

```ts
import {handleProposalCreate} from '../proposals-create-handler.js';

const result=await handleProposalCreate({proposals,publishMarket,token:actorToken},
  {actor:{accountId,twitchId},channel:{id:channelId,login},input:{title,options},eventId,verifiedModerator});
// result.kind==='market' → respuesta de mercado actual (texto de Plan 1)
// result.kind==='proposal' → result.text ya informa "Propuesta <shortId> ... pendiente de aprobación"
```

`verifiedModerator` debe salir de la evidencia firmada EventSub/caché corta de sesión 1 (P2-03); nunca del texto del mensaje.

## 3. `src/ui/consoles.tsx` — bandeja en la consola del streamer (sesión 2 es dueña del archivo, pero el montaje toca puntos de sesión 1)

En el `StreamerConsole` de `src/ui/consoles.tsx` (propiedad de sesión 2), la bandeja se monta con:

```tsx
import {ProposalInbox} from './proposals-ui.js';
import {httpProposalsClient} from './proposals-client.js';
// dentro de StreamerConsole, por canal propio:
{data.channels.map(c=><ProposalInbox key={c} client={httpProposalsClient()} channelId={channelIdFor(c)}/>)}
```

`channelIdFor` necesita el Twitch ID del canal desde el contrato de sesión 1 (`GET /api/channels/:id/capabilities`).

## 4. CSS

Agregar `src/ui/proposals.css` a los bundles que ya importan `plot.css`/`app-materials.css` (script de build del coordinador).

## Notas de seguridad

- El router no acepta roles del body; `isChannelOwner` se resuelve en servidor.
- La aceptación publica con `requestId` determinístico `proposal-accept:<id>:<version>`; el gateway debe honrar el recibo.
- Sin bearer persistido en propuestas; saldo ajeno a este dominio.
