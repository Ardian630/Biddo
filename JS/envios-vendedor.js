import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('envios-tbody');
    const alertBanner = document.getElementById('alert-banner');

    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const { data: authData, error: rolError } = await supabase
        .from('autenticacion')
        .select('rol_id')
        .eq('autenticacion_id', session.user.id)
        .maybeSingle();

    if (rolError || !authData || authData.rol_id !== 3) {
        window.location.href = '2inicio.html';
        return;
    }

    await cargarEnviosPendientes(session.user.id);

    async function cargarEnviosPendientes(vendedorId) {
        try {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">Cargando envíos...</td></tr>';

            const { data: envios, error } = await supabase
                .from('envios')
                .select(`
                    envio_id,
                    cantidad,
                    precio_unitario,
                    telefono_contacto,
                    direccion_entrega,
                    created_at,
                    productos ( nombre_producto ),
                    comprador: autenticacion!comprador_id ( nombre_usuario )
                `)
                .eq('vendedor_id', vendedorId)
                .eq('estado_envio', 'Pendiente')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!envios || envios.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="no-data">📦 No tienes envíos pendientes de despacho.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            envios.forEach((envio) => {
                tbody.appendChild(crearFilaEnvio(envio));
            });

        } catch (err) {
            console.error('Error al cargar envíos:', err.message);
            tbody.innerHTML = `<tr><td colspan="8" class="no-data" style="color:var(--error-red);">❌ Error: ${err.message}</td></tr>`;
        }
    }

    function crearFilaEnvio(envio) {
        const tr = document.createElement('tr');
        const nombreProducto = envio.productos?.nombre_producto || 'Producto Eliminado';
        const nombreComprador = envio.comprador?.nombre_usuario || 'Comprador';
        const total = (parseFloat(envio.precio_unitario) * parseInt(envio.cantidad, 10)).toFixed(2);
        const fecha = new Date(envio.created_at).toLocaleDateString('es-VE', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });

        tr.innerHTML = `
            <td><strong>${escapeHtml(nombreProducto)}</strong></td>
            <td>${escapeHtml(nombreComprador)}</td>
            <td>${envio.cantidad}</td>
            <td style="color:#a7f3d0; font-weight:600;">${total} BDC</td>
            <td>${escapeHtml(envio.telefono_contacto)}</td>
            <td style="font-size:0.85rem; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(envio.direccion_entrega)}">
                ${escapeHtml(envio.direccion_entrega)}
            </td>
            <td>${fecha}</td>
            <td>
                <button class="btn-admin btn-ship" data-id="${envio.envio_id}">
                    <i class="fa-solid fa-truck-ramp-box"></i> Despachar
                </button>
            </td>
        `;

        tr.querySelector('.btn-ship').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

            const idEnvio = btn.getAttribute('data-id');
            const ahora = new Date().toISOString();

            try {
                const { error } = await supabase
                    .from('envios')
                    .update({
                        estado_envio: 'Enviado',
                        fecha_envio: ahora
                    })
                    .eq('envio_id', idEnvio)
                    .eq('vendedor_id', session.user.id);

                if (error) throw error;

                mostrarAlerta('✅ ¡Envío despachado con éxito!', '#4ade80');
                await cargarEnviosPendientes(session.user.id);

            } catch (error) {
                console.error('Error al despachar:', error.message);
                mostrarAlerta('❌ Error: ' + error.message, '#f87171');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-truck-ramp-box"></i> Despachar';
            }
        });

        return tr;
    }

    function mostrarAlerta(mensaje, color) {
        alertBanner.textContent = mensaje;
        alertBanner.style.display = 'block';
        alertBanner.style.background = `${color}22`;
        alertBanner.style.color = color;
        alertBanner.style.border = `1px solid ${color}44`;

        setTimeout(() => {
            alertBanner.style.display = 'none';
        }, 4000);
    }

    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
});
