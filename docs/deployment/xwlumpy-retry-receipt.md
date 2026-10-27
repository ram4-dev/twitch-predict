# Reintento de réplicas de Twitch

Origen: /Users/ramiro/.t3/projects/twitch-predict, origin/main 958a5302ac9b94c20a2a46ae478c593f8b61b570. Rama: fix-xwlumpy-mirror. Worktree: /Users/ramiro/.t3/projects/twitch-predict.fix-xwlumpy-mirror; se conserva para revisión.

El canal xwlumpy estaba registrado y la predicción fue detectada. Byte rechazó la creación con HTTP 429; el reintento posterior ocultó ese motivo con un error de ventana. Una respuesta 429 confirmada permite reintentar después de 30 segundos con un nuevo identificador y una ventana calculada desde el cierre de Twitch. Una operación pendiente o de resultado incierto no se vuelve a crear. La causa sigue visible si ya no queda ventana suficiente. Un límite persistente del proveedor puede seguir impidiendo crear mercados.
