# Compra y retiro de puntos

La funcionalidad parte de `origin/main` en `07157a0`. Usa el saldo actual, las identidades Twitch/Phantom y las comisiones de esa versión. Los puntos de bienvenida, las compras, las apuestas, los premios y los retiros comparten el mismo saldo. La equivalencia es 1 USDC = 1.000 puntos; los 10.000 puntos de bienvenida siguen siendo retirables por 10 USDC a cargo de la plataforma.

## Acceso y operaciones

La extensión ofrece **Buy / withdraw** y el perfil de la app ofrece **Comprar y retirar puntos**. Ambos abren `/app#balance`, la sección Saldo de la app actual, con la sesión del usuario en ese navegador. `/wallet.html` redirige a esa misma sección para conservar enlaces anteriores. Si la cuenta entró con Twitch y todavía no tiene wallet, el acceso a Phantom usa el vínculo de cuentas existente. Para comprar o retirar se necesita una wallet vinculada; para apostar los puntos existentes sigue bastando la identidad admitida por la app.

La compra ofrece paquetes de 1.000, 5.000, 10.000 y 25.000 puntos (1, 5, 10 y 25 USDC). Después de elegir el paquete se selecciona SOL o USDC; no se ingresa un monto libre. El servidor calcula el pago y conserva la cantidad exacta de puntos del paquete. Comprar solicita la firma de Phantom. Retirar solicita confirmación del importe y envía los fondos exclusivamente a la wallet de la cuenta. El usuario paga la red y la creación de cuenta USDC cuando compra; la tesorería paga esos costos al retirar. La aplicación no agrega una comisión de compra o retiro. Las comisiones de las apuestas siguen las reglas actuales de main.

Las cotizaciones duran 60 segundos. SOL usa el spot SOL/USDC de Coinbase; una respuesta de otra moneda, sin fecha o demasiado antigua se rechaza. Las conversiones usan enteros de base. Los retiros redondean hacia abajo; el pago de un paquete en SOL redondea hacia arriba al lamport más cercano, sin alterar los puntos anunciados. USDC utiliza el mint oficial de Circle para cada red. Máximo por operación: 1.000.000 puntos.

## Persistencia y recuperación

Las órdenes y los movimientos se guardan dentro del agregado Points. La misma API se monta sobre el almacenamiento local y sobre el contexto PostgreSQL de cada petición cloud. Reservar un retiro y guardar sus bytes firmados es una sola transacción. Las apuestas compiten contra ese mismo saldo, sin sobregiro.

El servidor acepta compras solo si la firma es válida y el mensaje completo coincide con el cotizado. Guarda la transferencia antes de transmitir. Acredita al verificar la transacción finalizada y su mensaje en cadena. Los reintentos usan la misma firma. Los retiros pendientes mantienen el saldo reservado; una falla finalizada o una expiración sin registro después de la altura finalizada devuelve los puntos una sola vez. Volver a abrir la sección recupera y revisa operaciones pendientes.

La primera cotización fija la red del almacenamiento. No se permite retirar en mainnet un saldo financiado en devnet. Debe usarse un DATA_DIR o namespace PostgreSQL distinto por red.

## Configuración

Las operaciones permanecen deshabilitadas por defecto.

| Variable | Uso |
| --- | --- |
| `POINTS_PAYMENTS_ENABLED` | `true` habilita el servicio. En local selecciona el flujo actual de puntos para `/app`; en cloud anuncia puntos a la extensión y el worker sincroniza esos mercados. |
| `POINTS_NETWORK` | `devnet` por defecto; `mainnet-beta` selecciona la red de fondos reales. |
| `POINTS_RPC_URL` | RPC del servidor; vacío elige el público de esa red. Se comprueba el genesis antes de operar. |
| `POINTS_TREASURY_KEYPAIR` | Keypair JSON, exclusivamente en el servidor. Provisionar con `vault-env`; no copiar valores a cliente, documentación o logs. |

La tesorería necesita SOL para red y liquidez en SOL/USDC para los retiros. Recibir SOL no ejecuta un swap automático a USDC; la plataforma administra la liquidez y el riesgo de precio. La compra de puntos no crea una apuesta directa en Byte.

## Validación y límite

Las pruebas nuevas cubren importes exactos, firma alterada, idempotencia, reservas, reembolsos, fallas de disco, redes distintas y concurrencia entre instancias PostgreSQL. Los E2E usan el servidor y la interfaz actuales, firmas reales y un transporte RPC exclusivo de pruebas. Cubren compra → apuesta con ese saldo → retiro y el acceso desde la extensión a 700 y 360 px.

Estas pruebas no acreditan transferencias en una red pública. Esa validación necesita una tesorería provisionada y fondos en las wallets. No se activaron pagos ni se movieron fondos reales durante esta implementación.

Fuentes técnicas: [USDC de Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses), [transacciones de Solana](https://solana.com/docs/rpc/http/gettransaction), [spot de Coinbase](https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices).
