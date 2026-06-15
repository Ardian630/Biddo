import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('productos-tbody');
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

    await cargarProductos(session.user.id);

    async function cargarProductos(vendedorId) {
        const { data: productos, error } = await supabase
            .from('productos')
            .select(`
                producto_id,
                nombre_producto,
                precio_bdc,
                fecha_publicacion,
                categorias ( nombre_categoria )
            `)
            .eq('vendedor_id', vendedorId)
            .eq('activo', true)
            .order('fecha_publicacion', { ascending: false });

        if (error) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No se pudieron cargar los productos.</td></tr>';
            return;
        }

        if (!productos.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No tienes productos publicados. ¡Publica tu primer producto!</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        productos.forEach((producto) => {
            tbody.appendChild(crearFila(producto));
        });
    }

    function crearFila(producto) {
        const tr = document.createElement('tr');
        const categoria = producto.categorias?.nombre_categoria || 'Sin categoría';
        const precio = parseFloat(producto.precio_bdc).toFixed(2);
        const fecha = new Date(producto.fecha_publicacion).toLocaleDateString('es-VE');

        tr.innerHTML = `
            <td>${escapeHtml(producto.nombre_producto)}</td>
            <td>${escapeHtml(categoria)}</td>
            <td>${precio}</td>
            <td>${fecha}</td>
            <td>
                <div class="btn-action-group">
                    <a href="editar-producto.html?id=${producto.producto_id}" class="btn-admin btn-edit">
                        <i class="fa-solid fa-pen"></i> Editar
                    </a>
                    <button class="btn-admin btn-delete" type="button" data-id="${producto.producto_id}">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </div>
            </td>
        `;

        tr.querySelector('.btn-delete').addEventListener('click', () => eliminarProducto(producto));

        return tr;
    }

    async function eliminarProducto(producto) {
        const confirmar = confirm(`¿Estás seguro de eliminar "${producto.nombre_producto}"? Esta acción no se puede deshacer.`);
        if (!confirmar) return;

        const { error } = await supabase
            .from('productos')
            .delete()
            .eq('producto_id', producto.producto_id);

        if (error) {
            mostrarAlerta('No se pudo eliminar el producto. Intenta de nuevo.', '#f87171');
            return;
        }

        mostrarAlerta('Producto eliminado correctamente.', '#4ade80');
        await cargarProductos((await supabase.auth.getSession()).data.session.user.id);
    }

    function mostrarAlerta(mensaje, color) {
        alertBanner.textContent = mensaje;
        alertBanner.style.display = 'block';
        alertBanner.style.background = `${color}22`;
        alertBanner.style.color = color;
        alertBanner.style.border = `1px solid ${color}44`;

        setTimeout(() => {
            alertBanner.style.display = 'none';
        }, 3000);
    }

    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
});
