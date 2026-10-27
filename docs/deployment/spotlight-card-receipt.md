# Tarjetas Spotlight

Worktree de origen: /Users/ramiro/.t3/projects/twitch-predict.chore-extension-update-011, rama chore/extension-update-011, commit b0d9ba8, limpio. Worktrunk creó feat/spotlight-bet-cards desde esa rama en /Users/ramiro/.t3/projects/twitch-predict.feat-spotlight-bet-cards. Ambos checkouts se conservan.

Referencia solicitada: https://21st.dev/@jahed/components/spotlight-card, de Hossain Jahed / EaseMize. Se inspeccionaron la ficha y la demo pública, incluida su superficie translúcida, halo de color y borde con punto de luz blanco. El código completo requiere cuenta; esta implementación es una adaptación propia del comportamiento público, sin copiar código restringido.

Componente React en components/ui/spotlight-card.tsx, con altura automática y color configurable como canales RGB. El panel Byte utiliza GlowCard. Las tarjetas imperativas de la extensión y del modo puntos reciben el mismo material mediante el adaptador existente. El efecto usa eventos de puntero locales, propiedades CSS y pseudoelementos sin capturar clics ni crear bucles de animación. La preferencia de movimiento reducido desactiva el seguimiento. El foco de teclado conserva un borde visible y los punteros táctiles no activan el halo.

Se conserva la dirección true-black-flat, semilla 554067584, con Fraunces, Inter y el naranja de Plot. No se rediseñó la estructura de mercados. Los gradientes y el blur son excepciones explícitas por la tarjeta elegida; los botones metálicos y sus bordes ya pertenecían a la selección anterior del usuario. El inspector se ejecutó con allow gradient,button-fx,heavy-borders por esos motivos. Resultado final: cero FAIL y cero WARN; el primer informe se conserva como evidencia. Revisadas capturas a 320, 768 y 1440 px.

Validación local: npm run check aprobado (typecheck, lint, 51 pruebas locales y build). E2E completo: 38 aprobados, 6 omitidos por modos y cloud opt-in. Ejecución separada Byte/MV3 y búsqueda: 5 aprobados. Incluye foco, movimiento reducido, controles de reglas, importe conservado y ausencia de overflow. La réplica sigue creando un solo mercado y sigue su resolución. Fixtures controladas; no se envió una apuesta real durante esta validación.

Evidencia ignorada en artifacts/spotlight; logs en /tmp/plot-spotlight-*.log. El ZIP se versiona 0.11.1 y conserva el ID de extensión. El APK se mantiene sin cambios.

Publicación: los dos primeros intentos de Vercel fallaron con fetch failed; el envío comprimido con --archive=tgz terminó correctamente. Deployment plot-devnet-hy9qv2if6-ramirocshubs-projects.vercel.app, alias https://plot-devnet.vercel.app. E2E Spotlight aprobado también sobre HTTPS público con mercado interceptado en el navegador, sin escribir datos reales. ZIP público 0.11.1 verificado con CSS nuevo; SHA-256 a05790bf13120b2311f0332a0df4b8035322ee3ac4d69c833c6dbcc52f182255.

Instalación personal: respaldada la versión anterior bajo /Users/ramiro/Applications/Plot/backups y actualizada /Users/ramiro/Applications/Plot/extension. Chrome muestra 0.11.1 y Recargada. Inspeccionado el popup con los mercados existentes de dragneel_fh: superficie y halo visibles, saldo e historial presentes. Sin firmar ni enviar transacciones. La rama quedó pusheada y el checkout se conserva.
