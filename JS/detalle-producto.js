import { supabase } from './supabaseClient.js';

const PLACEHOLDER_IMG = '../assets/img/img1.jpeg';
const PLACEHOLDER_AVATAR = '../assets/img/user1.jpeg';

const SELECT_PRODUCTO = `
    producto_id,
    nombre_producto,
    descripcion,
    precio_bdc,
    fecha_publicacion,
    categoria_id,
    vendedor_id,
    url_imagen_producto,
    categorias ( categoria_id, nombre_categoria ),
    autenticacion (
        nombre_usuario,
        usuarios_perfil ( url_imagen_vendedor )
    )
`;

document.addEventListener('DOMContentLoaded', async () => {
    const detalleContent = document.getElementById('detalle-content');
    const params = new URLSearchParams(window.location.search);
    const productoId = parseInt(params.get('id'), 10);

    if (!productoId || isNaN(productoId)) {
        mostrarError('Producto no encontrado.');
        return;
    }

    const { data: producto, error } = await supabase
        .from('productos')
        .select(SELECT_PRODUCTO)
        .eq('producto_id', productoId)
        .eq('activo', true)
        .maybeSingle();

    if (error || !producto) {
        mostrarError('No se pudo cargar el producto o ya no está disponible.');
        return;
    }

    renderizarDetalle(producto);
    await cargarProductosRelacionados(producto);

    function renderizarDetalle(producto) {
        const vendedor = producto.autenticacion?.nombre_usuario || 'Vendedor';
        const perfil = producto.autenticacion?.usuarios_perfil;
        const avatar = (Array.isArray(perfil) ? perfil[0]?.url_imagen_vendedor : perfil?.url_imagen_vendedor) || PLACEHOLDER_AVATAR;
        const categoria = producto.categorias?.nombre_categoria || 'Sin categoría';
        const precio = parseFloat(producto.precio_bdc).toFixed(2);
        const fecha = new Date(producto.fecha_publicacion).toLocaleDateString('es-VE', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        const imgSrc = producto.url_imagen_producto || PLACEHOLDER_IMG;

        detalleContent.innerHTML = `
            <section class="product-detail-panel">
                <div class="product-detail-image">
                    <img src="${imgSrc}" alt="${escapeHtml(producto.nombre_producto)}" class="product-img">
                </div>
                <div class="product-detail-info">
                    <div class="seller-info">
                        <div class="seller-avatar">
                            <img src="${avatar}" alt="Vendedor">
                        </div>
                        <span class="seller-name">${escapeHtml(vendedor)}</span>
                    </div>
                    <div class="product-detail-meta">
                        <span><i class="fa-solid fa-layer-group"></i> ${escapeHtml(categoria)}</span>
                        <span><i class="fa-solid fa-calendar"></i> ${fecha}</span>
                    </div>
                    <h1 class="product-title">${escapeHtml(producto.nombre_producto)}</h1>
                    <p class="product-description">${escapeHtml(producto.descripcion)}</p>
                    <div class="product-detail-price">${precio} <span>BDC</span></div>
                </div>
            </section>
            <section class="category-section" id="related-section" style="display:none;">
                <h2 class="category-title" id="related-title"></h2>
                <div class="slider-wrapper" id="related-slider-wrapper">
                    <button class="nav-prev" type="button" id="related-prev"><i class="fa-solid fa-chevron-left"></i></button>
                    <button class="nav-next" type="button" id="related-next"><i class="fa-solid fa-chevron-right"></i></button>
                    <div class="product-slider" id="related-slider"></div>
                </div>
            </section>
        `;
    }

    async function cargarProductosRelacionados(producto) {
        const { data: relacionados, error } = await supabase
            .from('productos')
            .select(SELECT_PRODUCTO)
            .eq('categoria_id', producto.categoria_id)
            .eq('activo', true)
            .neq('producto_id', producto.producto_id)
            .order('fecha_publicacion', { ascending: false })
            .limit(12);

        if (error || !relacionados?.length) return;

        const section = document.getElementById('related-section');
        const title = document.getElementById('related-title');
        const slider = document.getElementById('related-slider');
        const wrapper = document.getElementById('related-slider-wrapper');

        const categoria = producto.categorias?.nombre_categoria || 'esta categoría';
        title.textContent = `Más productos de ${categoria}`;

        relacionados.forEach((p) => {
            slider.appendChild(crearTarjetaRelacionada(p));
        });

        document.getElementById('related-prev').addEventListener('click', () => moveSlider(wrapper, -1));
        document.getElementById('related-next').addEventListener('click', () => moveSlider(wrapper, 1));

        section.style.display = 'block';
    }

    function crearTarjetaRelacionada(producto) {
        const vendedor = producto.autenticacion?.nombre_usuario || 'Vendedor';
        const perfil = producto.autenticacion?.usuarios_perfil;
        const avatar = (Array.isArray(perfil) ? perfil[0]?.url_imagen_vendedor : perfil?.url_imagen_vendedor) || PLACEHOLDER_AVATAR;
        const precio = parseFloat(producto.precio_bdc).toFixed(2);
        const imgSrc = producto.url_imagen_producto || PLACEHOLDER_IMG;

        const card = document.createElement('article');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="image-container">
                <img src="${imgSrc}" alt="${escapeHtml(producto.nombre_producto)}" class="product-img">
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
                    <button class="detail-btn" type="button">Ver detalle</button>
                </div>
            </div>
        `;

        card.querySelector('.detail-btn').addEventListener('click', () => {
            window.location.href = `detalle-producto.html?id=${producto.producto_id}`;
        });

        return card;
    }

    function moveSlider(wrapper, direction) {
        const slider = wrapper.querySelector('.product-slider');
        slider.scrollBy({ left: direction * 330, behavior: 'smooth' });
    }

    function mostrarError(mensaje) {
        detalleContent.innerHTML = `<p style="text-align:center;color:#f87171;padding:40px;">${mensaje}</p>`;
    }

    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
});
