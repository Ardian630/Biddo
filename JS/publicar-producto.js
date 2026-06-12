import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form-publicar-producto');
    const selectCategoria = document.getElementById('categoria');
    const inputNombre = document.getElementById('nombre-producto');
    const inputDescripcion = document.getElementById('descripcion');
    const inputPrecio = document.getElementById('precio-bdc');
    const btnPublicar = document.getElementById('btn-publicar');
    const mensajeStatus = document.getElementById('mensaje-status');
    const descCounter = document.getElementById('desc-counter');

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

    await cargarCategorias();

    inputDescripcion.addEventListener('input', () => {
        descCounter.textContent = inputDescripcion.value.length;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = inputNombre.value.trim();
        const descripcion = inputDescripcion.value.trim();
        const categoriaId = parseInt(selectCategoria.value, 10);
        const precio = parseFloat(inputPrecio.value);

        const errorValidacion = validarFormulario(nombre, descripcion, categoriaId, precio);
        if (errorValidacion) {
            mostrarMensaje(errorValidacion, '#f87171');
            return;
        }

        btnPublicar.disabled = true;
        btnPublicar.textContent = 'Publicando...';

        try {
            const { error: insertError } = await supabase
                .from('productos')
                .insert([{
                    vendedor_id: session.user.id,
                    categoria_id: categoriaId,
                    nombre_producto: nombre,
                    descripcion: descripcion,
                    precio_bdc: precio,
                    fecha_publicacion: new Date().toISOString()
                }]);

            if (insertError) throw insertError;

            mostrarMensaje('✅ Producto publicado correctamente.', '#4ade80');
            form.reset();
            descCounter.textContent = '0';

            setTimeout(() => {
                window.location.href = 'mercado.html';
            }, 1500);

        } catch (error) {
            console.error('Error al publicar producto:', error.message);
            mostrarMensaje('❌ No se pudo publicar el producto. Intenta de nuevo.', '#f87171');
            btnPublicar.disabled = false;
            btnPublicar.textContent = 'Publicar en el Mercado';
        }
    });

    async function cargarCategorias() {
        const { data: categorias, error } = await supabase
            .from('categorias')
            .select('categoria_id, nombre_categoria')
            .order('nombre_categoria');

        if (error) {
            mostrarMensaje('⚠️ No se pudieron cargar las categorías.', '#eab308');
            btnPublicar.disabled = true;
            return;
        }

        categorias.forEach((cat) => {
            const option = document.createElement('option');
            option.value = cat.categoria_id;
            option.textContent = cat.nombre_categoria;
            selectCategoria.appendChild(option);
        });
    }

    function validarFormulario(nombre, descripcion, categoriaId, precio) {
        if (nombre.length < 3) {
            return '❌ El nombre del producto debe tener al menos 3 caracteres.';
        }
        if (nombre.length > 150) {
            return '❌ El nombre del producto no puede superar 150 caracteres.';
        }
        if (!categoriaId || isNaN(categoriaId)) {
            return '❌ Selecciona una categoría válida.';
        }
        if (descripcion.length < 10) {
            return '❌ La descripción debe tener al menos 10 caracteres.';
        }
        if (descripcion.length > 1000) {
            return '❌ La descripción no puede superar 1000 caracteres.';
        }
        if (isNaN(precio) || precio <= 0) {
            return '❌ El precio debe ser un número mayor a 0 BDC.';
        }
        if (precio > 9999999.99) {
            return '❌ El precio ingresado es demasiado alto.';
        }
        return null;
    }

    function mostrarMensaje(texto, color) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.color = color;
    }
});
