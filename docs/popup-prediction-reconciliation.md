# Una tarjeta por predicción · 0.9.1

El popup asociaba la referencia de Twitch con el mercado únicamente mediante byteMarketId. Un snapshot antiguo o incompleto podía conservar el ID original de Twitch y perder ese enlace a Byte: la UI mostraba entonces el mercado real y otra tarjeta vacía de referencia para el mismo evento. La regresión se reprodujo antes del arreglo: la E2E esperaba una tarjeta y encontró dos.

La reconciliación usa el canal y el ID de predicción de Twitch, además del ID de Byte cuando existe. El mercado Byte conserva su pozo, participantes, ganador y nodo React al cambiar de estado. Las referencias repetidas del mismo evento se descartan. Los títulos no se usan como identidad: en los datos reales de judah_xx aparecieron dos rondas de “win or lose”, con los IDs bc6f17b5-7de7-48da-940f-b8df42b26096 y c7078e10-40c2-4d2d-8cfb-b44a2c8c31a2. La primera estaba resuelta y la segunda bloqueada, por lo que ambas deben conservarse. La UI identifica cada ronda por su fecha y hora de inicio, además del cierre.

La consulta de mercados del popup se ejecuta cada cinco segundos independientemente de la consulta del stream. Las solicitudes concurrentes de Twitch se agrupan por canal; su error o demora no impide obtener un resultado que Byte ya confirmó. El botón Actualizar puede consultar el mercado mientras el stream sigue pendiente. Se conserva la caché y la protección contra apuestas con datos antiguos.

## Recibo

- Fuente: /Users/ramiro/.t3/projects/twitch-predict, main d18a9ad.
- Worktrunk: fix/popup-prediction-reconciliation, /Users/ramiro/.t3/projects/twitch-predict.fix-popup-prediction-reconciliation. Se conserva el checkout. Se preservan output y los demás worktrees.
- Cambios: reconciliación de referencias, timer y solicitudes del popup, metadatos de ronda, bundles, manifest 0.9.1 y pruebas.
- npm run check: typecheck, lint, 51 unitarias y build aprobados. Playwright completo: 34 aprobados y 5 omitidos por modo; Byte dedicada: 1 aprobada (35 E2E activos entre ambos modos).
- E2E Byte dedicada: aprobada después del fallo de reproducción. Inserta un snapshot sin enlace a Byte, bloquea la consulta del stream, cierra la pestaña Twitch, pasa por LOCKED y RESOLVED, y comprueba una sola tarjeta, pozo 0,03 SOL, opción ganadora, nodo conservado, actualización automática y reapertura sin duplicados. También verifica que la réplica se crea una sola vez y que una ventana demasiado corta no crea otro mercado.
- Unitarias cubren identidades distintas con títulos iguales, canal, referencias sin ID de Byte, ID de Byte antiguo y deduplicación del mismo evento.
- La activación en el Chrome personal requiere recargar Plot. La herramienta rechazó previamente la administración de extensiones de Chrome; no se intentó eludirlo.

El checkout principal pasó a branding/plot-mascot (ceee878) durante el trabajo. Se preserva esa rama y se prepara un checkout de integración de main en /Users/ramiro/.t3/projects/twitch-predict.main con Worktrunk. La extensión corregida se construye en ese checkout; la carpeta extension del checkout de branding conserva su versión anterior.
