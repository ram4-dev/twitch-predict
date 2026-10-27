# Onboarding de streamers

Origen: /Users/ramiro/.t3/projects/twitch-predict, origin/main 29b26ba. Rama: feat-streamer-onboarding. Worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-streamer-onboarding; se conserva para revisión.

El flujo firma con Phantom, verifica la identidad mediante Twitch OAuth y habilita el seguimiento del canal asociado. En cloud Twitch OAuth todavía requiere TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET configurados para el callback https://plot-devnet.vercel.app/auth/twitch/callback. No se solicitan ni almacenan tokens de Twitch en el navegador.

Pruebas: npm run check; 63 pruebas con PostgreSQL local; Playwright en modo Byte con firma real de fixture, OAuth simulado, activación de seguimiento, cancelación, error de configuración y réplica. Se inspeccionaron escritorio, tablet y móvil con 0 fallas de diseño. No se verificó una autorización Twitch real por falta de credenciales.
