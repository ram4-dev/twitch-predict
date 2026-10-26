# Materiales y movimiento para plot

2026-10-25. Pedido: buscar referencias en 21st.dev para una UI menos limpia, más animada, transparente y amorfa. Se conserva Fraunces, desenlace abierto y camaleón. Esta indicación sustituye la preferencia visual previa por superficies opacas y controles sobrios.

## Referencias verificadas

- [Liquid Glass Button, Ali Imam](https://21st.dev/@designali-in/components/liquid-glass-button): referencia de material transparente para botones. La página pública incluye uso; el código completo requiere cuenta. No se copió ni se instaló código de acceso restringido.
- [Magnetic Button, Mohammad Shehadeh](https://21st.dev/@mohammadshehadeh/components/magnetic-button): atracción al cursor y retorno elástico. Para plot interesa la respuesta elástica; el estudio propio usa deformación y rebote CSS, sin seguimiento magnético del cursor.
- [Gooey Loader, Klyv-UI](https://21st.dev/@klyv-ui/components/gooey-loader): masas que orbitan y se fusionan. Referencia de comportamiento blando para carga y selección. El estudio no replica su filtro metaball.
- [Liquid Morph Floating Menu, AAYUSH duhan](https://21st.dev/@aayush-duhan/components/liquid-morph-floating-menu): expansión orgánica entre estados. Referencia para controles y bandejas; no se importó el menú.
- [Glass Card, Edu Calvo / SmoothUI](https://mcp.21st.dev/@educalvolpz/components/glass-card): panel con transparencia, borde refractivo y reflejo que sigue al puntero. En el estudio se interpreta como acetato entintado con blur; no se afirma implementar refracción física.

## Tres estudios propios

- Acetato travieso: transparencia teñida, doble contorno irregular, tarjetas ligeramente torcidas y botones que se deforman.
- Goma líquida: piezas blandas, sombra corta como volumen, compresión al pulsar y composición con mascota sobre el borde.
- Collage vivo: recortes, grano, cinta translúcida y formas rotadas. La versión más desprolija del grupo.

Recomendación: material de Acetato travieso más grano y recortes puntuales de Collage vivo. Mantener importes y etiquetas quietos, deformar las superficies y las ilustraciones. El camaleón cambia de observador a sorprendido al elegir una opción.

## Artefactos y validación

Ruta: `/explorations/21st-concepts.html`. Archivos adyacentes CSS, JS y textura SVG locales; compatibles con la CSP del servidor actual. La UI existente no fue reemplazada.

Tres conceptos probados en 320 y 728 px: selector de variante, opacidad por teclado, opciones, seguir, carga, pausa de movimiento y ausencia de desbordamiento o errores de página. ESLint del JS y `git diff --check` pasan. Previsualización inline adicional en 320/728 con Fraunces cargada y los tres conceptos operables. Las selecciones del comparador son locales y no confirman una elección de marca al agente.

No se añadieron dependencias. Son interacciones de prueba, sin llamadas al backend, firma ni operaciones con saldo.
