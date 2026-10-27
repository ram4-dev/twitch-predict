# PLOT! — exploración de marca

Nombre y frases exploratorios. No se verificó disponibilidad registral. Investigación del 25 de octubre de 2026. Las landing pages describen propuestas de producto; no demuestran tracción ni funcionalidades operativas.

## Referencias consultadas

- https://oddie.fun/ — mascota de fantasma, stickers, amarillo ácido y rosa. El HTML declara Anton, Nunito y Fredoka; el recurso público sticker-hero.webp se inspeccionó visualmente. Entrada desde chat y participación del creador en el pool. Tomamos la coherencia entre personaje y voz, sin reutilizar personaje, fuente ni paleta.
- https://fud.markets/markets — mascota humana dibujada, azul eléctrico y blanco. El CSS público usa DM Sans y JetBrains Mono e incluye fud-mascot-arrive; se inspeccionó visualmente fud-mascot-flying.png. Tomamos las poses como parte del sistema de comunicación, sin reutilizar el personaje ni la identidad.
- https://www.anchorpicks.com/ — mercados centrados en creadores, gaming, fitness, música y arte. La propia página identifica ejemplos y cifras como ilustrativos; no se toman como métricas operativas. Muestra que el posicionamiento creator-first ya existe.
- https://docs.mentioned.market/ — mercados ligados a palabras en medios y eventos en vivo, selección Sí/No, chat y logros. Referencia de especificidad contextual, no recomendación de copiar sus mecanismos de incentivo.
- https://phantom.com/prediction-markets — descubrimiento, conversación y posiciones dentro de una experiencia conocida. Referencia secundaria de integración contextual.

## Diferenciación propuesta

La unidad de producto es un momento identificable del streamer: un intento, una partida o un reto. Una pregunta protagonista por momento, dos lecturas con lenguaje del canal, cierre anterior al intento y resolución con evidencia. La voz puede variar por creador sin cambiar el significado de Sí y No.

La identidad visual gira alrededor de un personaje original hecho de un ticket plegado: el recibo de una lectura del espectador. La pose cambia al elegir un lado y al resolverse el momento. El recibo conserva pregunta, intento, lado y referencia al VOD. No se proponen animaciones de monedas, depósitos, rachas o urgencia artificial.

Sticker club usa crema y naranja, tipografía de póster y stickers. After hours usa tinta oscura, lavanda y un recibo con animación de impresión. Split chat convierte las dos lecturas en mitades con personalidades diferentes. Las diferencias afectan a composición e interacción, no solo a color.

El encuadre legal de mercados manipulables sigue pendiente; estas pantallas no certifican que puedan ofrecerse en EE. UU. ni que sean aprobables como Twitch Extension. La mascota tiene humor adulto de cómic, sin personajes existentes ni promesas de ganancia.

## Mascota original

Generada con la herramienta integrada image_gen, fondo transparente. Archivo: plot-mascot-poses.png. El prompt conserva el nombre interno inicial de la idea; la marca de la propuesta final es PLOT!.

Prompt empleado:

Use case: logo-brand. Asset: an original mascot character pose strip for an adult live-stream prediction market brand exploration called JINX (do NOT draw any text). Create exactly THREE poses of the SAME original character arranged in three evenly sized columns on a wide 3:1 transparent canvas, full body visible each time and generous margin around each silhouette so it can be used as CSS sprites. The character is a mischievous FOLDED PAPER TICKET IMP: burnt tangerine orange body shaped like a bent zigzag ticket with notched edges, asymmetrical little horns made of folded corners, two large cream oval eyes with dark indigo pupils, thick dark indigo ink outlines, long rubber-hose arms, small chunky indigo shoes. Adult underground comics / skater sticker illustration with subtle risograph grain, bold flat colors, expressive human attitude, polished brand illustration. NOT a ghost, NOT a human mascot, NOT a round white blob, no sunglasses, no dollar symbols, no coins, no cash, no casino elements. Palette burnt orange #FF7049, dark indigo #232039, cream #FFF4DD, very small lime highlights #D4ED66. Left pose: skeptical raised eyebrow, arms crossed, slightly leaning back. Middle pose: confident, one hand pointing ahead at a next action, smug small smile. Right pose: delighted open arms raised, making a victorious stance. Keep the same character proportions and style across all three. Transparent background with no checkerboard drawn, no text, no letters, no panels, no surrounding symbols, no watermark.

## Prototipo y controles

Tres direcciones visuales, tres estados de mercado, selección de lado, importes de ejemplo y vista previa sin conexión a wallets. El botón Ver movimiento recorre una secuencia local de tres segundos. La preferencia de movimiento reducido desactiva las animaciones; no hay animación automática de bucle.

## Verificación realizada

Previews de las tres direcciones en escritorio a 728 px y del diseño principal a 320 y 360 px. Nueve combinaciones de dirección y estado verificadas en navegador sin desborde horizontal. Selección de lado, importe, comisión y pago condicional comprobados. Los callbacks de la secuencia de 600/1600/3000 ms verifican selección, cierre y recibo de resolución; se respetan preferencias de movimiento reducido. No hay backend ni suite de aplicación en esta entrega de diseño.
