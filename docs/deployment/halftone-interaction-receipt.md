# Interacción halftone de Plot

Origen origin/main ab12ab0. Rama feat-plot-halftone-interaction, worktree /Users/ramiro/.t3/projects/twitch-predict.feat-plot-halftone-interaction, conservado para revisión.

Se adapta el componente proporcionado a components/ui/halftone-wordmark-footer.tsx. El footer y el canvas compacto comparten cobertura por celda, resortes, transición al naranja y onda de clic. El wordmark conserva Fraunces, la o cerrada, Plot! y el armado inicial. El motor se detiene al asentarse y al ocultarse, y desactiva el movimiento con reduced motion o pausa. Se incluye una demo reutilizable; no se añaden dependencias ni imágenes.

La estructura shadcn y Tailwind ya existía. Los estilos del footer están en src/ui/app-materials.css, dentro de las clases hwf, y el componente compacto usa las clases de la aplicación. La extensión pasa a 0.15.0.

Verificación: npm run check (58 aprobadas, 7 pruebas SQL omitidas al no requerir cambios de backend); pruebas puras de cobertura y convergencia; 9 E2E visuales, incluida verificación de píxeles al pasar el cursor, onda de clic, reposo y movimiento reducido; E2E adicional de búsqueda y réplica dentro de MV3. Se revisó la captura del wordmark asentado.
