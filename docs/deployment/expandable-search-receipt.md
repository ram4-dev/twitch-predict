# Buscador expandible de Twitch

Base: feat/cloud-deploy, f9aafc1. Worktrunk creó feat/expandable-twitch-search en /Users/ramiro/.t3/projects/twitch-predict.feat-expandable-twitch-search. El checkout de origen se conserva sin cambios.

El proyecto ya usa React 18, TypeScript, Tailwind v4 y componentes adaptados de shadcn en src/ui/components. Los estilos compartidos están en src/ui/theme.css y se compilan a public/points-ui.css; public/byte.css contiene las reglas de la web de mercados.

El componente solicitado se agregó a components/ui/expandable-search-bar.tsx. components.json fija ese directorio como destino del registry de shadcn y configura aliases @/components/ui y @/lib/utils. Mantener este destino evita que futuras instalaciones del CLI creen componentes en otro directorio o reescriban los existentes. lib/utils.ts reutiliza el mismo cn de Plot. No hace falta ejecutar shadcn init ni reinstalar Tailwind o TypeScript.

Dependencias: lucide-react ya estaba instalado; se agregó framer-motion. El buscador no requiere imágenes ni proveedores adicionales. Se conservan los assets de marca de Plot.

Se reemplazó el campo fijo de canal en la web Byte por la barra expandible. La consulta admite un nombre, @usuario o un enlace canónico de Twitch y conserva el seguimiento y filtro de mercados existentes. Los permisos del backend no cambian. El catálogo incluye una demo para ambas direcciones.

Se eliminaron los efectos duplicados del ejemplo y el Enter global que podía enviar dos veces. Escape cierra y devuelve foco; un click fuera solo cierra una consulta vacía. El campo conserva una consulta no vacía. Los botones tienen un área de 44 px, el ancho se limita al viewport y la animación respeta reduced motion. Los estilos están aislados de los controles legacy y se conservan los colores y fuentes de Plot.

Validación: typecheck, lint, unitarias, build y E2E de interacción y dimensiones. Evidencia y revisión visual se registran al finalizar. El componente es React DOM para la web; la app Expo nativa conserva su buscador nativo.

Resultado: npm run check aprobado (typecheck, lint, 51 pruebas locales y build). Suite E2E: 36 aprobadas y seis omitidas de otros modos/cloud; la réplica Byte/MV3 se verificó por separado. Los escenarios nuevos cubren Enter único, consulta vacía, Escape/foco, click fuera, enlace Twitch válido e inválido, ambas direcciones, CSP y reduced motion a 320, 768 y 1440 px. La revisión visual conserva la cápsula negra y los tokens de Plot. Se ocultó el control de borrado nativo del input search para evitar una segunda X.

Se conservaron los permisos y el backend existentes. La actualización es estática en Vercel; las descargas del APK se preservan con SHA-256 5e7ad497330f8a522e1148a9ed9f8a4af53110753cde49297c0cb4163da3bcb8. El checkout queda separado y se conserva para revisión.

Referencia de animación y accesibilidad: https://motion.dev/docs/react-animate-presence y https://motion.dev/docs/react-use-reduced-motion.

Se preservó el primer fallo de la prueba MV3: el selector genérico getByLabel encontraba tanto el landmark de búsqueda como el input. Se corrigió para seleccionar el rol searchbox, sin modificar las aserciones de réplica o resolución. También se conservan los intentos de publicación que Vercel rechazó con fetch failed.

La prueba pública detectó que deshabilitar todo el control durante el refresh impedía usar Escape. Se separó loading de disabled: la consulta pendiente solo bloquea el envío, muestra progreso y permite cerrar o editar. Un tercer E2E mantiene la respuesta pendiente y comprueba ese comportamiento y la ausencia de envíos duplicados. El indicador de carga también respeta reduced motion.

Publicado en https://plot-devnet.vercel.app y demo en https://plot-devnet.vercel.app/components.html. Tres E2E del buscador aprobados también contra ese origen HTTPS público, con respuestas de escritura controladas para no modificar mercados reales. La verificación pública de consultas inválidas espera el estado idle entre consultas; el caso de respuesta pendiente se verifica por separado. Typecheck y lint finales aprobados. Los logs y capturas se conservaron en artifacts/search, fuera de Git.
