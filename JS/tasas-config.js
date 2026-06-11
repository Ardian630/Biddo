import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const formTasas = document.getElementById('form-tasas');
    const inputReferencia = document.getElementById('tasa-referencia');
    const inputMargenCompra = document.getElementById('margen-compra');
    const inputMargenVenta = document.getElementById('margen-venta');
    
    const previewCompra = document.getElementById('preview-compra');
    const previewVenta = document.getElementById('preview-venta');
    
    const inputComisionTransferencia = document.getElementById('comision-transferencia');
    const inputComisionRetiro = document.getElementById('comision-retiro');
    const inputVentaFija = document.getElementById('venta-fija');
    const inputVentaPorcentual = document.getElementById('venta-porcentual');
    
    const mensajeStatus = document.getElementById('mensaje-status');
    const btnSubmit = document.getElementById('btn-submit-tasas');

    /**
     * 1. PROTECCIÓN DE RUTA Y CONTROL DE ACCESO (ROLES 1 Y 2)
     */
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }

    // Comprobar si tiene rango suficiente para estar en este módulo administrativo
    const { data: authData } = await supabase
        .from('autenticacion')
        .select('rol_id')
        .eq('autenticacion_id', session.user.id)
        .maybeSingle();

    if (!authData || (authData.rol_id !== 1 && authData.rol_id !== 2)) {
        console.warn("Acceso denegado: permisos insuficientes.");
        window.location.href = '2inicio.html';
        return;
    }

    // Si pasa el filtro, cargar los valores actuales que están rigiendo la app
    await cargarUltimasTasas();

    async function cargarUltimasTasas() {
        try {
            const { data: ut, error } = await supabase
                .from('tasas_config')
                .select('*')
                .order('tasa_id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;

            if (ut) {
                inputReferencia.value = parseFloat(ut.tasa_referencia).toFixed(2);
                
                // Reconstruir porcentajes de margen a partir de los valores monetarios reales de la BD
                const ref = parseFloat(ut.tasa_referencia);
                const compra = parseFloat(ut.tasa_compra);
                const venta = parseFloat(ut.tasa_venta);

                // Fórmulas de despeje inverso para rellenar los inputs de porcentajes
                inputMargenCompra.value = (((compra - ref) / ref) * 100).toFixed(2);
                inputMargenVenta.value = (((ref - venta) / ref) * 100).toFixed(2);

                // Multiplicamos por 100 para mostrarlos como enteros legibles (ej: 0.02 -> 2.00)
                inputComisionTransferencia.value = (parseFloat(ut.comision_transferencia) * 100).toFixed(2);
                inputComisionRetiro.value = (parseFloat(ut.comision_retiro) * 100).toFixed(2);
                inputVentaFija.value = parseFloat(ut.venta_comision_fija).toFixed(2);
                inputVentaPorcentual.value = (parseFloat(ut.venta_comision_porcentual) * 100).toFixed(2);

                calcularPrevisiones();
            }
        } catch (err) {
            console.error("Error al poblar formulario con datos previos:", err.message);
        }
    }

    /**
     * 2. LOGICA MATEMÁTICA EN TIEMPO REAL
     */
    function calcularPrevisiones() {
        const ref = parseFloat(inputReferencia.value) || 0;
        const porcCompra = parseFloat(inputMargenCompra.value) || 0;
        const porcVenta = parseFloat(inputMargenVenta.value) || 0;

        if (ref <= 0) {
            previewCompra.textContent = '0.00 Bs';
            previewVenta.textContent = '0.00 Bs';
            return;
        }

        // Fórmulas solicitadas:
        // Tasa Compra = Referencia + Porcentaje por encima (ej. 100 + 5% = 105)
        const valorCompraAbsoluto = ref + (ref * (porcCompra / 100));
        // Tasa Venta = Referencia - Porcentaje por debajo (ej. 100 - 5% = 95)
        const valorVentaAbsoluto = ref - (ref * (porcVenta / 100));

        previewCompra.textContent = `${valorCompraAbsoluto.toFixed(2)} Bs`;
        previewVenta.textContent = `${valorVentaAbsoluto.toFixed(2)} Bs`;

        return { valorCompraAbsoluto, valorVentaAbsoluto };
    }

    // Vinculamos la ejecución del render matemático a los eventos de teclado
    inputReferencia.addEventListener('input', calcularPrevisiones);
    inputMargenCompra.addEventListener('input', calcularPrevisiones);
    inputMargenVenta.addEventListener('input', calcularPrevisiones);

    /**
     * 3. ENVÍO SEGURO DE REGISTROS A SUPABASE
     */
    formTasas.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ref = parseFloat(inputReferencia.value);
        const { valorCompraAbsoluto, valorVentaAbsoluto } = calcularPrevisiones();
        
        // Conversión inversa de seguridad para guardar porcentajes en formato decimal plano hacia PostgreSQL (ej: 2% -> 0.02)
        const comisionTransfDecimal = (parseFloat(inputComisionTransferencia.value) || 0) / 100;
        const comisionRetiroDecimal = (parseFloat(inputComisionRetiro.value) || 0) / 100;
        const comisionVentaPorcDecimal = (parseFloat(inputVentaPorcentual.value) || 0) / 100;
        const comisionVentaFija = parseFloat(inputVentaFija.value) || 0;

        if (isNaN(ref) || ref <= 0 || valorVentaAbsoluto < 0) {
            mostrarMensaje("❌ Verifica los valores de las tasas y los márgenes matemáticos.", "#f87171");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = "Guardando cambios en el sistema...";

        try {
            const { error } = await supabase
                .from('tasas_config')
                .insert([{
                    tasa_referencia: ref,
                    tasa_compra: valorCompraAbsoluto,
                    tasa_venta: valorVentaAbsoluto,
                    comision_transferencia: comisionTransfDecimal,
                    comision_retiro: comisionRetiroDecimal,
                    venta_comision_fija: comisionVentaFija,
                    venta_comision_porcentual: comisionVentaPorcDecimal
                }]);

            if (error) throw error;

            mostrarMensaje("✅ Parámetros financieros actualizados con éxito globales.", "#4ade80");
            
            setTimeout(() => {
                window.location.href = '2inicio.html';
            }, 2500);

        } catch (error) {
            console.error("Error al salvar tasas_config:", error.message);
            mostrarMensaje(`❌ Error de sincronización: ${error.message}`, "#f87171");
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Actualizar Configuración de Tasas";
        }
    });

    function mostrarMensaje(texto, colorFondo) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.background = colorFondo;
        mensajeStatus.style.color = "#fff";
        mensajeStatus.style.display = 'block';
    }
});