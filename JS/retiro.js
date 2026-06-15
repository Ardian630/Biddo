import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const inputBdc = document.getElementById('input-bdc');
    const inputBs = document.getElementById('input-bs');
    const inputBanco = document.getElementById('banco');
    const inputCuenta = document.getElementById('numero-cuenta');
    const inputTitular = document.getElementById('titular-cuenta');
    const inputCedula = document.getElementById('cedula-titular');
    const inputTelefono = document.getElementById('telefono');
    const formRetiro = document.getElementById('form-retiro');
    const mensajeStatus = document.getElementById('mensaje-status');
    const btnSubmit = document.getElementById('btn-submit-retiro');
    const saldoLabel = document.getElementById('saldo-disponible');
    const txtComision = document.getElementById('txt-comision');
    const txtTotalDeducir = document.getElementById('txt-total-deducir');

    let tasaVentaGlobal = 1.00;
    let factorComision = 0;
    let monederoGlobal = null;

    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const userUUID = session.user.id;
    await inicializarDatos();

    inputBdc.addEventListener('input', () => {
        const bdc = parseFloat(inputBdc.value);
        if (isNaN(bdc) || bdc <= 0) {
            inputBs.value = '';
            actualizarResumen(0);
            return;
        }
        inputBs.value = (bdc * tasaVentaGlobal).toFixed(2);
        actualizarResumen(bdc);
    });

    inputBs.addEventListener('input', () => {
        const bs = parseFloat(inputBs.value);
        if (isNaN(bs) || bs <= 0) {
            inputBdc.value = '';
            actualizarResumen(0);
            return;
        }
        const bdc = bs / tasaVentaGlobal;
        inputBdc.value = bdc.toFixed(2);
        actualizarResumen(bdc);
    });

    formRetiro.addEventListener('submit', async (e) => {
        e.preventDefault();

        const montoNeto = parseFloat(inputBdc.value);
        const montoBs = parseFloat(inputBs.value);
        const banco = inputBanco.value.trim();
        const numeroCuenta = inputCuenta.value.trim();
        const titularCuenta = inputTitular.value.trim();
        const cedulaTitular = inputCedula.value.trim();
        const telefono = inputTelefono.value.trim();

        if (!monederoGlobal || isNaN(montoNeto) || montoNeto <= 0 || isNaN(montoBs) || montoBs <= 0) {
            mostrarMensaje('❌ Ingresa un monto válido.', '#f87171');
            return;
        }

        if (!banco || !numeroCuenta || !titularCuenta || !cedulaTitular) {
            mostrarMensaje('❌ Completa todos los datos bancarios obligatorios.', '#f87171');
            return;
        }

        const comision = montoNeto * factorComision;
        const totalDebitar = montoNeto + comision;
        const saldoDisponible = parseFloat(monederoGlobal.bdc_disponible) || 0;

        if (totalDebitar > saldoDisponible) {
            mostrarMensaje('❌ Saldo insuficiente para cubrir el retiro y la comisión.', '#f87171');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Procesando Solicitud...';

        try {
            const fechaISO = new Date().toISOString();

            const { data: nuevaOperacion, error: opError } = await supabase
                .from('operaciones')
                .insert([{
                    monedero_id: monederoGlobal.monedero_id,
                    monto_bruto: -totalDebitar,
                    monto_comision: comision,
                    estado_operacion: 'En Proceso',
                    referencia_interna: `RETIRO-BANCARIO-${Date.now()}`,
                    fecha_creacion: fechaISO,
                    fecha_finalizacion: null
                }])
                .select('operacion_id')
                .single();

            if (opError) throw opError;

            const { error: retiroError } = await supabase
                .from('retiros')
                .insert([{
                    operacion_id: nuevaOperacion.operacion_id,
                    banco,
                    numero_cuenta: numeroCuenta,
                    titular_cuenta: titularCuenta,
                    cedula_titular: cedulaTitular,
                    telefono: telefono || null,
                    monto_bruto: totalDebitar,
                    monto_neto: montoNeto,
                    monto_bs: montoBs,
                    fecha_registro: fechaISO
                }]);

            if (retiroError) throw retiroError;

            const nuevoDisponible = saldoDisponible - totalDebitar;
            const nuevoRetenido = (parseFloat(monederoGlobal.bdc_retenido) || 0) + montoNeto;

            const { error: monederoError } = await supabase
                .from('monederos')
                .update({
                    bdc_disponible: nuevoDisponible,
                    bdc_retenido: nuevoRetenido
                })
                .eq('monedero_id', monederoGlobal.monedero_id);

            if (monederoError) throw monederoError;

            mostrarMensaje('✅ Solicitud de retiro enviada. Los fondos quedaron retenidos hasta la aprobación.', '#4ade80');
            formRetiro.reset();
            txtTotalDeducir.textContent = '';

            setTimeout(() => {
                window.location.href = 'mimonedero.html';
            }, 3000);

        } catch (error) {
            console.error('Error al registrar retiro:', error.message);
            mostrarMensaje(`❌ Error: ${error.message}`, '#f87171');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Enviar Solicitud de Retiro';
        }
    });

    async function inicializarDatos() {
        try {
            const { data: monedero, error: monederoError } = await supabase
                .from('monederos')
                .select('monedero_id, bdc_disponible, bdc_retenido')
                .eq('usuario_id', userUUID)
                .maybeSingle();

            if (monederoError) throw monederoError;

            if (!monedero) {
                mostrarMensaje('⚠️ No posees un monedero activo.', '#f87171');
                btnSubmit.disabled = true;
                return;
            }

            monederoGlobal = monedero;
            if (saldoLabel) {
                saldoLabel.textContent = `${parseFloat(monedero.bdc_disponible).toFixed(2)} BDC`;
            }

            const { data: tasaConfig } = await supabase
                .from('tasas_config')
                .select('tasa_venta, comision_retiro')
                .order('tasa_id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (tasaConfig) {
                tasaVentaGlobal = parseFloat(tasaConfig.tasa_venta) || 1.00;
                factorComision = parseFloat(tasaConfig.comision_retiro) || 0;
            }

            if (isNaN(factorComision)) factorComision = 0;

            const porcentajeVisual = factorComision * 100;
            txtComision.textContent = `Comisión de retiro: ${porcentajeVisual.toFixed(2)}%`;

        } catch (error) {
            console.error('Error cargando datos:', error.message);
        }
    }

    function actualizarResumen(montoNeto) {
        if (montoNeto <= 0 || !monederoGlobal) {
            txtTotalDeducir.textContent = '';
            return;
        }

        const comision = montoNeto * factorComision;
        const totalDebitar = montoNeto + comision;
        const saldoDisponible = parseFloat(monederoGlobal.bdc_disponible) || 0;

        txtTotalDeducir.textContent = `Total a descontar: ${totalDebitar.toFixed(2)} BDC (${montoNeto.toFixed(2)} retiro + ${comision.toFixed(2)} comisión)`;

        if (totalDebitar > saldoDisponible) {
            txtTotalDeducir.style.color = '#f87171';
            txtTotalDeducir.textContent += ' ❌ (Saldo insuficiente)';
        } else {
            txtTotalDeducir.style.color = '#4ade80';
        }
    }

    function mostrarMensaje(texto, colorFondo) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.background = colorFondo;
        mensajeStatus.style.color = '#fff';
        mensajeStatus.style.display = 'block';
    }
});
