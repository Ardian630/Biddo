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
    stock,
    activo,
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
        .maybeSingle();

    if (error || !producto) {
        mostrarError('No se pudo cargar el producto.');
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
        let quantityHtml = '';

        if (producto.stock === 0 || !producto.activo) {
            comprarBtnHtml = `<p style="font-size:1rem; color:#f87171; margin-top:15px; font-weight:600;"><i class="fa-solid fa-circle-xmark"></i> Producto Agotado / No Disponible</p>`;
        } else if (!session || !session.user) {
            comprarBtnHtml = `<button id="btn-comprar-producto" class="login-submit" style="margin-top:20px; width:100%; max-width: 300px; padding: 12px; font-size:1rem; font-weight:600;">Inicia sesión para comprar</button>`;
        } else {
            const esVendedor = session.user.id === producto.vendedor_id;
            if (esVendedor) {
                comprarBtnHtml = `<p style="font-size:0.85rem; color:#eab308; margin-top:15px; font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Este es tu propio producto.</p>`;
            } else {
                comprarBtnHtml = `<button id="btn-comprar-producto" class="login-submit" style="margin-top:20px; width:100%; max-width: 300px; padding: 12px; font-size:1rem; font-weight:600;">Comprar Producto</button>`;
                
                let optionsHtml = '';
                const maxQty = Math.min(producto.stock, 10);
                for (let i = 1; i <= maxQty; i++) {
                    optionsHtml += `<option value="${i}">${i}</option>`;
                }
                quantityHtml = `
                    <div class="quantity-selector" style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                        <label for="compra-cantidad" style="color: #94a3b8; font-size: 0.9rem; font-weight: 500;">Cantidad a comprar:</label>
                        <select id="compra-cantidad" style="background: #1f1f23; color: #fff; border: 1px solid rgba(151, 74, 222, 0.3); border-radius: 8px; padding: 6px 12px; font-family: 'Poppins', sans-serif; font-size: 0.9rem; outline: none; cursor: pointer;">
                            ${optionsHtml}
                        </select>
                    </div>
                `;
            }
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
                    <p class="product-stock" style="margin-top:10px; font-size:0.95rem; color:#a7f3d0; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-cubes"></i> Unidades disponibles: <strong id="product-stock-count">${producto.stock}</strong>
                    </p>
                    ${quantityHtml}
                    <div id="compra-action-container" style="margin-top: 10px;">
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
                const inputCantidad = document.getElementById('compra-cantidad');
                const cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) : 1;
                const precioProducto = parseFloat(producto.precio_bdc);
                const precioTotal = precioProducto * cantidad;

                if (saldoComprador < precioTotal) {
                    alert(`❌ Saldo insuficiente. Total de compra: ${precioTotal.toFixed(2)} BDC (Cantidad: ${cantidad}). Posees ${saldoComprador.toFixed(2)} BDC.`);
                    btnComprar.disabled = false;
                    btnComprar.textContent = 'Comprar Producto';
                    return;
                }

                // 2. Abrir Modal de Confirmación
                const modal = document.getElementById('modal-confirmar-compra');
                document.getElementById('modal-compra-titulo').textContent = `${producto.nombre_producto} (x${cantidad})`;
                document.getElementById('modal-compra-precio').textContent = `${precioTotal.toFixed(2)} BDC`;
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
                        const comisionAdmin = precioTotal * factorComisionPorc;
                        const montoVendedor = precioTotal - comisionAdmin;

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
                        const nuevoSaldoComprador = saldoComprador - precioTotal;
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
                                monto_bruto: -precioTotal,
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

                        // F. Actualizar el stock del producto mediante una función RPC para evitar problemas de RLS de Supabase
                        const { error: prodDeactErr } = await supabase.rpc('decrementar_stock_producto', {
                            p_producto_id: producto.producto_id,
                            p_cantidad: cantidad
                        });

                        if (prodDeactErr) throw prodDeactErr;

                        // G. Obtener los datos actuales del comprador para pre-rellenar el envío
                        const { data: profileBuyer } = await supabase
                            .from('usuarios_perfil')
                            .select('telefono, direccion_usuario')
                            .eq('autenticacion_id', session.user.id)
                            .maybeSingle();

                        const buyerPhone = profileBuyer?.telefono || 'No especificado';
                        const buyerAddress = profileBuyer?.direccion_usuario || 'No especificada';

                        // H. Insertar en la tabla de envios
                        const { data: newEnvio, error: envioErr } = await supabase
                            .from('envios')
                            .insert([{
                                producto_id: producto.producto_id,
                                comprador_id: session.user.id,
                                vendedor_id: producto.vendedor_id,
                                cantidad: cantidad,
                                precio_unitario: precioProducto,
                                telefono_contacto: buyerPhone,
                                direccion_entrega: buyerAddress,
                                estado_envio: 'Pendiente'
                            }])
                            .select('envio_id')
                            .single();

                        if (envioErr) throw envioErr;

                        await mostrarPanelPostCompra(producto, newEnvio.envio_id);

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

    async function mostrarPanelPostCompra(producto, envioId) {
        const actionContainer = document.getElementById('compra-action-container');
        if (!actionContainer) return;

        actionContainer.innerHTML = `
            <div class="success-panel">
                <div class="success-header">
                    <i class="fa-solid fa-circle-check success-icon"></i>
                    <h3>¡Compra Realizada con Éxito!</h3>
                    <p>El producto ha sido comprado y su stock actualizado.</p>
                </div>
                
                <div class="seller-contact-card">
                    <h4><i class="fa-solid fa-address-book"></i> Ponerse en contacto con el vendedor</h4>
                    <div class="contact-details">
                        <div class="contact-item">
                            <span class="contact-label">Vendedor:</span>
                            <span class="contact-value" id="seller-name-info">Cargando...</span>
                        </div>
                        <div class="contact-item">
                            <span class="contact-label">Correo:</span>
                            <span class="contact-value" id="seller-email-info">Cargando...</span>
                        </div>
                        <div class="contact-item">
                            <span class="contact-label">Teléfono:</span>
                            <span class="contact-value" id="seller-phone-info">Cargando...</span>
                        </div>
                    </div>
                    <div class="contact-actions">
                        <a href="#" id="btn-contact-whatsapp" class="contact-btn whatsapp-btn" target="_blank" style="display: none;">
                            <i class="fa-brands fa-whatsapp"></i> WhatsApp
                        </a>
                        <a href="#" id="btn-contact-email" class="contact-btn email-btn" target="_blank" style="display: none;">
                            <i class="fa-solid fa-envelope"></i> Enviar Correo
                        </a>
                    </div>
                </div>

                <div class="delivery-info-card">
                    <h4><i class="fa-solid fa-truck-fast"></i> Información de Entrega</h4>
                    <div class="form-group">
                        <label for="buyer-phone">Teléfono de contacto:</label>
                        <input type="text" id="buyer-phone" placeholder="Tu número telefónico..." class="panel-input">
                    </div>
                    <div class="form-group">
                        <label for="buyer-address">Dirección de entrega:</label>
                        <textarea id="buyer-address" placeholder="Dirección completa para recibir el producto..." class="panel-textarea"></textarea>
                    </div>
                    <button id="btn-save-delivery-info" class="save-info-btn">
                        <i class="fa-solid fa-floppy-disk"></i> Guardar Información
                    </button>
                    <span id="delivery-info-status" class="status-msg"></span>
                </div>

                <div class="panel-actions">
                    <a href="mimonedero.html" class="panel-nav-btn"><i class="fa-solid fa-wallet"></i> Ver Mi Monedero</a>
                    <a href="mercado.html" class="panel-nav-btn secondary"><i class="fa-solid fa-store"></i> Volver al Mercado</a>
                </div>
            </div>
        `;

        try {
            // 1. Obtener datos de contacto del vendedor
            const { data: profileSeller } = await supabase
                .from('usuarios_perfil')
                .select('nombre_completo, telefono')
                .eq('autenticacion_id', producto.vendedor_id)
                .maybeSingle();

            const { data: authSeller } = await supabase
                .from('autenticacion')
                .select('email, nombre_usuario')
                .eq('autenticacion_id', producto.vendedor_id)
                .maybeSingle();

            const sellerName = profileSeller?.nombre_completo || authSeller?.nombre_usuario || 'Vendedor';
            const sellerEmail = authSeller?.email || 'No especificado';
            const sellerPhone = profileSeller?.telefono || 'No especificado';

            document.getElementById('seller-name-info').textContent = sellerName;
            document.getElementById('seller-email-info').textContent = sellerEmail;
            document.getElementById('seller-phone-info').textContent = sellerPhone;

            // Enlace de Correo
            const btnEmail = document.getElementById('btn-contact-email');
            if (authSeller?.email) {
                btnEmail.href = `mailto:${authSeller.email}?subject=Biddo%20-%20Compra%20de%20${encodeURIComponent(producto.nombre_producto)}`;
                btnEmail.style.display = 'inline-flex';
            }

            // Enlace de WhatsApp
            const btnWhatsapp = document.getElementById('btn-contact-whatsapp');
            if (profileSeller?.telefono && profileSeller.telefono !== 'No especificado') {
                const cleanPhone = profileSeller.telefono.replace(/[^\d+]/g, '');
                btnWhatsapp.href = `https://wa.me/${cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone}?text=Hola%20${encodeURIComponent(sellerName)}%2C%20te%20escribo%20desde%20Biddo%20por%20la%20compra%20de%20tu%20producto%20%22${encodeURIComponent(producto.nombre_producto)}%22.`;
                btnWhatsapp.style.display = 'inline-flex';
            }

            // 2. Obtener datos actuales del comprador
            const { data: profileBuyer } = await supabase
                .from('usuarios_perfil')
                .select('telefono, direccion_usuario')
                .eq('autenticacion_id', session.user.id)
                .maybeSingle();

            if (profileBuyer) {
                if (profileBuyer.telefono) {
                    document.getElementById('buyer-phone').value = profileBuyer.telefono;
                }
                if (profileBuyer.direccion_usuario) {
                    document.getElementById('buyer-address').value = profileBuyer.direccion_usuario;
                }
            }

            // 3. Guardar datos de entrega del comprador
            const btnSave = document.getElementById('btn-save-delivery-info');
            btnSave.addEventListener('click', async () => {
                const newPhone = document.getElementById('buyer-phone').value.trim();
                const newAddress = document.getElementById('buyer-address').value.trim();
                const statusMsg = document.getElementById('delivery-info-status');

                if (!newPhone || !newAddress) {
                    statusMsg.style.color = '#f87171';
                    statusMsg.textContent = '⚠️ Por favor, ingresa teléfono y dirección.';
                    return;
                }

                statusMsg.style.color = '#3b82f6';
                statusMsg.textContent = '⏳ Guardando información de envío...';

                // Modificación segura: SELECT previo para decidir INSERT o UPDATE y evadir restricciones UNIQUE faltantes
                let saveError = null;
                try {
                    const { data: profileExists } = await supabase
                        .from('usuarios_perfil')
                        .select('autenticacion_id')
                        .eq('autenticacion_id', session.user.id)
                        .maybeSingle();

                    if (profileExists) {
                        const { error: updateErr } = await supabase
                            .from('usuarios_perfil')
                            .update({
                                telefono: newPhone,
                                direccion_usuario: newAddress
                            })
                            .eq('autenticacion_id', session.user.id);
                        saveError = updateErr;
                    } else {
                        const { error: insertErr } = await supabase
                            .from('usuarios_perfil')
                            .insert([{
                                autenticacion_id: session.user.id,
                                telefono: newPhone,
                                direccion_usuario: newAddress,
                                nombre_completo: session.user.email.split('@')[0]
                            }]);
                        saveError = insertErr;
                    }

                    // Actualizar también en la tabla 'envios' del registro actual de compra
                    if (!saveError && envioId) {
                        const { error: updateEnvioErr } = await supabase
                            .from('envios')
                            .update({
                                telefono_contacto: newPhone,
                                direccion_entrega: newAddress
                            })
                            .eq('envio_id', envioId);
                        
                        if (updateEnvioErr) {
                            console.warn("No se pudo actualizar el envío:", updateEnvioErr.message);
                        }
                    }
                } catch (err) {
                    saveError = err;
                }

                if (saveError) {
                    statusMsg.style.color = '#f87171';
                    statusMsg.textContent = '❌ Error al guardar: ' + saveError.message;
                } else {
                    statusMsg.style.color = '#4ade80';
                    statusMsg.textContent = '✅ ¡Información de envío guardada con éxito!';
                }
            });

        } catch (err) {
            console.error('Error al cargar panel post-compra:', err.message);
        }
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
