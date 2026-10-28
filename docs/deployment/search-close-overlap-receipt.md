# Corrección del botón de cierre del buscador

Base: feat/expandable-twitch-search, f254d48, sin cambios pendientes. Worktrunk creó fix/search-close-overlap en /Users/ramiro/.t3/projects/twitch-predict.fix-search-close-overlap. El checkout de origen se conserva.

El padding de Tailwind del input quedaba por debajo de las reglas globales sin capa del formulario legacy. El botón absoluto de 44 px podía cubrir el inicio del texto. El formulario ahora reserva esos 44 px fuera del input, del lado correspondiente a la dirección de expansión. El padding del texto se define en el selector aislado del componente; se retiraron las utilidades que daban una garantía falsa.

El E2E comprueba que los rectángulos del input y del cierre no se cruzan, y que el texto conserva un espacio adicional de al menos 8 px. Se verifica para ambas direcciones a 320, 768 y 1440 px, además de los escenarios existentes de Enter, Escape y consultas pendientes. No cambia el backend, las wallets ni las descargas.

La prueba con animación activa encontró además el scroll automático del formulario al enfocar el input mientras la barra todavía era angosta. Se usa overflow:clip y focus({preventScroll:true}) para que ese desplazamiento no vuelva a poner el texto debajo del botón. Se conservaron los fallos previos y las nuevas aserciones se ejecutaron en la página Byte con sus estilos globales, además del catálogo con reduced motion. npm run check y los tres E2E locales quedaron aprobados.

Publicación verificada en https://plot-devnet.vercel.app: los tres E2E también pasaron contra el origen HTTPS público. Se conserva el worktree para revisión; el cambio se entrega en fix/search-close-overlap.
