import { supabase } from './supabaseClient.js';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form-editar-producto');
    const selectCategoria = document.getElementById('categoria');
    const inputNombre = document.getElementById('nombre-producto');
    const inputDescripcion = document.getElementById('descripcion');
    const inputPrecio = document.getElementById('precio-bdc');
    const inputStock = document.getElementById('stock');
    const inputImagen = document.getElementById('imagen-producto');
    const uploadArea = document.getElementById('upload-area');
    const previewImagen = document.getElementById('preview-imagen');
    const btnGuardar = document.getElementById('btn-guardar');
    const mensajeStatus = document.getElementById('mensaje-status');
    const descCounter = document.getElementById('desc-counter');

    let archivoImagen = null;
    let urlImagenActual = null;

    const params = new URLSearchParams(window.location.search);
    const productoId = parseInt(params.get('id'), 10);

    if (!productoId || isNaN(productoId)) {
        window.location.href = 'gestionar-productos.html';
        return;
    }

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

    const { data: producto, error: productoError } = await supabase
        .from('productos')
        .select('producto_id, nombre_producto, descripcion, precio_bdc, categoria_id, vendedor_id, url_imagen_producto, stock, activo')
        .eq('producto_id', productoId)
        .maybeSingle();

    if (productoError || !producto || producto.vendedor_id !== session.user.id) {
        window.location.href = 'gestionar-productos.html';
        return;
    }

    inputNombre.value = producto.nombre_producto;
    inputDescripcion.value = producto.descripcion;
    inputPrecio.value = producto.precio_bdc;
    selectCategoria.value = producto.categoria_id;
    if (inputStock) inputStock.value = producto.stock !== undefined ? producto.stock : 1;
    descCounter.textContent = producto.descripcion.length;
    urlImagenActual = producto.url_imagen_producto || null;

    if (urlImagenActual) {
        previewImagen.src = `${urlImagenActual}?t=${Date.now()}`;
    }

    uploadArea.addEventListener('click', () => inputImagen.click());

    inputImagen.addEventListener('change', () => {
        const file = inputImagen.files[0];
        if (!file) return;

        if (!ALLOWED_TYPES.includes(file.type)) {
            mostrarMensaje('❌ Formato no permitido. Usa JPG, PNG o WEBP.', '#f87171');
            inputImagen.value = '';
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            mostrarMensaje('❌ La imagen no puede superar 5 MB.', '#f87171');
            inputImagen.value = '';
            return;
        }

        archivoImagen = file;
        previewImagen.src = URL.createObjectURL(file);
    });

    inputDescripcion.addEventListener('input', () => {
        descCounter.textContent = inputDescripcion.value.length;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = inputNombre.value.trim();
        const descripcion = inputDescripcion.value.trim();
        const categoriaId = parseInt(selectCategoria.value, 10);
        const precio = parseFloat(inputPrecio.value);
        const stock = parseInt(inputStock ? inputStock.value : '0', 10);

        const errorValidacion = validarFormulario(nombre, descripcion, categoriaId, precio, stock, urlImagenActual, archivoImagen);
        if (errorValidacion) {
            mostrarMensaje(errorValidacion, '#f87171');
            return;
        }

        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';

        try {
            let urlImagenFinal = urlImagenActual;

            if (archivoImagen) {
                urlImagenFinal = await subirImagen(session.user.id);
            }

            const { error: updateError } = await supabase
                .from('productos')
                .update({
                    categoria_id: categoriaId,
                    nombre_producto: nombre,
                    descripcion: descripcion,
                    precio_bdc: precio,
                    url_imagen_producto: urlImagenFinal,
                    stock: stock,
                    activo: stock > 0
                })
                .eq('producto_id', productoId)
                .eq('vendedor_id', session.user.id);

            if (updateError) throw updateError;

            mostrarMensaje('✅ Producto actualizado correctamente.', '#4ade80');

            setTimeout(() => {
                window.location.href = 'gestionar-productos.html';
            }, 1500);

        } catch (error) {
            console.error('Error al editar producto:', error.message);
            mostrarMensaje('❌ No se pudo actualizar el producto. Intenta de nuevo.', '#f87171');
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Cambios';
        }
    });

    async function subirImagen(userId) {
        const ext = archivoImagen.name.split('.').pop().toLowerCase() || 'jpg';
        const filePath = `producto-${userId}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('productos')
            .upload(filePath, archivoImagen, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('productos')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    }

    async function cargarCategorias() {
        const { data: categorias, error } = await supabase
            .from('categorias')
            .select('categoria_id, nombre_categoria')
            .order('nombre_categoria');

        if (error) {
            mostrarMensaje('⚠️ No se pudieron cargar las categorías.', '#eab308');
            btnGuardar.disabled = true;
            return;
        }

        categorias.forEach((cat) => {
            const option = document.createElement('option');
            option.value = cat.categoria_id;
            option.textContent = cat.nombre_categoria;
            selectCategoria.appendChild(option);
        });
    }

    function validarFormulario(nombre, descripcion, categoriaId, precio, stock, imagenActual, imagenNueva) {
        if (!imagenActual && !imagenNueva) {
            return '❌ Debes seleccionar una imagen del producto.';
        }
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
        if (isNaN(stock) || stock < 0) {
            return '❌ El stock debe ser un número no negativo.';
        }
        return null;
    }

    function mostrarMensaje(texto, color) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.color = color;
    }
});
