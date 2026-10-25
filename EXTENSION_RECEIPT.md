# Vista de la apuesta en la extensión

Fecha: 2026-10-25.

## Checkout

Fuente: /Users/ramiro/.t3/projects/twitch-predict.feat-market-lifecycle.
Commit base: 21d61ae846f451d049dbf8b0684ea7aaaca061e2.
Rama: feat/extension-market-view.
Worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-extension-market-view.

Se conserva la rama anterior. El nuevo worktree comparte data y node_modules con la POC por symlinks ignorados por Git. No se modificaron contratos ni se creó un programa de Solana.

## Cambios

- Popup 0.2.0 con pregunta, resultados, puntos, participantes, porcentaje de puntos, totales, cuenta regresiva, ganador cuando Twitch lo informa, fechas e IDs.
- Estado separado del mercado automático: pendiente, creando, creado, resuelto, error, puente desconectado y red real. Enlace al panel.
- Snapshots separados por canal. Selección del canal de la pestaña de Twitch con activeTab al abrir la extensión; selector para otros canales consultados.
- La detección de Twitch funciona sin emparejar. Los errores del puente no borran la información nativa.
- El backend conserva las métricas nuevas y el estado nativo sin recrear el mercado ni alterar su identidad. No permite regresiones de cerrado a abierto por una respuesta vieja. Las compras se rechazan si Twitch informa un estado distinto de ACTIVE.
- El bundle extension/model.js se genera con esbuild desde src/extension-model.ts, que comparte la validación de entradas con el backend. Se excluye ese bundle de lint, no su código fuente.

## Verificación

- Typecheck, ESLint, build: PASS.
- 12 pruebas unitarias: PASS.
- 5 E2E: PASS, 2.5 minutos. Extensión MV3 real con respuesta Twitch controlada y creación en contratos Doppler clonados; validan métricas, lock, ausencia de duplicados, aislamiento entre canales, puente desconectado, compra/resolución/cobro y reembolso.
- git diff --check: PASS.
- Capturas: test-results/extension-popup.png y test-results/popup-offline.png.

## Prueba en vivo y operación

El puente se actualizó a este checkout en el job de launchd dev.twitchpredict.bridge y mantiene http://twitch-predict.localhost:1356. Sigue en Solana local.

Se abrió la extensión 0.2.0 en Chrome for Testing con el perfil persistente data/chromium, emparejada con el puente. ID de esta instalación: ollbbkfbddnmogelnkcciijgfcknihoi. En warthunder_esports se detectó la apuesta ed9a78a6-decf-40b6-b969-cb96f514b801, “Who will win this BO7?”, DODEC / AVReS, y se observaron los contadores nativos y el progreso de creación automática. Captura: /tmp/extension-live-popup.png.

La sustitución en el Chrome habitual está bloqueada por el controlador nativo: “Sky Computer Use native pipe startup failed”. La extensión antigua de ese perfil no fue modificada ni se afirma que esté actualizada. Para completar esa instalación, cargar la carpeta extension de este checkout en chrome://extensions, emparejar su ID y desactivar la versión 0.1.0.

El popup nuevo se dejó abierto sobre el stream en Chrome for Testing. No confundir esa ventana con el Chrome habitual. No se usaron fondos reales ni se migró a devnet público.

La creación en vivo terminó correctamente: mercado A3YTVgTdraaipgRdf4rW4aARcziU7ttDNgxBwcGDmZfh en localnet, phase=open, seis transacciones de creación. El registro conservó color, totalPoints y totalUsers de DODEC y AVReS, actualizados por las consultas posteriores.
