# Selección de Dia para plot

Se leyeron las pestañas de Dia desde su interfaz: Icey Night Shards, Shader Loader, Swirl, Simplex, Halftone Wordmark Footer, Bird Murmuration Text Animation, Herbarium — ASCII Art Effect, Liquid Metal Button y Spotlight Card. Se contrastaron sus fichas públicas de 21st.dev y la documentación del autor.

## Aplicado

- Liquid Metal Button de johuniq: adaptación del registro público `https://www.jolyui.dev/r/liquid-metal-button`, con licencia MIT. Se conservó el material y la configuración de reflejos, adaptando la integración al Button local, la API actual de Paper Shaders y la CSP. El texto, foco, accesibilidad y estados deshabilitado/carga siguen perteneciendo al botón nativo. El shader se monta al enfocar o pasar el puntero y se libera al salir. Sin WebGL o con movimiento reducido, conserva un borde metálico estático.
- Spotlight Card de Hossain Jahed: implementación local del comportamiento documentado, con dos variables de posición para la luz. Se aplica a las tarjetas compartidas de apuestas. No se copió código que requiera una vista de cuenta.
- Simplex / Swirl: shader de dithering real de `@paper-design/shaders`, formas simplex y swirl, en la paleta de plot. En la vista Selección de Dia se alternan ambos y se puede pausar el fondo. No se simula WebGL con una imagen.
- Halftone Wordmark Footer / Bird Murmuration: tratamiento local de puntos que se apartan del puntero y pueden dispersarse para volver a formar el nombre. Fraunces y la O con desenlace abierto se mantienen. No es una importación del sistema de bandadas del autor.

Icey Night Shards, Shader Loader y Herbarium quedan como referencias leídas, sin afirmar que se hayan incorporado sus componentes completos. No se acumularon todos sus efectos de fondo sobre el mismo mercado.

## Dónde revisar

`/components.html#dia` abre la nueva sección del catálogo. Los botones principales ya usan el material en el panel, onboarding y extensión; las tarjetas compartidas usan el spotlight. El catálogo anterior y los estudios de acetato, goma y collage siguen disponibles.

Código principal: `src/ui/components/materials.tsx`, `button.tsx`, `src/ui/catalog.tsx` y `src/ui/points-ui.tsx`. Dependencia añadida: `@paper-design/shaders` 0.0.82, Apache-2.0. El build conserva LICENSE y NOTICE de Paper Shaders y la atribución de Joly UI en los assets públicos y de la extensión.

La selección de Dia guía esta iteración. Reemplaza la recomendación anterior de referencias genéricas y las restricciones visuales previas sobre gradientes, luces o transparencias, por instrucción explícita del usuario.

## Fuentes

- https://21st.dev/@johuniq/components/liquid-metal-button
- https://www.jolyui.dev/docs/components/buttons/liquid-metal-button
- https://21st.dev/@jahed/components/spotlight-card
- https://21st.dev/@designali-in/components/simplex
- https://21st.dev/@designali-in/components/swirl
- https://21st.dev/@kedhareswer/components/halftone-wordmark-footer
- https://21st.dev/@kedhareswer/components/murmuration-wordmark
- https://21st.dev/@audriusnek/components/icey-night-shards
- https://21st.dev/@asanshay/components/loader
- https://21st.dev/community/ascii/botanica-713df613-b2f0-4e80-baba-3f6303be09f1

## Validación

