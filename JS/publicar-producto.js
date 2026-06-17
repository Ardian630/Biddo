import { supabase } from './supabaseClient.js';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form-publicar-producto');
    const selectCategoria = document.getElementById('categoria');
    const inputNombre = document.getElementById('nombre-producto');
    const inputDescripcion = document.getElementById('descripcion');
    const inputPrecio = document.getElementById('precio-bdc');
    const inputStock = document.getElementById('stock');
    const inputImagen = document.getElementById('imagen-producto');
    const uploadArea = document.getElementById('upload-area');
    const previewImagen = document.getElementById('preview-imagen');
    const btnPublicar = document.getElementById('btn-publicar');
    const mensajeStatus = document.getElementById('mensaje-status');
    const descCounter = document.getElementById('desc-counter');

    let archivoImagen = null;
    let monederoGlobal = null;
    let comisionFijaGlobal = 0;

    // Variables temporales para el formulario
    let nombreProd = '';
    let descripcionProd = '';
    let categoriaIdProd = null;
    let precioProd = 0;
    let stockProd = 1;

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

    // Cargar monedero del vendedor y configuración de tasas config
    async function inicializarDatosVendedor() {
        try {
            // A. Cargar Monedero
            const { data: monedero, error: monederoError } = await supabase
                .from('monederos')
                .select('monedero_id, bdc_disponible')
                .eq('usuario_id', session.user.id)
                .maybeSingle();

            if (monederoError) throw monederoError;
            monederoGlobal = monedero;

            // B. Cargar comision fija
            const { data: configData, error: configError } = await supabase
                .from('tasas_config')
                .select('venta_comision_fija')
                .order('tasa_id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (configError) throw configError;
            if (configData) {
                comisionFijaGlobal = parseFloat(configData.venta_comision_fija) || 0;
            }
        } catch (error) {
            console.error('Error al inicializar datos del vendedor:', error.message);
        }
    }

    await inicializarDatosVendedor();
    await cargarCategorias();

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
        previewImagen.style.display = 'block';
    });

    inputDescripcion.addEventListener('input', () => {
        descCounter.textContent = inputDescripcion.value.length;
    });

    // Referencias a elementos del modal
    const modalConfirmar = document.getElementById('modal-confirmar-comision');
    const btnConfirmarAceptar = document.getElementById('btn-confirmar-aceptar');
    const btnConfirmarCancelar = document.getElementById('btn-confirmar-cancelar');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        nombreProd = inputNombre.value.trim();
        descripcionProd = inputDescripcion.value.trim();
        categoriaIdProd = parseInt(selectCategoria.value, 10);
        precioProd = parseFloat(inputPrecio.value);
        stockProd = parseInt(inputStock ? inputStock.value : '1', 10);

        const errorValidacion = validarFormulario(nombreProd, descripcionProd, categoriaIdProd, precioProd, stockProd, archivoImagen);
        if (errorValidacion) {
            mostrarMensaje(errorValidacion, '#f87171');
            return;
        }

        if (!monederoGlobal) {
            mostrarMensaje('❌ No posees un monedero activo para procesar la comisión.', '#f87171');
            return;
        }

        const saldoDisponible = parseFloat(monederoGlobal.bdc_disponible) || 0;
        if (saldoDisponible < comisionFijaGlobal) {
            mostrarMensaje(`❌ Saldo insuficiente. Publicar requiere una comisión fija de ${comisionFijaGlobal.toFixed(2)} BDC. Tu saldo: ${saldoDisponible.toFixed(2)} BDC.`, '#f87171');
            return;
        }

        // Mostrar Modal de Confirmación
        document.getElementById('comision-fija-monto').textContent = comisionFijaGlobal.toFixed(2);
        document.getElementById('saldo-vendedor-monto').textContent = saldoDisponible.toFixed(2);
        modalConfirmar.classList.add('active');
    });

    btnConfirmarCancelar.addEventListener('click', () => {
        modalConfirmar.classList.remove('active');
    });

    btnConfirmarAceptar.addEventListener('click', async () => {
        modalConfirmar.classList.remove('active');
        btnPublicar.disabled = true;
        btnPublicar.textContent = 'Publicando...';

        try {
            // 1. Subir la imagen
            const urlImagen = await subirImagen(session.user.id);

            // 2. Insertar el producto en la BD
            const { data: nuevoProd, error: insertError } = await supabase
                .from('productos')
                .insert([{
                    vendedor_id: session.user.id,
                    categoria_id: categoriaIdProd,
                    nombre_producto: nombreProd,
                    descripcion: descripcionProd,
                    precio_bdc: precioProd,
                    stock: stockProd,
                    activo: stockProd > 0,
                    url_imagen_producto: urlImagen,
                    fecha_publicacion: new Date().toISOString()
                }])
                .select('producto_id')
                .single();

            if (insertError) throw insertError;
            const productoId = nuevoProd.producto_id;

            // 3. Descontar la comisión del disponible del monedero del vendedor
            const saldoDisponible = parseFloat(monederoGlobal.bdc_disponible) || 0;
            const nuevoSaldoVendedor = saldoDisponible - comisionFijaGlobal;
            const { error: monederoError } = await supabase
                .from('monederos')
                .update({
                    bdc_disponible: nuevoSaldoVendedor
                })
                .eq('monedero_id', monederoGlobal.monedero_id);

            if (monederoError) throw monederoError;

            const fechaISO = new Date().toISOString();

            // 4. Registrar la transacción en operaciones (débito de comisión de publicación)
            const { error: opVendedorError } = await supabase
                .from('operaciones')
                .insert([{
                    monedero_id: monederoGlobal.monedero_id,
                    monto_bruto: -comisionFijaGlobal,
                    monto_comision: 0,
                    estado_operacion: 'Exitosa',
                    referencia_interna: `COMISION-PUBLICACION-PRODUCTO-${productoId}`,
                    fecha_creacion: fechaISO,
                    fecha_finalizacion: fechaISO
                }]);

            if (opVendedorError) throw opVendedorError;

            // 5. Abonar comisión al monedero de la empresa (ID 7)
            if (comisionFijaGlobal > 0) {
                const MONEDERO_BIDDO_ID = 7;
                const { data: monederoAdmin, error: adminGetError } = await supabase
                    .from('monederos')
                    .select('bdc_disponible')
                    .eq('monedero_id', MONEDERO_BIDDO_ID)
                    .single();

                if (adminGetError) throw adminGetError;

                const nuevoSaldoAdmin = (parseFloat(monederoAdmin.bdc_disponible) || 0) + comisionFijaGlobal;
                const { error: updateAdminError } = await supabase
                    .from('monederos')
                    .update({ bdc_disponible: nuevoSaldoAdmin })
                    .eq('monedero_id', MONEDERO_BIDDO_ID);

                if (updateAdminError) throw updateAdminError;

                const { error: opAdminError } = await supabase
                    .from('operaciones')
                    .insert([{
                        monedero_id: MONEDERO_BIDDO_ID,
                        monto_bruto: comisionFijaGlobal,
                        monto_comision: 0,
                        estado_operacion: 'Exitosa',
                        referencia_interna: `RECAUDACION-COMISION-PUBLICACION-PRODUCTO-${productoId}`,
                        fecha_creacion: fechaISO,
                        fecha_finalizacion: fechaISO
                    }]);

                if (opAdminError) throw opAdminError;
            }

            mostrarMensaje('✅ Producto publicado correctamente y comisión cobrada.', '#4ade80');
            form.reset();
            descCounter.textContent = '0';
            previewImagen.style.display = 'none';
            archivoImagen = null;
            
            // Actualizar saldo global en memoria
            monederoGlobal.bdc_disponible = nuevoSaldoVendedor;

            setTimeout(() => {
                window.location.href = 'gestionar-productos.html';
            }, 1500);

        } catch (error) {
            console.error('Error al publicar producto:', error.message);
            mostrarMensaje('❌ No se pudo publicar el producto: ' + error.message, '#f87171');
            btnPublicar.disabled = false;
            btnPublicar.textContent = 'Publicar en el Mercado';
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

    function validarFormulario(nombre, descripcion, categoriaId, precio, stock, imagen) {
        if (!imagen) {
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
        if (isNaN(stock) || stock < 1) {
            return '❌ El stock debe ser al menos 1 unidad.';
        }
        return null;
    }

    function mostrarMensaje(texto, color) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.color = color;
    }
});
