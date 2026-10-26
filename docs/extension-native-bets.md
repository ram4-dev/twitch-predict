# Apuestas desde la extensión · 0.8.0

El popup elige el mercado, importe y resultado. Un clic en Apostar abre una ventana auxiliar que solicita la firma a Phantom automáticamente. No abre el panel ni presenta otra confirmación de Plot. Phantom sigue siendo quien confirma la transacción. El proveedor inyectado se usa desde una página del mismo servidor; no está disponible directamente en el origen chrome-extension.

El worker guarda la operación antes de abrir la ventana y ata los mensajes a un UUID, origen, ruta y tab ID. No entrega tokens de sesión al firmante ni los coloca en la URL. El recibo se guarda en almacenamiento de extensión antes de transmitir los bytes firmados. Cerrar el popup o la ventana después del envío conserva la firma pendiente; el popup consulta Solana, sincroniza Byte y muestra el historial. Una ventana de firma desaparecida se detecta al reabrir el popup.

El panel restaura la sesión autenticada y usa onlyIfTrusted sin pedir otra firma de acceso al refrescar. La firma de cada apuesta sigue verificando la cuenta activa. Cambiar a otra cuenta invalida la conexión del panel.

La validación de transacciones reconstruye la transacción devuelta por el proveedor y comprueba la firma, wallet, blockhash y la instrucción Byte completa: programa, cuentas, permisos, importe, resultado y nonce. Admite únicamente instrucciones modernas de ComputeBudget con valores acotados y hasta 100.000 lamports de comisión adicional. Transferencias extra, cambios de apuesta, instrucciones desconocidas y firmas inválidas se rechazan. La comparación anterior exigía mensajes serializados idénticos. No se dispone de la transacción concreta que produjo el error del usuario; el caso de enriquecimiento de comisiones está reproducido con firmas Ed25519 reales en las pruebas, pero falta confirmar la firma con su Phantom instalado.

## Recibo de trabajo

- Fuente: /Users/ramiro/.t3/projects/twitch-predict, main, commit 9a1c36a.
- Worktrunk: rama feat/extension-native-bets, checkout /Users/ramiro/.t3/projects/twitch-predict.feat-extension-native-bets.
- Cambios: validador y cliente de firma; puente web de firma; worker, popup y componentes compartidos; restauración de sesión; onboarding automático de extensión; build; manifest 0.8.0; pruebas unitarias y E2E.
- npm run check: typecheck, lint, 47 pruebas y build aprobados.
- Playwright completo: 34 aprobados y 5 omitidos por modo (4 legacy Solana y 1 Byte dedicado). Byte mirror en modo Byte: 1 aprobado. Tras ampliar el flujo MV3: prueba específica aprobada con conexión desde extensión, sesión conservada al refrescar el panel, un clic para firmar, cierre de ventana con transacción pendiente, reapertura del popup, confirmación por RPC, historial y exactamente un envío.
- Las pruebas usan el backend real local, una extensión MV3 real y fixtures de RPC/partner/Phantom con firmas Ed25519 verificadas. No se firmó ni envió una nueva apuesta desde la wallet del usuario durante este trabajo.
- La versión instalada en Chrome personal requiere recarga manual desde la carpeta extension del checkout principal. La herramienta rechazó previamente el acceso a chrome://extensions; no se intentó eludirlo.
- Se conserva el worktree para reanudar. Los cambios previos sin seguimiento de output en el checkout principal se preservan.