- `npm run check`: typecheck, ESLint, 22 pruebas y build pasan.
- E2E completos en proxy Portless aislado 1364: 11 casos pasan, 4 del modo Solana optativo omitidos. El caso restante del popup falló por falta de ventana activa; se corrigió la prueba para seleccionar y activar su propia ventana con la API de Chrome. La repetición de ese caso pasa y confirma 700 px sin redimensionar la ventana. En total se verificaron los 12 casos del modo de puntos; no se presenta la primera ejecución fallida como aprobada.
- Caso nuevo: dither real en canvas, metal al enfocar, liberación al desenfocar, elección por Enter, pausa, cambio Simplex/Swirl, dispersión y movimiento reducido. Sin desbordamiento en 320, 728 y 1440.
- Inspector de la vista en 1440, 768 y 390: 0 FAIL; 1 WARN por proporción de color (14%). El fondo expresivo es parte del pedido. Se permiten `palette-cream`, `gradient` y `button-fx` por la marca y las referencias seleccionadas explícitamente; no se silencian errores de geometría o lectura.
- Se revisaron las capturas de móvil/escritorio: datos y acciones legibles, contenido refluye; el dither sigue siendo denso a propósito. El camaleón conserva su ilustración original.
- ESLint de pruebas modificadas y `git diff --check`: pasan.

Worktree conservado en `feat/plot-design-system`, base `ebe56e1`, sin merge. El servidor de revisión continúa en `http://twitch-predict.localhost:1360/components.html#dia`. Los procesos E2E aislados se cerraron al terminar.

## Corrección de forma de los botones

Por indicación posterior del usuario, todas las variantes comparten la misma cápsula (`--radius-control: 999px`) en reposo, foco y pulsación. Se eliminaron los radios elípticos asimétricos y las rotaciones del botón principal. Solo hay una compresión leve durante hover con puntero fino; al salir vuelve a su forma uniforme. En pantallas táctiles no se activa esa deformación y con movimiento reducido se conserva la forma estática. El material metálico no cambia la silueta.

La prueba E2E compara las seis variantes: mismo radio, altura estándar de 44 px y ausencia de transformación en reposo/foco; verifica hover temporal y movimiento reducido. `npm run check` pasa con 22 pruebas y build regenerado para web y extensión.

Validación de la corrección: 8 E2E relevantes pasan (catálogo, geometría y hover, shader, apuestas web y extensión, cobros y persistencia).

Corrección posterior de alineación: se quitaron las rotaciones de la tarjeta y del globo del camaleón, se regularizaron sus radios y se retiró el desplazamiento negativo de la mascota. Los estudios previos también muestran botones, tarjetas y etiquetas sin inclinación. `npm run check` pasa; 2 E2E de la vista y los botones pasan, y una comprobación en navegador confirma que las tres exploraciones no tienen transformaciones en reposo en esos elementos.

## Variante coral y lavanda

Se elimina el acento lima por pedido del usuario. Variante de trabajo: coral `#ff7049` para datos y acciones, lavanda `#cbb6e8` como acompañamiento, tinta `#232039` y papel `#fff4dd`. Los mensajes de éxito usan ciruela sobre rosa suave; no conservan el verde anterior. La paleta del catálogo y los estudios previos también se actualizan.

Se mantiene la geometría de botones y la alineación recta. Verificado: `npm run check` (22 pruebas y build), 2 E2E de la vista y botones, colores computados del acento y el globo, y ausencia de los valores lima en las fuentes, el build web, la extensión y los estudios.

## Showcase negro y animación compartida

Pedido posterior: mejorar la calidad de la animación de plot, llevar el showcase mayormente a negro, eliminar el sticker y los textos pequeños redundantes, y extender el tratamiento a todo el catálogo.

- Las cinco familias comparten fondo negro/grafito, dither gris, wordmark animado, metal y spotlight. La paleta oscura está acotada a la página del showcase; no cambia a oscuro el panel de cuentas por accidente.
- Se retiraron del DOM el sticker y las frases del camaleón, las atribuciones técnicas en tarjetas, el pie redundante, las descripciones docentes bajo títulos y la ayuda opcional del formulario. Se conservan etiquetas de campos, cantidades, estados, errores y nombres de acciones.
- El wordmark es único y permanece al cambiar de pestaña. Canvas ajustado a DPR hasta 2, muestreo más denso, composición centrada y punto naranja del desenlace abierto. Movimiento con integración temporal de resortes amortiguados, repulsión al puntero y un control para repetir el armado.
- Cuando las partículas se estabilizan deja de pedir cuadros. También pausa fuera del área visible o con la pestaña oculta. Movimiento reducido dibuja una versión estática. ResizeObserver vuelve a componer según el tamaño real del elemento, sin realimentar la altura del canvas.
- Los botones siguen siendo cápsulas iguales, sin inclinaciones y con suavidad solo en hover. El naranja se limita a la mascota y el punto de marca; no hay sticker lavanda ni acento lima.

