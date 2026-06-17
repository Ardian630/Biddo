import { supabase } from './supabaseClient.js';

const MONEDERO_BIDDO_ID = 7;

document.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('ops-tbody');
    const alertBanner = document.getElementById('alert-banner');

    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        tbody.innerHTML = `<tr><td colspan="7" class="no-data">⚠️ Sesión expirada. Redirigiendo...</td></tr>`;
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        return;
    }

    const { data: authData, error: rolError } = await supabase
        .from('autenticacion')
        .select('rol_id')
        .eq('autenticacion_id', session.user.id)
        .maybeSingle();

    if (rolError || !authData || (authData.rol_id !== 1 && authData.rol_id !== 2)) {
        tbody.innerHTML = `<tr><td colspan="7" class="no-data">⛔ Acceso denegado.</td></tr>`;
        setTimeout(() => { window.location.href = '2inicio.html'; }, 3000);
        return;
    }

    let tasaCompraGlobal = 1.00;
    let tasaVentaGlobal = 1.00;

    try {
        const { data: tasaConfig } = await supabase
            .from('tasas_config')
            .select('tasa_compra, tasa_venta')
            .order('tasa_id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (tasaConfig) {
            tasaCompraGlobal = parseFloat(tasaConfig.tasa_compra) || 1.00;
            tasaVentaGlobal = parseFloat(tasaConfig.tasa_venta) || 1.00;
        }
    } catch (err) {
        console.error("Error al cargar tasas de cambio de respaldo:", err);
    }

    await consultarOperacionesPendientes();

    async function consultarOperacionesPendientes() {
        try {
            tbody.innerHTML = `<tr><td colspan="7" class="no-data">Buscando registros...</td></tr>`;

            const { data: operaciones, error: opError } = await supabase
                .from('operaciones')
                .select(`
                    operacion_id,
                    monedero_id,
                    monto_bruto,
                    monto_comision,
                    estado_operacion,
                    referencia_interna,
                    fecha_creacion,
                    recargas ( monto_bruto, monto_neto ),
                    retiros ( monto_bruto, monto_neto, monto_bs, banco, titular_cuenta, cedula_titular, telefono )
                `)
                .eq('estado_operacion', 'En Proceso')
                .order('fecha_creacion', { ascending: false });

            if (opError) throw opError;

            if (!operaciones || operaciones.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="no-data">🟢 No hay operaciones pendientes.</td></tr>`;
                return;
            }

            tbody.innerHTML = '';

            operaciones.forEach((op) => {
                tbody.appendChild(crearFilaOperacion(op));
            });

            asignarEventosBotones();

        } catch (err) {
            console.error('Error en módulo administrativo:', err.message);
            tbody.innerHTML = `<tr><td colspan="7" class="no-data">❌ Error: ${err.message}</td></tr>`;
        }
    }

    function obtenerRetiro(op) {
        if (!op.retiros) return null;
        return Array.isArray(op.retiros) ? op.retiros[0] : op.retiros;
    }

    function obtenerRecarga(op) {
        if (!op.recargas) return null;
        return Array.isArray(op.recargas) ? op.recargas[0] : op.recargas;
    }

    function esRetiro(op) {
        return (op.referencia_interna || '').toUpperCase().includes('RETIRO') || !!obtenerRetiro(op);
    }

    function crearFilaOperacion(op) {
        const tr = document.createElement('tr');
        const fecha = new Date(op.fecha_creacion).toLocaleString('es-VE', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const retiro = obtenerRetiro(op);
        const recarga = obtenerRecarga(op);
        const esOpRetiro = esRetiro(op);

        let tipo = 'Recarga';
        let montoBdc = parseFloat(op.monto_bruto) || 0;
        let montoBs = 0;
        let detalleExtra = '';

        if (esOpRetiro) {
            tipo = 'Retiro';
            montoBdc = -Math.abs(parseFloat(op.monto_bruto) || 0);
            if (retiro) {
                montoBdc = -Math.abs(parseFloat(retiro.monto_neto) || 0);
                montoBs = parseFloat(retiro.monto_bs) || 0;
                detalleExtra = `
                    <button class="btn-ver-detalle" 
                        data-banco="${retiro.banco}" 
                        data-titular="${retiro.titular_cuenta}" 
                        data-cedula="${retiro.cedula_titular}" 
                        data-telefono="${retiro.telefono || 'Sin tel'}">
                        <i class="fa-solid fa-eye"></i> Pago Móvil
                    </button>
                `;
            } else {
                montoBs = Math.abs(montoBdc) * tasaVentaGlobal;
                detalleExtra = `
                    <button class="btn-ver-detalle" 
                        data-banco="Desconocido" 
                        data-titular="Desconocido" 
                        data-cedula="—" 
                        data-telefono="—">
                        <i class="fa-solid fa-eye"></i> Ver Datos
                    </button>
                `;
            }
        } else {
            tipo = 'Recarga';
            montoBdc = parseFloat(op.monto_bruto) || 0;
            if (recarga) {
                montoBs = parseFloat(recarga.monto_bruto) || 0;
            } else {
                montoBs = montoBdc * tasaCompraGlobal;
            }
            const refPago = op.referencia_interna.split('-').pop();
            detalleExtra = `<span style="font-size:0.8rem; color:var(--text-muted);">Ref: ${refPago}</span>`;
        }

        const signo = montoBdc >= 0 ? '+' : '';
        const colorBdc = montoBdc >= 0 ? 'var(--neon-green)' : 'var(--error-red)';

        tr.innerHTML = `
            <td>${fecha}</td>
            <td><span class="badge-pending" style="${esOpRetiro ? 'color:#f87171;border-color:rgba(248,113,113,0.3);background:rgba(248,113,113,0.1);' : ''}">${tipo}</span></td>
            <td style="font-family: monospace; color: #a7f3d0; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${op.referencia_interna}</td>
            <td style="color: ${colorBdc}; font-weight: bold;">${signo}${montoBdc.toFixed(2)}</td>
            <td style="color: #fbbf24; font-weight: bold;">${montoBs.toFixed(2)} Bs</td>
            <td style="font-size:0.8rem; color:var(--text-muted); max-width:180px;">${detalleExtra || '—'}</td>
            <td>
                <div class="btn-action-group">
                    <button class="btn-admin btn-approve"
                        data-tipo="${esOpRetiro ? 'retiro' : 'recarga'}"
                        data-id="${op.operacion_id}"
                        data-monedero="${op.monedero_id}"
                        data-monto="${Math.abs(montoBdc)}"
                        data-comision="${parseFloat(op.monto_comision) || 0}">
                        <i class="fa-solid fa-check"></i> Confirmar
                    </button>
                    <button class="btn-admin btn-reject"
                        data-tipo="${esOpRetiro ? 'retiro' : 'recarga'}"
                        data-id="${op.operacion_id}"
                        data-monedero="${op.monedero_id}"
                        data-monto="${Math.abs(montoBdc)}"
                        data-comision="${parseFloat(op.monto_comision) || 0}">
                        <i class="fa-solid fa-xmark"></i> Rechazar
                    </button>
                </div>
            </td>
        `;

        return tr;
    }

    function asignarEventosBotones() {
        document.querySelectorAll('.btn-approve').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const target = e.currentTarget;
                const tipo = target.getAttribute('data-tipo');
                const opId = target.getAttribute('data-id');
                const monederoId = target.getAttribute('data-monedero');
                const monto = parseFloat(target.getAttribute('data-monto'));
                const comision = parseFloat(target.getAttribute('data-comision')) || 0;

                deshabilitarAccionesGlobales();

                try {
                    if (tipo === 'retiro') {
                        await aprobarRetiro(opId, monederoId, monto, comision);
                    } else {
                        await aprobarRecarga(opId, monederoId, monto);
                    }
                    showAlert(`✅ Operación #${opId} confirmada.`, '#4ade80');
                    await consultarOperacionesPendientes();
                } catch (error) {
                    showAlert(`❌ Error: ${error.message}`, '#f87171');
                    await consultarOperacionesPendientes();
                }
            });
        });

        document.querySelectorAll('.btn-reject').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const target = e.currentTarget;
                const tipo = target.getAttribute('data-tipo');
                const opId = target.getAttribute('data-id');
                const monederoId = target.getAttribute('data-monedero');
                const monto = parseFloat(target.getAttribute('data-monto'));
                const comision = parseFloat(target.getAttribute('data-comision')) || 0;

                deshabilitarAccionesGlobales();

                try {
                    if (tipo === 'retiro') {
                        await rechazarRetiro(opId, monederoId, monto, comision);
                    } else {
                        await rechazarRecarga(opId);
                    }
                    showAlert(`❌ Operación #${opId} rechazada.`, '#eab308');
                    await consultarOperacionesPendientes();
                } catch (error) {
                    showAlert(`❌ Error: ${error.message}`, '#f87171');
                    await consultarOperacionesPendientes();
                }
            });
        });
    }

    async function aprobarRecarga(opId, monederoId, bdcAAcreditar) {
        const ahora = new Date().toISOString();

        const { data: monedero, error: monederoErr } = await supabase
            .from('monederos')
            .select('bdc_disponible')
            .eq('monedero_id', monederoId)
            .maybeSingle();

        if (monederoErr) throw monederoErr;

        const nuevoSaldo = (parseFloat(monedero?.bdc_disponible) || 0) + bdcAAcreditar;

        const { error: balanceErr } = await supabase
            .from('monederos')
            .update({ bdc_disponible: nuevoSaldo })
            .eq('monedero_id', monederoId);

        if (balanceErr) throw balanceErr;

        const { error: opErr } = await supabase
            .from('operaciones')
            .update({ estado_operacion: 'Exitosa', fecha_finalizacion: ahora })
            .eq('operacion_id', opId);

        if (opErr) throw opErr;
    }

    async function rechazarRecarga(opId) {
        const { error } = await supabase
            .from('operaciones')
            .update({ estado_operacion: 'Fallida', fecha_finalizacion: new Date().toISOString() })
            .eq('operacion_id', opId);

        if (error) throw error;
    }

    async function aprobarRetiro(opId, monederoId, montoNeto, comision) {
        const ahora = new Date().toISOString();

        const { data: monedero, error: monederoErr } = await supabase
            .from('monederos')
            .select('bdc_retenido')
            .eq('monedero_id', monederoId)
            .maybeSingle();

        if (monederoErr) throw monederoErr;

        const nuevoRetenido = Math.max(0, (parseFloat(monedero?.bdc_retenido) || 0) - montoNeto);

        const { error: balanceErr } = await supabase
            .from('monederos')
            .update({ bdc_retenido: nuevoRetenido })
            .eq('monedero_id', monederoId);

        if (balanceErr) throw balanceErr;

        if (comision > 0) {
            const { data: monederoBiddo } = await supabase
                .from('monederos')
                .select('bdc_disponible')
                .eq('monedero_id', MONEDERO_BIDDO_ID)
                .maybeSingle();

            const nuevoSaldoBiddo = (parseFloat(monederoBiddo?.bdc_disponible) || 0) + comision;

            await supabase
                .from('monederos')
                .update({ bdc_disponible: nuevoSaldoBiddo })
                .eq('monedero_id', MONEDERO_BIDDO_ID);

            await supabase
                .from('operaciones')
                .insert([{
                    monedero_id: MONEDERO_BIDDO_ID,
                    monto_bruto: comision,
                    monto_comision: 0,
                    estado_operacion: 'Exitosa',
                    referencia_interna: `RECAUDACION-COMISION-RETIRO-OP-${opId}`,
                    fecha_creacion: ahora,
                    fecha_finalizacion: ahora
                }]);
        }

        const { error: opErr } = await supabase
            .from('operaciones')
            .update({ estado_operacion: 'Exitosa', fecha_finalizacion: ahora })
            .eq('operacion_id', opId);

        if (opErr) throw opErr;
    }

    async function rechazarRetiro(opId, monederoId, montoNeto, comision) {
        const totalDevolver = montoNeto + comision;

        const { data: monedero, error: monederoErr } = await supabase
            .from('monederos')
            .select('bdc_disponible, bdc_retenido')
            .eq('monedero_id', monederoId)
            .maybeSingle();

        if (monederoErr) throw monederoErr;

        const nuevoDisponible = (parseFloat(monedero?.bdc_disponible) || 0) + totalDevolver;
        const nuevoRetenido = Math.max(0, (parseFloat(monedero?.bdc_retenido) || 0) - montoNeto);

        const { error: balanceErr } = await supabase
            .from('monederos')
            .update({
                bdc_disponible: nuevoDisponible,
                bdc_retenido: nuevoRetenido
            })
            .eq('monedero_id', monederoId);

        if (balanceErr) throw balanceErr;

        const { error: opErr } = await supabase
            .from('operaciones')
            .update({ estado_operacion: 'Fallida', fecha_finalizacion: new Date().toISOString() })
            .eq('operacion_id', opId);

        if (opErr) throw opErr;
    }

    function deshabilitarAccionesGlobales() {
        document.querySelectorAll('.btn-admin').forEach((b) => { b.disabled = true; });
    }

    function showAlert(text, bgColor) {
        alertBanner.textContent = text;
        alertBanner.style.background = bgColor;
        alertBanner.style.color = '#fff';
        alertBanner.style.display = 'block';
        setTimeout(() => { alertBanner.style.display = 'none'; }, 4000);
    }

    // Manejar click en los botones de detalle para abrir el modal
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-ver-detalle');
        if (btn) {
            const banco = btn.getAttribute('data-banco');
            const titular = btn.getAttribute('data-titular');
            const cedula = btn.getAttribute('data-cedula');
            const telefono = btn.getAttribute('data-telefono');

            const modal = document.getElementById('modal-pago-movil');
            const body = document.getElementById('pago-movil-details-body');

            if (modal && body) {
                body.innerHTML = `
                    <div><strong style="color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 2px;">Banco:</strong> <span style="font-size: 1.05rem; font-weight: 600; color: #fff;">${banco}</span></div>
                    <div><strong style="color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 2px;">Titular:</strong> <span style="font-size: 1.05rem; font-weight: 600; color: #fff;">${titular}</span></div>
                    <div><strong style="color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 2px;">Cédula:</strong> <span style="font-size: 1.05rem; font-weight: 600; color: #fff;">${cedula}</span></div>
                    <div><strong style="color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 2px;">Teléfono:</strong> <span style="font-size: 1.05rem; font-weight: 600; color: #fff;">${telefono}</span></div>
                `;
                modal.style.display = 'flex';
            }
        }
    });

    // Cerrar modal
    const modal = document.getElementById('modal-pago-movil');
    const closeBtn = document.getElementById('close-modal-btn');
    const closeBtn2 = document.getElementById('btn-cerrar-modal');

    const ocultarModal = () => {
        if (modal) modal.style.display = 'none';
    };

    if (closeBtn) closeBtn.addEventListener('click', ocultarModal);
    if (closeBtn2) closeBtn2.addEventListener('click', ocultarModal);
    window.addEventListener('click', (e) => {
        if (e.target === modal) ocultarModal();
    });
});
