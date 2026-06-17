import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('compras-tbody');

    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }

    await cargarMisCompras(session.user.id);

    async function cargarMisCompras(compradorId) {
        try {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">Cargando tus compras...</td></tr>';

            const { data: compras, error } = await supabase
                .from('envios')
                .select(`
                    envio_id,
                    cantidad,
                    precio_unitario,
                    telefono_contacto,
                    direccion_entrega,
                    estado_envio,
                    fecha_envio,
                    created_at,
                    productos ( producto_id, nombre_producto ),
                    vendedor: autenticacion!vendedor_id ( nombre_usuario )
                `)
                .eq('comprador_id', compradorId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!compras || compras.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="no-data">🛍️ Aún no has realizado ninguna compra en el mercado.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            compras.forEach((compra) => {
                tbody.appendChild(crearFilaCompra(compra));
            });

        } catch (err) {
            console.error('Error al cargar compras:', err.message);
            tbody.innerHTML = `<tr><td colspan="8" class="no-data" style="color:var(--error-red);">❌ Error: ${err.message}</td></tr>`;
        }
    }

    function crearFilaCompra(compra) {
        const tr = document.createElement('tr');
        const nombreProducto = compra.productos?.nombre_producto || 'Producto Eliminado';
        const linkProducto = compra.productos?.producto_id 
            ? `<a href="detalle-producto.html?id=${compra.productos.producto_id}" style="color:#a7f3d0; text-decoration:underline;">${escapeHtml(nombreProducto)}</a>`
            : escapeHtml(nombreProducto);
        
        const nombreVendedor = compra.vendedor?.nombre_usuario || 'Vendedor';
        const precioUnit = parseFloat(compra.precio_unitario).toFixed(2);
        const total = (parseFloat(compra.precio_unitario) * parseInt(compra.cantidad, 10)).toFixed(2);
        
        const fechaCompra = new Date(compra.created_at).toLocaleDateString('es-VE', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });

        const estadoEnvio = compra.estado_envio || 'Pendiente';
        let badgeHtml = '';
        let fechaEnvioText = '—';

        if (estadoEnvio === 'Enviado') {
            badgeHtml = `<span class="badge-status badge-shipped"><i class="fa-solid fa-circle-check"></i> Enviado</span>`;
            if (compra.fecha_envio) {
                fechaEnvioText = new Date(compra.fecha_envio).toLocaleDateString('es-VE', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                });
            } else {
                fechaEnvioText = 'Despachado';
            }
        } else {
            badgeHtml = `<span class="badge-status badge-pending"><i class="fa-solid fa-clock"></i> Pendiente</span>`;
        }

        tr.innerHTML = `
            <td><strong>${linkProducto}</strong></td>
            <td>${escapeHtml(nombreVendedor)}</td>
            <td>${compra.cantidad}</td>
            <td>${precioUnit} BDC</td>
            <td style="color:#a7f3d0; font-weight:600;">${total} BDC</td>
            <td>${badgeHtml}</td>
            <td style="font-weight: 500;">${fechaEnvioText}</td>
            <td>${fechaCompra}</td>
        `;

        return tr;
    }

    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
});
