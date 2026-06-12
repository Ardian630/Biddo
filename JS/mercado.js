import { supabase } from './supabaseClient.js';

const PLACEHOLDER_IMG = '../assets/img/img1.jpeg';
const PLACEHOLDER_AVATAR = '../assets/img/user1.jpeg';

document.addEventListener('DOMContentLoaded', async () => {
    const marketContent = document.getElementById('market-content');
    const searchInput = document.getElementById('search-productos');

    let productosGlobal = [];

    await cargarProductos();

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const termino = searchInput.value.trim().toLowerCase();
            if (!termino) {
                renderizarMercado(productosGlobal);
                return;
            }
            const filtrados = productosGlobal.filter((p) =>
                p.nombre_producto.toLowerCase().includes(termino) ||
                p.descripcion.toLowerCase().includes(termino) ||
                (p.categorias?.nombre_categoria || '').toLowerCase().includes(termino) ||
                (p.autenticacion?.nombre_usuario || '').toLowerCase().includes(termino)
            );
            renderizarMercado(filtrados);
        });
    }

    async function cargarProductos() {
        marketContent.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">Cargando productos...</p>';

        const { data: productos, error } = await supabase
            .from('productos')
            .select(`
                producto_id,
                nombre_producto,
                descripcion,
                precio_bdc,
                fecha_publicacion,
                categoria_id,
                vendedor_id,
                categorias ( categoria_id, nombre_categoria ),
                autenticacion (
                    nombre_usuario,
                    usuarios_perfil ( url_imagen_vendedor )
                )
            `)
            .eq('activo', true)
            .order('fecha_publicacion', { ascending: false });

        if (error) {
            console.error('Error al cargar productos:', error.message);
            marketContent.innerHTML = '<p style="text-align:center;color:#f87171;padding:40px;">No se pudieron cargar los productos.</p>';
            return;
        }

        productosGlobal = productos || [];
        renderizarMercado(productosGlobal);
    }

    function renderizarMercado(productos) {
        marketContent.innerHTML = '';

        if (!productos.length) {
            marketContent.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">No hay productos disponibles en este momento.</p>';
            return;
        }

        const porCategoria = agruparPorCategoria(productos);
        const nombresCategoria = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b, 'es'));

        nombresCategoria.forEach((nombreCategoria) => {
            const section = document.createElement('section');
            section.className = 'category-section';

            const titulo = document.createElement('h2');
            titulo.className = 'category-title';
            titulo.textContent = nombreCategoria;

            const sliderWrapper = document.createElement('div');
            sliderWrapper.className = 'slider-wrapper';

            const btnPrev = document.createElement('button');
            btnPrev.className = 'nav-prev';
            btnPrev.type = 'button';
            btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
            btnPrev.addEventListener('click', () => moveSlider(sliderWrapper, -1));

            const btnNext = document.createElement('button');
            btnNext.className = 'nav-next';
            btnNext.type = 'button';
            btnNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
            btnNext.addEventListener('click', () => moveSlider(sliderWrapper, 1));

            const slider = document.createElement('div');
            slider.className = 'product-slider';

            porCategoria[nombreCategoria].forEach((producto) => {
                slider.appendChild(crearTarjetaProducto(producto));
            });

            sliderWrapper.appendChild(btnPrev);
            sliderWrapper.appendChild(btnNext);
            sliderWrapper.appendChild(slider);

            section.appendChild(titulo);
            section.appendChild(sliderWrapper);
            marketContent.appendChild(section);
        });
    }

    function agruparPorCategoria(productos) {
        return productos.reduce((acc, producto) => {
            const nombre = producto.categorias?.nombre_categoria || 'Sin categoría';
            if (!acc[nombre]) acc[nombre] = [];
            acc[nombre].push(producto);
            return acc;
        }, {});
    }

    function crearTarjetaProducto(producto) {
        const vendedor = producto.autenticacion?.nombre_usuario || 'Vendedor';
        const perfil = producto.autenticacion?.usuarios_perfil;
        const avatar = (Array.isArray(perfil) ? perfil[0]?.url_imagen_vendedor : perfil?.url_imagen_vendedor) || PLACEHOLDER_AVATAR;
        const precio = parseFloat(producto.precio_bdc).toFixed(2);

        const card = document.createElement('article');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="image-container">
                <img src="${PLACEHOLDER_IMG}" alt="${escapeHtml(producto.nombre_producto)}" class="product-img">
                <button class="save-btn" type="button" aria-label="Guardar"><i class="fa-regular fa-heart"></i></button>
            </div>
            <div class="product-details">
                <div class="seller-info">
                    <div class="seller-avatar">
                        <img src="${avatar}" alt="Vendedor">
                    </div>
                    <span class="seller-name">${escapeHtml(vendedor)}</span>
                </div>
                <h3 class="product-title">${escapeHtml(producto.nombre_producto)}</h3>
                <div class="price-action">
                    <div class="price-tag">${precio} <span>BDC</span></div>
                    <button class="detail-btn" type="button" data-producto-id="${producto.producto_id}">Ver detalle</button>
                </div>
            </div>
        `;

        const btnDetalle = card.querySelector('.detail-btn');
        btnDetalle.addEventListener('click', () => mostrarDetalle(producto));

        return card;
    }

    function mostrarDetalle(producto) {
        const vendedor = producto.autenticacion?.nombre_usuario || 'Vendedor';
        const categoria = producto.categorias?.nombre_categoria || 'Sin categoría';
        const precio = parseFloat(producto.precio_bdc).toFixed(2);
        const fecha = new Date(producto.fecha_publicacion).toLocaleDateString('es-VE');

        alert(
            `${producto.nombre_producto}\n\n` +
            `Categoría: ${categoria}\n` +
            `Precio: ${precio} BDC\n` +
            `Vendedor: ${vendedor}\n` +
            `Publicado: ${fecha}\n\n` +
            `${producto.descripcion}`
        );
    }

    function moveSlider(wrapper, direction) {
        const slider = wrapper.querySelector('.product-slider');
        slider.scrollBy({ left: direction * 330, behavior: 'smooth' });
    }

    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
});
