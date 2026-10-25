# Prediction Mirror · Puntos internos

POC local: una extensión Chrome detecta predicciones de Twitch y crea una copia automática con el mismo título y opciones. Los consumidores apuestan puntos propios guardados en el servidor. El flujo predeterminado no usa Solana, wallets ni fondos reales.

## Ejecutar

Requiere Node 22+, npm y Portless.

```sh
npm ci
npm run build
npm run dev
```

Abrí la URL `.localhost` que imprime Portless. En este equipo: http://twitch-predict.localhost:1356.

```sh
npx playwright install chromium
npm run chrome -- warthunder_esports
```

El lanzador carga la extensión 0.3.0, la empareja, abre Twitch y abre el popup nativo de 700 px sin fijar el tamaño de la ventana. Para Chrome habitual, cargá la carpeta `extension` como extensión descomprimida y conectá su ID desde el panel.

## Flujo

- Cada instalación de la extensión y cada perfil del panel tienen cuentas anónimas independientes con 10.000 puntos iniciales. El identificador de sesión se conserva en el almacenamiento del navegador. No hay recuperación de cuenta si se borra ese almacenamiento.
- El panel permite seguir canales. El servidor consulta Twitch cada cinco segundos y crea un único mercado por ID/canal. La extensión también detecta la predicción mientras el canal está abierto.
- El servidor verifica las predicciones recibidas contra Twitch. Los puntos de Twitch son datos de referencia: el pozo interno empieza en cero y solo aumenta con apuestas internas.
- Las apuestas aceptan puntos enteros dentro del saldo disponible. Se cierran al vencer el plazo o cuando Twitch informa LOCKED. Si la confirmación de Twitch tiene más de 30 segundos, se bloquean nuevas apuestas hasta actualizarla.
- El servidor sigue el ID original incluso después de que desaparezca de la lista activa. El resultado RESOLVED reparte el pozo proporcionalmente entre los ganadores, sin comisión. Los redondeos conservan cada punto. CANCELED o un ganador sin apuestas generan reembolsos.
- El consumidor cobra desde la extensión o el panel. Débito y cobro usan identificadores persistentes de operación para evitar duplicados en reintentos. No hay resolución manual de mercados reales; el panel solo permite simular el resultado de los ejemplos.
- `data/points.json` guarda cuentas, mercados, apuestas, recibos y movimientos mediante una cola única y reemplazo atómico del archivo. Los tokens se almacenan como hash en el servidor. Hay un solo proceso escritor: no es una base de datos distribuida.

## Pruebas

```sh
npm run check
npm run test:e2e
```

Las E2E arrancan su propio servidor mediante Portless (`twitch-points-test.localhost:1356`), datos temporales y una fuente Twitch controlada mediante un preload exclusivo de pruebas. Cubren dos consumidores, apuestas, resultados, cobro, reembolso, persistencia en el navegador, extensión MV3 y el ancho del popup nativo con la ventana de Chrome sin cambios. Las pruebas unitarias cubren además concurrencia, conservación de puntos, fallos de escritura y restauración del servidor.

La suite antigua de Solana es optativa: `MARKET_MODE=solana` tanto en el servidor como en las E2E, con sus dependencias operativas. Ver SOLANA_LEGACY.md. No se ejecuta en la fase offchain.

## Alcance

POC anónima para un único servidor local. Se pueden crear varias cuentas al borrar datos o cambiar de perfil; no hay protección contra cuentas múltiples, login de producción ni dinero real. El operador local configura canales y ejemplos desde el panel. La integración GraphQL de Twitch es interna y puede cambiar; los errores de fuente se muestran en la UI y nunca se inventa un ganador.

## UI

Los controles compartidos de apuesta usan Button, Input y Badge de shadcn/ui, con React 18, Tailwind y esbuild. Las fuentes son locales y el popup nativo mide 700px. El panel tiene vistas separadas para mercados, apuestas personales y operación de canales. Taste Skill está instalado en `.agents/skills/taste-skill`; la dirección, auditoría visual y límite de acceso a Taste Labs se documentan en DESIGN.md.
