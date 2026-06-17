import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Elementos del DOM
    const inputBdc = document.getElementById('input-bdc');
    const inputBs = document.getElementById('input-bs');
    const selectCuentaGuardada = document.getElementById('select-cuenta-guardada');
    const nuevaCuentaFields = document.getElementById('nueva-cuenta-fields');
    
    const selectBanco = document.getElementById('banco');
    const inputTitular = document.getElementById('titular-cuenta');
    const selectDocType = document.getElementById('doc-type');
    const inputDocNum = document.getElementById('doc-num');
    const inputTelefono = document.getElementById('telefono');
    const checkboxGuardarCuenta = document.getElementById('guardar-cuenta-check');

    const formRetiro = document.getElementById('form-retiro');
    const mensajeStatus = document.getElementById('mensaje-status');
    const btnSubmit = document.getElementById('btn-submit-retiro');
    const saldoLabel = document.getElementById('saldo-disponible');
    const txtComision = document.getElementById('txt-comision');
    const txtTotalDeducir = document.getElementById('txt-total-deducir');

    // 2. Variables de control global
    let tasaVentaGlobal = 1.00;
    let factorComision = 0;
    let monederoGlobal = null;
    let userUUID = null;

    // 3. Validar autenticación
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }

    userUUID = session.user.id;

    // Inicialización global
    await inicializarDatos();

    // 4. Lógica de selección de cuenta guardada vs nueva
    selectCuentaGuardada.addEventListener('change', () => {
        if (selectCuentaGuardada.value === 'nueva') {
            nuevaCuentaFields.style.display = 'block';
            selectBanco.required = true;
            inputTitular.required = true;
            selectDocType.required = true;
            inputDocNum.required = true;
            inputTelefono.required = true;
        } else {
            nuevaCuentaFields.style.display = 'none';
            selectBanco.required = false;
            inputTitular.required = false;
            selectDocType.required = false;
            inputDocNum.required = false;
            inputTelefono.required = false;
        }
    });

    // 5. Conversión de divisas en tiempo real
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

    // 6. Enviar Formulario de Retiro
    formRetiro.addEventListener('submit', async (e) => {
        e.preventDefault();

        const montoNeto = parseFloat(inputBdc.value);
        const montoBs = parseFloat(inputBs.value);

        if (!monederoGlobal || isNaN(montoNeto) || montoNeto <= 0 || isNaN(montoBs) || montoBs <= 0) {
            mostrarMensaje('❌ Ingresa un monto válido.', '#f87171');
            return;
        }

        const comision = montoNeto * factorComision;
        const totalDebitar = montoNeto + comision;
        const saldoDisponible = parseFloat(monederoGlobal.bdc_disponible) || 0;

        if (totalDebitar > saldoDisponible) {
            mostrarMensaje('❌ Saldo insuficiente para cubrir el retiro y la comisión.', '#f87171');
            return;
        }

        let bancoId, bancoNombre, titularCuenta, cedulaTitular, telefono;

        // Obtener datos de la cuenta según la selección
        if (selectCuentaGuardada.value === 'nueva') {
            bancoId = parseInt(selectBanco.value);
            if (selectBanco.selectedIndex >= 0) {
                bancoNombre = selectBanco.options[selectBanco.selectedIndex].textContent.split(' (')[0];
            }
            titularCuenta = inputTitular.value.trim();
            const docType = selectDocType.value;
            const docNum = inputDocNum.value.trim();
            cedulaTitular = `${docType}-${docNum}`;
            telefono = inputTelefono.value.trim();

            if (isNaN(bancoId) || !bancoId || !titularCuenta || !docNum || !telefono) {
                mostrarMensaje('❌ Por favor, rellena todos los campos de la cuenta.', '#f87171');
                return;
            }
        } else {
            const selectedOpt = selectCuentaGuardada.options[selectCuentaGuardada.selectedIndex];
            bancoId = parseInt(selectedOpt.dataset.bancoId);
            bancoNombre = selectedOpt.dataset.bancoNombre;
            titularCuenta = selectedOpt.dataset.titular;
            cedulaTitular = selectedOpt.dataset.cedula;
            telefono = selectedOpt.dataset.telefono;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Procesando Solicitud...';

        try {
            const fechaISO = new Date().toISOString();

            // PASO A: Si es nueva cuenta y está marcado guardar, guardarla en cuenta_bancaria
            if (selectCuentaGuardada.value === 'nueva' && checkboxGuardarCuenta.checked) {
                const { error: saveAccountError } = await supabase
                    .from('cuenta_bancaria')
                    .insert([{
                        usuario_id: userUUID,
                        banco_id: bancoId,
                        titular_cuenta: titularCuenta,
                        cedula_titular: cedulaTitular,
                        telefono: telefono || null
                    }]);

                if (saveAccountError) console.error("Error no crítico al registrar cuenta:", saveAccountError.message);
            }

            // PASO B: Insertar en la tabla maestra 'operaciones'
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

            // PASO C: Insertar en la tabla 'retiros' sin columna numero_cuenta (Pago Móvil)
            const { error: retiroError } = await supabase
                .from('retiros')
                .insert([{
                    operacion_id: nuevaOperacion.operacion_id,
                    banco: bancoNombre,
                    titular_cuenta: titularCuenta,
                    cedula_titular: cedulaTitular,
                    telefono: telefono || null,
                    monto_bruto: totalDebitar,
                    monto_neto: montoNeto,
                    monto_bs: montoBs,
                    fecha_registro: fechaISO
                }]);

            if (retiroError) throw retiroError;

            // PASO D: Actualizar monederos (debitar disponible, retener neto)
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

    // 7. Cargar datos iniciales
    async function inicializarDatos() {
        try {
            // A. Cargar Monedero del Usuario
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

            // B. Cargar Tasas de Configuración
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
            txtComision.textContent = `Comisión de retiro: ${(factorComision * 100).toFixed(2)}%`;

            // C. Cargar Bancos de la base de datos
            const { data: bancos, error: bancosError } = await supabase
                .from('banco')
                .select('banco_id, nombre_banco, codigo_banco')
                .order('nombre_banco', { ascending: true });

            if (bancosError) throw bancosError;

            selectBanco.innerHTML = '<option value="">Selecciona un banco</option>';
            if (bancos && bancos.length > 0) {
                bancos.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.banco_id;
                    opt.textContent = `${b.nombre_banco} (${b.codigo_banco})`;
                    selectBanco.appendChild(opt);
                });
            }

            // D. Cargar Cuentas Guardadas del Usuario
            const { data: cuentas, error: cuentasError } = await supabase
                .from('cuenta_bancaria')
                .select(`
                    cuenta_id,
                    titular_cuenta,
                    cedula_titular,
                    telefono,
                    banco ( banco_id, nombre_banco, codigo_banco )
                `)
                .eq('usuario_id', userUUID);

            if (cuentasError) console.error("Error al cargar cuentas bancarias:", cuentasError.message);

            selectCuentaGuardada.innerHTML = '<option value="nueva">— Registrar nueva cuenta —</option>';
            if (cuentas && cuentas.length > 0) {
                cuentas.forEach(c => {
                    if (c.banco) {
                        const opt = document.createElement('option');
                        opt.value = c.cuenta_id;
                        opt.textContent = `${c.banco.nombre_banco} — ${c.titular_cuenta}`;
                        opt.dataset.bancoId = c.banco.banco_id;
                        opt.dataset.bancoNombre = c.banco.nombre_banco;
                        opt.dataset.titular = c.titular_cuenta;
                        opt.dataset.cedula = c.cedula_titular;
                        opt.dataset.telefono = c.telefono || '';
                        selectCuentaGuardada.appendChild(opt);
                    }
                });
            }

        } catch (error) {
            console.error('Error cargando datos de configuración:', error.message);
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
