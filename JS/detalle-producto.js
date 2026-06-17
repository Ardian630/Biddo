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

    const { data: { session } } = await supabase.auth.getSession();

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
    inicializarBotonCompra(producto);
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

        let comprarBtnHtml = '';
        if (!session || !session.user) {
            comprarBtnHtml = `<button id="btn-comprar-producto" class="login-submit" style="margin-top:20px; width:100%; max-width: 300px; padding: 12px; font-size:1rem; font-weight:600;">Inicia sesión para comprar</button>`;
        } else {
            const esVendedor = session.user.id === producto.vendedor_id;
            comprarBtnHtml = esVendedor 
                ? `<p style="font-size:0.85rem; color:#eab308; margin-top:15px; font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Este es tu propio producto.</p>`
                : `<button id="btn-comprar-producto" class="login-submit" style="margin-top:20px; width:100%; max-width: 300px; padding: 12px; font-size:1rem; font-weight:600;">Comprar Producto</button>`;
        }

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
                    <div id="compra-action-container">
                        ${comprarBtnHtml}
                    </div>
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

    function inicializarBotonCompra(producto) {
        const btnComprar = document.getElementById('btn-comprar-producto');
        if (!btnComprar) return;

        btnComprar.addEventListener('click', async () => {
            if (!session || !session.user) {
                window.location.href = 'login.html';
                return;
            }

            btnComprar.disabled = true;
            btnComprar.textContent = 'Procesando saldo...';

            try {
                // 1. Obtener monedero del comprador
                const { data: monederoComprador, error: compErr } = await supabase
                    .from('monederos')
                    .select('monedero_id, bdc_disponible')
                    .eq('usuario_id', session.user.id)
                    .maybeSingle();

                if (compErr || !monederoComprador) {
                    throw new Error('No se pudo verificar tu saldo de monedero.');
                }

                const saldoComprador = parseFloat(monederoComprador.bdc_disponible) || 0;
                const precioProducto = parseFloat(producto.precio_bdc);

                if (saldoComprador < precioProducto) {
                    alert(`❌ Saldo insuficiente. El producto cuesta ${precioProducto.toFixed(2)} BDC y posees ${saldoComprador.toFixed(2)} BDC.`);
                    btnComprar.disabled = false;
                    btnComprar.textContent = 'Comprar Producto';
                    return;
                }

                // 2. Abrir Modal de Confirmación
                const modal = document.getElementById('modal-confirmar-compra');
                document.getElementById('modal-compra-titulo').textContent = producto.nombre_producto;
                document.getElementById('modal-compra-precio').textContent = `${precioProducto.toFixed(2)} BDC`;
                document.getElementById('modal-compra-saldo').textContent = `${saldoComprador.toFixed(2)} BDC`;

                modal.classList.add('active');

                // Lógica de botones del modal
                const btnConfirmarAceptar = document.getElementById('btn-confirmar-compra-aceptar');
                const btnConfirmarCancelar = document.getElementById('btn-confirmar-compra-cancelar');

                // Eliminar duplicados de listeners mediante clonación
                const nuevoAceptar = btnConfirmarAceptar.cloneNode(true);
                btnConfirmarAceptar.replaceWith(nuevoAceptar);
                
                const nuevoCancelar = btnConfirmarCancelar.cloneNode(true);
                btnConfirmarCancelar.replaceWith(nuevoCancelar);

                nuevoCancelar.addEventListener('click', () => {
                    modal.classList.remove('active');
                    btnComprar.disabled = false;
                    btnComprar.textContent = 'Comprar Producto';
                });

                nuevoAceptar.addEventListener('click', async () => {
                    modal.classList.remove('active');
                    btnComprar.disabled = true;
                    btnComprar.textContent = 'Procesando Compra...';

                    try {
                        // A. Cargar tasas config para comision porcentual de venta
                        const { data: ratesConfig, error: ratesError } = await supabase
                            .from('tasas_config')
                            .select('venta_comision_porcentual')
                            .order('tasa_id', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (ratesError) throw ratesError;

                        const factorComisionPorc = ratesConfig ? parseFloat(ratesConfig.venta_comision_porcentual) || 0 : 0;
                        const comisionAdmin = precioProducto * factorComisionPorc;
                        const montoVendedor = precioProducto - comisionAdmin;

                        // B. Cargar monedero del vendedor
                        const { data: monederoVendedor, error: vendErr } = await supabase
                            .from('monederos')
                            .select('monedero_id, bdc_disponible')
                            .eq('usuario_id', producto.vendedor_id)
                            .single();

                        if (vendErr) throw new Error('No se encontró el monedero del vendedor.');

                        // C. Cargar monedero del admin (ID 7)
                        const MONEDERO_BIDDO_ID = 7;
                        const { data: monederoAdmin, error: adminErr } = await supabase
                            .from('monederos')
                            .select('monedero_id, bdc_disponible')
                            .eq('monedero_id', MONEDERO_BIDDO_ID)
                            .single();

                        if (adminErr) throw new Error('No se encontró el monedero administrador.');

                        // D. Proceder con las actualizaciones de saldo (Comprador, Vendedor, Admin)
                        const nuevoSaldoComprador = saldoComprador - precioProducto;
                        const nuevoSaldoVendedor = (parseFloat(monederoVendedor.bdc_disponible) || 0) + montoVendedor;
                        const nuevoSaldoAdmin = (parseFloat(monederoAdmin.bdc_disponible) || 0) + comisionAdmin;

                        // Actualizar monedero comprador
                        const { error: updCompErr } = await supabase
                            .from('monederos')
                            .update({ bdc_disponible: nuevoSaldoComprador })
                            .eq('monedero_id', monederoComprador.monedero_id);

                        if (updCompErr) throw updCompErr;

                        // Actualizar monedero vendedor
                        const { error: updVendErr } = await supabase
                            .from('monederos')
                            .update({ bdc_disponible: nuevoSaldoVendedor })
                            .eq('monedero_id', monederoVendedor.monedero_id);

                        if (updVendErr) throw updVendErr;

                        // Actualizar monedero admin (si comision > 0)
                        if (comisionAdmin > 0) {
                            const { error: updAdminErr } = await supabase
                                .from('monederos')
                                .update({ bdc_disponible: nuevoSaldoAdmin })
                                .eq('monedero_id', MONEDERO_BIDDO_ID);

                            if (updAdminErr) throw updAdminErr;
                        }

                        const fechaISO = new Date().toISOString();

                        // E. Registrar transacciones en operaciones
                        // 1. Débito del comprador
                        const { error: opCompErr } = await supabase
                            .from('operaciones')
                            .insert([{
                                monedero_id: monederoComprador.monedero_id,
                                monto_bruto: -precioProducto,
                                monto_comision: 0,
                                estado_operacion: 'Exitosa',
                                referencia_interna: `COMPRA-PRODUCTO-${producto.producto_id}-COMPRADOR`,
                                fecha_creacion: fechaISO,
                                fecha_finalizacion: fechaISO
                            }]);

                        if (opCompErr) throw opCompErr;

                        // 2. Crédito del vendedor (descontada la comisión)
                        const { error: opVendErr } = await supabase
                            .from('operaciones')
                            .insert([{
                                monedero_id: monederoVendedor.monedero_id,
                                monto_bruto: montoVendedor,
                                monto_comision: comisionAdmin,
                                estado_operacion: 'Exitosa',
                                referencia_interna: `COMPRA-PRODUCTO-${producto.producto_id}-VENDEDOR`,
                                fecha_creacion: fechaISO,
                                fecha_finalizacion: fechaISO
                            }]);

                        if (opVendErr) throw opVendErr;

                        // 3. Recaudación de comisión para el monedero administrador
                        if (comisionAdmin > 0) {
                            const { error: opAdminErr } = await supabase
                                .from('operaciones')
                                .insert([{
                                    monedero_id: MONEDERO_BIDDO_ID,
                                    monto_bruto: comisionAdmin,
                                    monto_comision: 0,
                                    estado_operacion: 'Exitosa',
                                    referencia_interna: `RECAUDACION-COMISION-COMPRA-PRODUCTO-${producto.producto_id}`,
                                    fecha_creacion: fechaISO,
                                    fecha_finalizacion: fechaISO
                                }]);

                            if (opAdminErr) throw opAdminErr;
                        }

                        // F. Marcar el producto como inactivo (vendido)
                        const { error: prodDeactErr } = await supabase
                            .from('productos')
                            .update({ activo: false })
                            .eq('producto_id', producto.producto_id);

                        if (prodDeactErr) throw prodDeactErr;

                        alert('✅ ¡Compra realizada con éxito!');
                        window.location.href = 'mimonedero.html';

                    } catch (err) {
                        console.error('Error al procesar la transacción de compra:', err.message);
                        alert(`❌ Error al completar la compra: ${err.message}`);
                        btnComprar.disabled = false;
                        btnComprar.textContent = 'Comprar Producto';
                    }
                });

            } catch (err) {
                console.error('Error al iniciar compra:', err.message);
                alert(`❌ Error: ${err.message}`);
                btnComprar.disabled = false;
                btnComprar.textContent = 'Comprar Producto';
            }
        });
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
