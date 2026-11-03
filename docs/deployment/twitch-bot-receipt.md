# Bot de Twitch por streamer

Trabajo en `/Users/ramiro/Desktop/projects/worktrees/twitch-predict/feat-twitch-bot-cloud`, rama `feat/twitch-bot-cloud`, creado desde la implementación cloud y actualizado sobre `origin/main`. Se conserva el prototipo local anterior en su worktree; no se despliega.

La cuenta `plotfun` autoriza una vez los permisos `user:bot`, `user:read:chat` y `user:write:chat`. Cada streamer vincula Twitch a su cuenta de Plot y aprueba `channel:bot` mediante el botón Agregar bot. La autorización queda ligada a la cuenta, wallet, identidad de Twitch, cookie y ticket de un solo uso. Quitar bot o desvincular Twitch elimina la habilitación; el worker retira la suscripción y cancela los envíos en cola. No se otorgan permisos de moderación.

La API recibe EventSub por webhook bajo el dominio público. Verifica HMAC sobre los bytes originales y la antigüedad del mensaje. La clave del webhook se deriva del secreto de cliente con HMAC-SHA256 y una etiqueta específica; no se envía al navegador. PostgreSQL guarda los permisos, las suscripciones observadas, la deduplicación y una cola de mensajes. Los tokens de usuario se descartan después de validar el consentimiento sin revocar el permiso recién concedido; Twitch conserva ese permiso y las operaciones usan un token de aplicación. El token de aplicación vive solo en memoria y se obtiene de nuevo al vencer o recibir un 401.

El worker existente de Railway concilia las suscripciones y envía el saludo de conexión, anuncios de mercados replicados activos y respuestas a !plot. Los envíos usan su lease de trabajo y verifican nuevamente el permiso antes de enviar. Se limita la frecuencia y se restringen los mensajes al canal de origen en sesiones de chat compartido. Un envío cuya respuesta sea ambigua no se repite automáticamente, para evitar duplicar mensajes públicos; la cola conserva su resultado.

Verificación previa al despliegue: `npm run check` con PostgreSQL 18 local (96 pruebas aprobadas), cuatro pruebas de integración del bot con SQL y webhook HTTP, y ocho E2E de onboarding/Twitch/bot aprobadas. La prueba de navegador cubre alta, consentimiento simulado, estado conectado, baja y anchos de 360, 700 y 1440 px. Se inspeccionó la captura de 360 px.

Callbacks públicos: `https://plot-devnet.vercel.app/auth/twitch/callback` y `https://plot-devnet.vercel.app/auth/twitch/bot/callback`. Vercel reenvía /auth y /api a Railway. El endpoint EventSub es `/api/twitch/bot/webhook`. La autorización de la cuenta del bot se inicia desde `/bot-setup.html`; solo la identidad plotfun puede completarla.

Estado de despliegue y prueba real: pendiente de registrar al terminar la verificación.
