# Mercados de byte en Solana devnet

La integración usa el contrato y las rutas de `partner-markets.md`. Permite crear mercados SOL, apostar desde Phantom, sincronizar el pozo, resolver con evidencia y observar el estado de los pagos automáticos de byte. No incluye mainnet ni apuestas en BYTE Token-2022.

## Ejecutar

El archivo local `.env` está preparado, ignorado por Git y tiene permisos 600. Completá `BYTE_API_KEY` con una key que byte haya habilitado como partner. No se ingresa en el navegador ni se incluye en el bundle.

```sh
npm ci
npm run build
npm run dev:byte
```

Portless informa la URL estable `twitch-predict-byte.localhost` con el puerto de su proxy. En este equipo es `http://twitch-predict-byte.localhost:1356/byte`. El comando observa cambios de código y de `.env`; el modo puntos anterior conserva `npm run dev`. `MARKET_MODE=byte` sirve el panel de Plot directamente en `/`; `/byte` conserva acceso compatible.

Variables:

| Nombre | Uso |
| --- | --- |
| `BYTE_API_KEY` | Credencial de partner, exclusivamente en el servidor. |
| `BYTE_BASE_URL` | API de byte. Predeterminado: `https://app.bytearena.fun`. |
| `BYTE_RPC_URL` | RPC de Solana devnet, usado por un proxy del backend para no exponer credenciales del proveedor. El público puede devolver 429; se puede configurar otro proveedor de devnet. |
| `BYTE_OPERATOR_WALLETS` | Direcciones operadoras separadas por comas. Vacío habilita el operador local mediante el bridge ya existente. |
| `MARKET_MODE` | `byte` abre la aplicación de mercados; `offchain` conserva la POC de puntos. |
| `DATA_DIR` | Almacenamiento local; predeterminado `data` de este checkout. |
| `APP_ENV_FILE` | Ruta alternativa de entorno. Vacío impide cargar `.env`, usado por las pruebas aisladas. |

El servidor escucha en `127.0.0.1` y permite solamente los hosts locales conocidos. El modo de operador local está pensado para esta máquina. No se debe publicar por un túnel o reverse proxy: cualquier visitante del mismo origen podría obtener el bridge. Para un despliegue multiusuario hacen falta origen/HTTPS de producción, permisos explícitos por wallet, sesiones de producción y revisión del resto de endpoints locales anteriores.

## Recorrido

1. **Operador:** completar canal, pregunta, opciones, ventana y reglas. La ventana admitida por byte es de 60 segundos a 7 días. La wallet del creador es opcional y habilita su comisión.
2. **Usuario:** conectar Phantom, firmar el acceso y disponer de SOL devnet para apuesta, cuenta de apuesta y comisiones. Seleccionar opción e importe y confirmar la transacción en Phantom. La aplicación no posee la clave de la wallet.
3. **Confirmación:** se verifica el programa y el genesis de devnet, se firma `place_bet` con un nonce criptográfico y se guarda la firma antes de transmitir. La confirmación consulta el RPC; luego se solicita `chain-sync` a byte.
4. **Resultado:** al cerrar la ventana, el operador elige la opción y registra evidencia. La anulación exige un motivo y puede hacerse antes del cierre. Ambas acciones requieren confirmación explícita.
5. **Pago:** byte resuelve y distribuye. La interfaz distingue resultado registrado de `chain.settled=true`. No realiza reclamos manuales ni calcula o promete pagos fijos.

El pozo es parimutuel con peso temporal, no una compra de participaciones a precio fijo. Los porcentajes mostrados son proporciones de los pozos. Las comisiones documentadas se aplican a la ganancia: 2% de protocolo y 0,5% de creador cuando corresponde. La resolución es manual; no se interpreta automáticamente el video ni se usa una predicción de puntos de Twitch como prueba del resultado.

## Extensión

Cargar la carpeta `extension` de este checkout como extensión descomprimida en Chrome. En `/byte`, pulsar **Vincular extensión**. El popup consulta el modo del backend, muestra los mercados byte del canal y abre la web filtrada por canal para firmar con Phantom. En modo byte el background no crea copias offchain de las predicciones de Twitch. Las operaciones con fondos se firman en la página de la aplicación; no en el popup.

## Recuperación y persistencia

- `data/byte.json` conserva reglas por canal, identificadores de creación y evidencia de resolución mediante reemplazo atómico. Mantener un solo proceso escritor por `DATA_DIR` y respaldar el directorio.
- Las creaciones concurrentes con el mismo UUID se ejecutan una sola vez. Ante un timeout o una respuesta no verificable quedan pendientes. Una nueva UUID con los mismos datos tampoco repite la creación.
- En **Operador**, una creación incierta puede conciliarse con el ID `pm_…` existente. El servidor verifica que pregunta, moneda y opciones coincidan. Revisar primero los mercados del partner; no crear otro para sustituir un resultado incierto.
- Los recibos de apuestas se guardan en este navegador por wallet. **Mis apuestas → Revisar transacciones** vuelve a consultar las firmas y reintenta la sincronización. Una apuesta pendiente bloquea otro envío para la misma wallet y mercado, incluso después de recargar.
- Se marca una transacción como expirada solo cuando no tiene estado y la altura finalizada supera su vencimiento. Un fallo de sincronización con byte no convierte una apuesta confirmada en fallida.
- El historial local no es un indexador de todas las apuestas de la wallet. Borrar el almacenamiento del navegador elimina los recibos locales; las transacciones permanecen en cadena.

## Verificación

```sh
npm run check
npm run test:e2e
```

Las pruebas unitarias e integración verifican codificación de instrucciones y PDAs, montos exactos, permisos, configuración devnet, creación idempotente, recuperación tras reinicio y resolución con evidencia. Los E2E usan el backend y la UI reales, firmas Ed25519 reales y un transporte de byte/RPC controlado por un preload exclusivo de pruebas. Ese transporte valida firma, programa, PDAs y montos; no prueba ejecución del contrato, distribución de fondos reales ni disponibilidad de las rutas del partner.

La prueba contra byte requiere una key habilitada y fondos devnet en las wallets. Con la key vacía la creación permanece deshabilitada. Los E2E legacy de Doppler están excluidos del modo offchain/byte y no constituyen validación de este contrato.

La UI compartida del panel y la extensión, el flujo de selección y la validación están en [docs/byte-shared-ui.md](docs/byte-shared-ui.md).