Validación del cambio: 6 E2E del catálogo pasan, incluida resolución 2x, animación que se arma y se estabiliza, repetición, las cinco familias en negro, ausencia del sticker, viewport de 320 a 1440 y movimiento reducido. `npm run check` incluye 22 pruebas, typecheck, lint y build. Se revisaron capturas de las cinco vistas, con una corrección adicional del contraste del botón destructivo y los mensajes.

Inspector final del showcase en 1440/768/390: 0 FAIL, dos advertencias por altura desigual de especímenes independientes y espacio en el espécimen de selección. Se conservan alturas naturales y la ilustración como contenido, sin reintroducir los textos que el usuario pidió sacar. Se verificaron las cinco capturas de la composición oscura. Se afinó además el centrado vertical del wordmark con las métricas reales de Fraunces para evitar cortes en ascendentes y descendentes.

Revisión de contraste final: texto claro en los CTA de mercado del showcase, badge primario legible y superficie interior del botón de cobro coherente con su acento. Verificación en navegador del color computado de los CTA y nuevas capturas de Mercados/Estados. El build final y `git diff --check` pasan.

## Hover naranja siguiendo el mouse

Se corrigió el registro del seguimiento: la clase visual `plot-spotlight` ya estaba presente en las tarjetas JSX y el guard anterior impedía agregar los listeners. Ahora un WeakSet independiente evita registros duplicados sin confundir estilo con inicialización. `pointerenter` y `pointermove` actualizan las coordenadas relativas a la tarjeta, incluso al pasar sobre sus controles. El hover se limita a punteros finos y desaparece al salir; el foco visible por teclado conserva su alternativa accesible.

Validado con `npm run check` (22 pruebas y build), 3 E2E relevantes y una captura del brillo desplazado sobre la tarjeta. El E2E mueve el mouse a dos posiciones y comprueba coordenadas, aparición y desaparición en una tarjeta del catálogo y en el mercado contextual.

## Transparencia del mercado

Se bajó el fondo de la tarjeta contextual y del espécimen de mercado a negro al 35%, con blur de 3 px. La tarjeta interna de apuestas es transparente y las opciones usan un fondo al 32%; así el brillo naranja y el fondo animado atraviesan la composición. El texto y los controles mantienen opacidad completa.

Verificado visualmente y con estilos computados, `npm run check` (22 pruebas y build), 2 E2E de interacción/hover y `git diff --check`. El seguimiento del mouse ahora también se comprueba dentro del espécimen completo de mercado.

## Resultados en verde y rojo

Los botones de apostar del primer resultado usan borde metálico animado verde esmeralda `#42c98a`; los del segundo, rojo `#ff646f`. El centro permanece negro y las etiquetas claras. Los mismos colores identifican sus segmentos del pozo, incluidos el mercado contextual y el componente real compartido por web/extensión. Las formas y proporciones se conservan. Movimiento reducido deja el borde estático.

El color se pasa explícitamente como `tone` al botón y al shader, sin modificar el resto de botones ni la paleta general de marca. Verde de resultado no reintroduce el acento lima descartado.

Validación: `npm run check` (22 pruebas, typecheck, lint, build); 11 E2E de catálogo, colores y bordes, reducción de movimiento, apuestas web/extension, liquidación y persistencia; revisión de captura y `git diff --check`. Se cerró el entorno temporal E2E al terminar.
