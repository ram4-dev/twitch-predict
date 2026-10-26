# Búsqueda en el filtro de mercados

Base: fix/search-close-overlap, 7cc85f6, sin cambios pendientes. Worktrunk creó fix/search-replaces-channel-filter en /Users/ramiro/.t3/projects/twitch-predict.fix-search-replaces-channel-filter. El checkout anterior se conserva.

La barra expandible reemplaza el selector Todos los canales en la cabecera Mercados. Se abre hacia la izquierda, junto al botón de actualizar, y filtra los mercados cargados por nombre parcial de canal, @usuario o enlace Twitch. Cerrar con X o Escape elimina el filtro. Los enlaces iniciales con un canal mantienen el texto visible al abrir la página.

El formulario Seguir canal recupera su campo normal y conserva la acción de seguimiento. Filtrar no ejecuta esa acción, no llama a endpoints de escritura y no requiere conectar una wallet. Seguir un canal tampoco cambia el filtro activo.

El componente incorpora defaultValue y onClear para representar y quitar el filtro. Se conserva la separación física entre texto y botón de cierre. La cabecera mantiene los controles alineados a la derecha en pantallas chicas.

Validación: npm run check aprobado (typecheck, lint, 51 pruebas locales y build); tres E2E del buscador comprueban ausencia del selector anterior, filtrado de dos canales, búsqueda parcial y por enlace, cero POST al filtrar, restauración de todos los mercados y uso independiente mientras hay un seguimiento pendiente. La demo sigue verificando ambas direcciones, foco, CSP y tamaños 320/768/1440.

La réplica Byte/MV3 también pasó por separado. Publicado en https://plot-devnet.vercel.app y verificado con los tres E2E contra ese origen HTTPS. Evidencia en artifacts/channel-filter, fuera de Git.
