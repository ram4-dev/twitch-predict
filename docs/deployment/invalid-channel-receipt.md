# Validación de canales

Origen: /Users/ramiro/.t3/projects/twitch-predict, origin/main 023e4e1. Rama: fix-invalid-twitch-channel. Worktree: /Users/ramiro/.t3/projects/twitch-predict.fix-invalid-twitch-channel; se conserva para revisión.

El worker registraba un error por el canal inexistente `game`. Se verificó que no tenía réplicas y se retiró únicamente ese canal del documento cloud bajo bloqueo SQL, conservando todos los mercados y apuestas. La lista semilla del worker no contenía ese canal. Después del siguiente ciclo, la salud pública volvió a sourceError null. La API valida los nuevos canales en Twitch antes de registrarlos; no borra canales automáticamente ante fallos transitorios.

Verificación: npm run check; 63 pruebas con PostgreSQL local, incluidos rechazos y registros concurrentes; E2E del onboarding y réplica Byte con fixtures.
