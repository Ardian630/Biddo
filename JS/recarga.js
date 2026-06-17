import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const inputBdc = document.getElementById('input-bdc');
    const inputBs = document.getElementById('input-bs');
    const inputReferencia = document.getElementById('referencia');
    const formRecarga = document.getElementById('form-recarga');
    const mensajeStatus = document.getElementById('mensaje-status');
    const btnSubmit = document.getElementById('btn-submit-recarga');

    // Variables de control global
    let tasaCompraGlobal = 1.00; 
    let monederoIdGlobal = null;
    let bdcRetenidoGlobal = 0;

    /**
     * 1. VALIDAR AUTENTICACIÓN Y CARGAR ÚLTIMA TASA CONFIGURADA
     */
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const userUUID = session.user.id;
    await inicializarDatos();

    async function inicializarDatos() {
        try {
            // A. Obtener el monedero_id y bdc_retenido del usuario conectado
            const { data: monedero, error: monederoError } = await supabase
                .from('monederos')
                .select('monedero_id, bdc_retenido')
                .eq('usuario_id', userUUID)
                .maybeSingle();

            if (monederoError) throw monederoError;
            if (!monedero) {
                mostrarMensaje("⚠️ No posees un monedero activo. Contacta a soporte.", "#f87171");
                btnSubmit.disabled = true;
                return;
            }
            monederoIdGlobal = monedero.monedero_id;
            bdcRetenidoGlobal = parseFloat(monedero.bdc_retenido) || 0;

            // B. Traer el ÚLTIMO registro de la tabla tasas_config para la conversión en vivo
            const { data: tasaConfig, error: tasaError } = await supabase
                .from('tasas_config')
                .select('tasa_compra')
                .order('tasa_id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (tasaError) throw tasaError;

            if (tasaConfig) {
                tasaCompraGlobal = parseFloat(tasaConfig.tasa_compra) || 1.00;
            } else {
                mostrarMensaje("⚠️ Alerta: No hay tasas configuradas en el sistema.", "#eab308");
            }

        } catch (error) {
            console.error("Error cargando configuración inicial:", error.message);
        }
    }

    /**
     * 2. CONVERSIÓN EN TIEMPO REAL Y VALIDACIÓN DE INPUTS
     */
    // Prevenir caracteres no numéricos como 'e', '-', '+' en los campos de monto
    const prevenirCaracteresInvalidos = (e) => {
        if (['e', 'E', '+', '-'].includes(e.key)) {
            e.preventDefault();
        }
    };
    inputBdc.addEventListener('keydown', prevenirCaracteresInvalidos);
    inputBs.addEventListener('keydown', prevenirCaracteresInvalidos);

    // Permitir solo números y un máximo de 8 dígitos en la referencia
    inputReferencia.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
        if (this.value.length > 8) {
            this.value = this.value.slice(0, 8);
        }
    });

    inputBdc.addEventListener('input', () => {
        const bdc = parseFloat(inputBdc.value);
        if (isNaN(bdc) || bdc <= 0) {
            inputBs.value = '';
            return;
        }
        const equivalenciaBs = bdc * tasaCompraGlobal;
        inputBs.value = equivalenciaBs.toFixed(2);
    });

    inputBs.addEventListener('input', () => {
        const bs = parseFloat(inputBs.value);
        if (isNaN(bs) || bs <= 0) {
            inputBdc.value = '';
            return;
        }
        const bdcEquivalente = bs / tasaCompraGlobal;
        inputBdc.value = bdcEquivalente.toFixed(2);
    });

    /**
     * 3. PROCESAMIENTO DEL FORMULARIO E INSERCIÓN SEGURO EN BD
     */
    formRecarga.addEventListener('submit', async (e) => {
        e.preventDefault();

        const bdcSolicitados = parseFloat(inputBdc.value);
        const bsTransferidos = parseFloat(inputBs.value);
        const referenciaBancaria = inputReferencia.value.trim();

        if (!monederoIdGlobal || isNaN(bdcSolicitados) || isNaN(bsTransferidos) || !referenciaBancaria) {
            mostrarMensaje("❌ Por favor, complete todos los campos correctamente.", "#f87171");
            return;
        }

        if (bdcSolicitados <= 0 || bsTransferidos <= 0) {
            mostrarMensaje("❌ El monto a recargar debe ser mayor a 0.", "#f87171");
            return;
        }

        if (referenciaBancaria.length < 6 || referenciaBancaria.length > 8) {
            mostrarMensaje("❌ La referencia de pago debe tener entre 6 y 8 dígitos numéricos.", "#f87171");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = "Procesando Solicitud...";

        try {
            const fechaActualISO = new Date().toISOString();

            // PASO A: Insertar en la tabla maestra 'operaciones' (Guarda los BDC solicitados)
            const { data: nuevaOperacion, error: opError } = await supabase
                .from('operaciones')
                .insert([{
                    monedero_id: monederoIdGlobal,
                    monto_bruto: bdcSolicitados,
                    monto_comision: 0,
                    estado_operacion: 'En Proceso',
                    referencia_interna: `RECARGA-PAGOMOVIL-${referenciaBancaria}`,
                    fecha_creacion: fechaActualISO,
                    fecha_finalizacion: null 
                }])
                .select('operacion_id')
                .single();

            if (opError) throw opError;

            // PASO B: Insertar en la tabla subordinada 'recargas' (en minúsculas)
            // Vinculamos usando las columnas reales que tu tabla administrativa lee
            const { error: recargaError } = await supabase
                .from('recargas')
                .insert([{
                    operacion_id: nuevaOperacion.operacion_id,
                    referencia_pago: referenciaBancaria, 
                    monto_bruto: bsTransferidos,        // Bolívares pagados
                    monto_neto: bdcSolicitados,         // Fichas BDC solicitadas (Satisface el NOT NULL)
                    fecha_registro: fechaActualISO
                }]);

            if (recargaError) throw recargaError;

            // PASO C: Sumar el monto solicitado al saldo retenido en el monedero
            const nuevoRetenido = bdcRetenidoGlobal + bdcSolicitados;
            const { error: walletUpdateErr } = await supabase
                .from('monederos')
                .update({ bdc_retenido: nuevoRetenido })
                .eq('monedero_id', monederoIdGlobal);

            if (walletUpdateErr) throw walletUpdateErr;

            // ÉXITO GLOBAL
            mostrarMensaje("✅ Solicitud enviada correctamente. El estado actual de la operación es 'En Proceso'.", "#4ade80");
            formRecarga.reset();

            setTimeout(() => {
                window.location.href = 'mimonedero.html';
            }, 3000);

        } catch (error) {
            console.error("Error al registrar la recarga:", error.message);
            mostrarMensaje(`❌ Error de escritura: ${error.message}`, "#f87171");
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Enviar Solicitud de Recarga";
        }
    });

    function mostrarMensaje(texto, colorFondo) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.background = colorFondo;
        mensajeStatus.style.color = "#fff";
        mensajeStatus.style.display = 'block';
    }
});