import { supabase } from './supabaseClient.js';

console.log("🚀 El archivo operaciones-pendientes.js ha sido cargado en el navegador.");

document.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('ops-tbody');
    const alertBanner = document.getElementById('alert-banner');

    console.log("🚀 DOM completamente cargado. Iniciando verificación de sesión...");

    /**
     * 1. FILTRO DE SEGURIDAD Y ROLES (ADMIN / MODERADOR)
     */
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError) {
        console.error("❌ Fallo al obtener la sesión de Supabase:", authError.message);
        tbody.innerHTML = `<tr><td colspan="7" class="no-data">❌ Error de autenticación: ${authError.message}</td></tr>`;
        return;
    }

    if (!session) {
        console.warn("⚠️ No hay una sesión activa. Redireccionando a login.html");
        tbody.innerHTML = `<tr><td colspan="7" class="no-data">⚠️ Sesión expirada. Redirigiendo...</td></tr>`;
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        return;
    }

    console.log("🚀 Usuario autenticado con UUID:", session.user.id);

    const { data: authData, error: rolError } = await supabase
        .from('autenticacion')
        .select('rol_id')
        .eq('autenticacion_id', session.user.id)
        .maybeSingle();

    if (rolError) {
        console.error("❌ Fallo al consultar el rol del usuario:", rolError.message);
        tbody.innerHTML = `<tr><td colspan="7" class="no-data">❌ Error leyendo permisos: ${rolError.message}</td></tr>`;
        return;
    }

    console.log("🚀 Datos de rol obtenidos de la DB:", authData);

    if (!authData || (authData.rol_id !== 1 && authData.rol_id !== 2)) {
        console.warn("⚠️ El usuario no posee rango administrativo.");
        tbody.innerHTML = `<tr><td colspan="7" class="no-data">⛔ Acceso denegado. Se requieren permisos administrativos.</td></tr>`;
        setTimeout(() => { window.location.href = '2inicio.html'; }, 3000);
        return;
    }

    console.log("🚀 Permisos validados con éxito. Ejecutando consulta de registros...");
    await consultarOperacionesPendientes();

    /**
     * 2. OBTENER OPERACIONES "En Proceso" DESDE LA TABLA RECARGAS
     */
    async function consultarOperacionesPendientes() {
        try {
            console.log("🚀 Entrando a consultarOperacionesPendientes()...");
            tbody.innerHTML = `<tr><td colspan="7" class="no-data">Buscando registros en la base de datos...</td></tr>`;

            // 1. Traemos TODAS las operaciones directo de la tabla maestra para asegurar compatibilidad total
            const { data: operaciones, error: opError } = await supabase
                .from('operaciones')
                .select(`
                    operacion_id,
                    monedero_id,
                    monto_bruto,
                    estado_operacion,
                    referencia_interna,
                    fecha_creacion,
                    recargas (
                        referencia_pago,
                        monto_bruto
                    )
                `)
                .order('fecha_creacion', { ascending: false });

            if (opError) {
                console.error("❌ Error al traer operaciones desde la DB:", opError.message);
                throw opError;
            }

            console.log("📊 Datos brutos recibidos de la tabla operaciones:", operaciones);

            if (!operaciones || operaciones.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="no-data">ℹ️ La base de datos no devolvió ninguna operación en la tabla maestra.</td></tr>`;
                return;
            }

            // 2. Filtramos en el Frontend ignorando mayúsculas, minúsculas y espacios
            const operacionesFiltradas = operaciones.filter(op => {
                if (!op.estado_operacion) return false;
                return op.estado_operacion.trim().toLowerCase() === "en proceso";
            });

            console.log("🔍 Operaciones que pasaron el filtro 'En Proceso':", operacionesFiltradas);

            if (operacionesFiltradas.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="no-data">🟢 Excelente: No hay operaciones pendientes por procesar en este momento.</td></tr>`;
                return;
            }

            tbody.innerHTML = ''; // Limpiamos el texto de carga

            // 3. Renderizamos las operaciones pendientes
            operacionesFiltradas.forEach(op => {
                const tr = document.createElement('tr');
                
                const fecha = new Date(op.fecha_creacion).toLocaleString('es-VE', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                // Verificamos si existe el detalle en la tabla subordinada de recargas
                const tieneRecarga = op.recargas && op.recargas.length > 0;
                
                // Extraemos los datos usando los nombres reales de columna
                const refBanco = tieneRecarga ? op.recargas[0].referencia_pago : 'N/A';
                const montoBs = tieneRecarga ? parseFloat(op.recargas[0].monto_bruto) : 0;
                const montoBdc = parseFloat(op.monto_bruto) || 0;

                tr.innerHTML = `
                    <td>${fecha}</td>
                    <td style="font-family: monospace; color: #a7f3d0;">${op.referencia_interna}</td>
                    <td style="font-weight: 600;">${refBanco}</td>
                    <td style="color: var(--neon-green); font-weight: bold;">+${montoBdc.toFixed(2)}</td>
                    <td>${montoBs > 0 ? montoBs.toFixed(2) : '0.00'} Bs</td>
                    <td><span class="badge-pending">${op.estado_operacion}</span></td>
                    <td>
                        <div class="btn-action-group">
                            <button class="btn-admin btn-approve" data-id="${op.operacion_id}" data-monedero="${op.monedero_id}" data-monto="${op.monto_bruto}">
                                <i class="fa-solid fa-check"></i> Confirmar
                            </button>
                            <button class="btn-admin btn-reject" data-id="${op.operacion_id}">
                                <i class="fa-solid fa-xmark"></i> Rechazar
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            asignarEventosBotones();

        } catch (err) {
            console.error("❌ Error crítico en el renderizado:", err.message);
            tbody.innerHTML = `<tr><td colspan="7" class="no-data">❌ Error al procesar datos: ${err.message}</td></tr>`;
        }
    }

    function asignarEventosBotones() {
        // EVENTO PARA CONFIRMAR / APROBAR RECARGA
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const opId = e.currentTarget.getAttribute('data-id');
                const monederoId = e.currentTarget.getAttribute('data-monedero');
                const bdcAAcreditar = parseFloat(e.currentTarget.getAttribute('data-monto'));

                deshabilitarAccionesGlobales();

                try {
                    const ahora = new Date().toISOString();

                    // PASO A: Consultar saldo actual utilizando el nombre de columna real 'bdc_disponible'
                    const { data: monedero, error: monederoErr } = await supabase
                        .from('monederos')
                        .select('bdc_disponible')
                        .eq('monedero_id', monederoId)
                        .maybeSingle(); // Usamos maybeSingle por si no encuentra el registro

                    if (monederoErr) throw monederoErr;

                    let nuevoSaldoCalculado = 0;

                    if (!monedero) {
                        // REGLA DE NEGOCIO: Si el monedero no tiene BDC registrados o no existe el registro base, 
                        // se generan/emiten de forma automática los BDC solicitados directamente desde el rol administrativo.
                        console.log(`💡 Monedero #${monederoId} no inicializado. Generando balance inicial...`);
                        nuevoSaldoCalculado = bdcAAcreditar;
                    } else {
                        // Si ya tiene balance, extraemos su valor actual y le sumamos los nuevos BDC
                        const saldoActual = parseFloat(monedero.bdc_disponible) || 0;
                        nuevoSaldoCalculado = saldoActual + bdcAAcreditar;
                    }

                    // PASO B: Actualizar el balance en la columna correcta 'bdc_disponible'
                    const { error: balanceErr } = await supabase
                        .from('monederos')
                        .update({ bdc_disponible: nuevoSaldoCalculado })
                        .eq('monedero_id', monederoId);

                    if (balanceErr) throw balanceErr;

                    // PASO C: Cambiar el estado de la operación a 'Exitosa'
                    const { error: opErr } = await supabase
                        .from('operaciones')
                        .update({
                            estado_operacion: 'Exitosa',
                            fecha_finalizacion: ahora
                        })
                        .eq('operacion_id', opId);

                    if (opErr) throw opErr;

                    showAlert(`✅ Operación #${opId} conciliada con éxito. Fondos acreditados al monedero.`, "#4ade80");
                    await consultarOperacionesPendientes(); 

                } catch (error) {
                    console.error("Fallo en el proceso de abono:", error.message);
                    showAlert(`❌ Error en abono: ${error.message}`, "#f87171");
                    await consultarOperacionesPendientes();
                }
            });
        });

        // EVENTO PARA RECHAZAR RECARGA
        document.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const opId = e.currentTarget.getAttribute('data-id');
                
                deshabilitarAccionesGlobales();

                try {
                    const { error } = await supabase
                        .from('operaciones')
                        .update({
                            estado_operacion: 'Fallida',
                            fecha_finalizacion: new Date().toISOString()
                        })
                        .eq('operacion_id', opId);

                    if (error) throw error;

                    showAlert(`❌ La operación fue marcada como 'Fallida'.`, "#eab308");
                    await consultarOperacionesPendientes();

                } catch (error) {
                    console.error("Error al rechazar:", error.message);
                    showAlert(`❌ Error al actualizar estado de rechazo: ${error.message}`, "#f87171");
                    await consultarOperacionesPendientes();
                }
            });
        });
    }

    function deshabilitarAccionesGlobales() {
        document.querySelectorAll('.btn-admin').forEach(b => b.disabled = true);
    }

    function showAlert(text, bgColor) {
        alertBanner.textContent = text;
        alertBanner.style.background = bgColor;
        alertBanner.style.color = "#fff";
        alertBanner.style.display = 'block';
        setTimeout(() => { alertBanner.style.display = 'none'; }, 4000);
    }
});