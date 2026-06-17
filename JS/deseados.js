import { supabase } from './supabaseClient.js';

const PLACEHOLDER_IMG = '../assets/img/img1.jpeg';
const PLACEHOLDER_AVATAR = '../assets/img/user1.jpeg';

document.addEventListener('DOMContentLoaded', async () => {
    const content = document.getElementById('wishlist-content');

    // 1. Verificar sesión
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        content.innerHTML = `
            <div class="empty-wishlist">
                <div class="empty-icon"><i class="fa-solid fa-lock"></i></div>
                <h2>Inicia sesión para ver tus deseados</h2>
                <p>Necesitas una cuenta para guardar y ver tus productos favoritos.</p>
                <a href="login.html" class="btn-ir-mercado">
                    <i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión
                </a>
            </div>
        `;
        return;
    }

    const userUUID = session.user.id;

    // 2. Cargar deseados del usuario
    const { data: deseados, error } = await supabase
        .from('deseados')
        .select(`
            deseado_id,
            producto_id,
            productos (
                producto_id,
                nombre_producto,
                descripcion,
                precio_bdc,
                activo,
                url_imagen_producto,
                autenticacion (
                    nombre_usuario,
                    usuarios_perfil ( url_imagen_vendedor )
                )
            )
        `)
        .eq('usuario_id', userUUID)
        .order('created_at', { ascending: false });

    if (error) {
        content.innerHTML = `<p style="text-align:center;color:#f87171;padding:40px;">Error al cargar tus deseados: ${error.message}</p>`;
        return;
    }

    // Filtrar solo productos activos
    const activos = (deseados || []).filter(d => d.productos && d.productos.activo);

    if (activos.length === 0) {
        content.innerHTML = `
            <div class="empty-wishlist">
                <div class="empty-icon"><i class="fa-regular fa-heart"></i></div>
                <h2>Aún no tienes favoritos</h2>
                <p>Haz clic en el corazón de cualquier producto para guardarlo aquí.</p>
                <a href="mercado.html" class="btn-ir-mercado">
                    <i class="fa-solid fa-store"></i> Ir al Mercado
                </a>
            </div>
        `;
        return;
    }

    // 3. Renderizar grid
    const grid = document.createElement('div');
    grid.className = 'wishlist-grid';

    activos.forEach(({ deseado_id, producto_id, productos: p }) => {
        const vendedor = p.autenticacion?.nombre_usuario || 'Vendedor';
        const perfil = p.autenticacion?.usuarios_perfil;
        const avatar = (Array.isArray(perfil) ? perfil[0]?.url_imagen_vendedor : perfil?.url_imagen_vendedor) || PLACEHOLDER_AVATAR;
        const precio = parseFloat(p.precio_bdc).toFixed(2);
        const imgSrc = p.url_imagen_producto || PLACEHOLDER_IMG;

        const card = document.createElement('article');
        card.className = 'wishlist-card';
        card.id = `wish-card-${producto_id}`;
        card.innerHTML = `
            <div class="card-img-wrap">
                <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.nombre_producto)}" loading="lazy">
                <button class="btn-remove-wish" type="button" data-wish-id="${deseado_id}" data-prod-id="${producto_id}" title="Quitar de deseados">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>
            <div class="card-body">
                <div class="card-seller">
                    <img src="${escapeHtml(avatar)}" alt="Vendedor">
                    <span>@${escapeHtml(vendedor)}</span>
                </div>
                <p class="card-title">${escapeHtml(p.nombre_producto)}</p>
                <div class="card-footer">
                    <div class="card-price">${precio} <span>BDC</span></div>
                    <button class="btn-ver-detalle" type="button" data-prod-id="${producto_id}">
                        <i class="fa-solid fa-eye"></i> Ver
                    </button>
                </div>
            </div>
        `;

        // Ver detalle
        card.querySelector('.btn-ver-detalle').addEventListener('click', () => {
            window.location.href = `detalle-producto.html?id=${producto_id}`;
        });

        // Quitar de deseados
        card.querySelector('.btn-remove-wish').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.style.transform = 'scale(1.3)';
            setTimeout(() => { btn.style.transform = 'scale(1)'; }, 200);

            const { error: delErr } = await supabase
                .from('deseados')
                .delete()
                .eq('deseado_id', deseado_id)
                .eq('usuario_id', userUUID);

            if (!delErr) {
                // Animación de salida
                card.style.transition = 'opacity 0.35s, transform 0.35s';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    card.remove();
                    // Si no quedan tarjetas, mostrar estado vacío
                    if (grid.querySelectorAll('.wishlist-card').length === 0) {
                        content.innerHTML = `
                            <div class="empty-wishlist">
                                <div class="empty-icon"><i class="fa-regular fa-heart"></i></div>
                                <h2>Ya no tienes favoritos</h2>
                                <p>Sigue explorando el mercado para guardar más productos.</p>
                                <a href="mercado.html" class="btn-ir-mercado">
                                    <i class="fa-solid fa-store"></i> Ir al Mercado
                                </a>
                            </div>
                        `;
                    }
                }, 350);
            } else {
                console.error('Error al quitar de deseados:', delErr.message);
            }
        });

        grid.appendChild(card);
    });

    content.innerHTML = '';
    content.appendChild(grid);

    function escapeHtml(texto) {
        if (!texto) return '';
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
});
