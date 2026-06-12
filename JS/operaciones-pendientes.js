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
        tbody.innerHTML = `<tr><td colspan="6" class="no-data">❌ Error de autenticación: ${authError.message}</td></tr>`;
        return;
    }

    if (!session) {
        console.warn("⚠️ No hay una sesión activa. Redireccionando a login.html");
        tbody.innerHTML = `<tr><td colspan="6" class="no-data">⚠️ Sesión expirada. Redirigiendo...</td></tr>`;
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        return;
    }

    // Validar rango administrativo
    const { data: authData, error: rolError } = await supabase
        .from('autenticacion')
        .select('rol_id')
        .eq('autenticacion_id', session.user.id)
        .maybeSingle();

    if (rolError) {
        console.error("❌ Fallo al consultar el rol del usuario:", rolError.message);
        tbody.innerHTML = `<tr><td colspan="6" class="no-data">❌ Error leyendo permisos: ${rolError.message}</td></tr>`;
        return;
    }

    if (!authData || (authData.rol_id !== 1 && authData.rol_id !== 2)) {
        console.warn("⚠️ El usuario no posee rango administrativo.");
        tbody.innerHTML = `<tr><td colspan="6" class="no-data">⛔ Acceso denegado. Se requieren permisos administrativos.</td></tr>`;
        setTimeout(() => { window.location.href = '2inicio.html'; }, 3000);
        return;
    }

    console.log("🚀 Permisos validados con éxito. Ejecutando consulta con JOIN...");
    await consultarOperacionesPendientes();

    /**
     * 2. OBTENER OPERACIONES Y HACER JOIN CON RECARGAS
     */
    async function consultarOperacionesPendientes() {
        try {
            tbody.innerHTML = `<tr><td colspan="6" class="no-data">Buscando registros en la base de datos...</td></tr>`;

            // SOLUCIÓN: Hacemos el JOIN directo pidiendo la columna monto_bruto de la tabla recargas
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
                        monto_bruto
                    )
                `)
                .eq('estado_operacion', 'En Proceso')
                .order('fecha_creacion', { ascending: false });

            if (opError) throw opError;

            console.log("📊 Datos recibidos de la consulta (con JOIN):", operaciones);

            if (!operaciones || operaciones.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="no-data">🟢 Excelente: No hay operaciones pendientes por procesar en este momento.</td></tr>`;
                return;
            }

            tbody.innerHTML = ''; // Limpiamos la tabla para renderizar

            operaciones.forEach(op => {
                const tr = document.createElement('tr');
                
                // Formateamos la fecha_creacion de la tabla operaciones
                const fecha = new Date(op.fecha_creacion).toLocaleString('es-VE', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                // El monto en BDC se extrae del monto_bruto de la tabla operaciones
                const montoBdc = parseFloat(op.monto_bruto) || 0;

                // BLINDAJE PARA EL JOIN: Extraemos recargas.monto_bruto soportando si viene como objeto único o array
                let montoBs = 0;
                if (op.recargas) {
                    if (Array.isArray(op.recargas) && op.recargas.length > 0) {
                        montoBs = parseFloat(op.recargas[0].monto_bruto) || 0;
                    } else if (!Array.isArray(op.recargas)) {
                        montoBs = parseFloat(op.recargas.monto_bruto) || 0;
                    }
                }

                tr.innerHTML = `
                    <td>${fecha}</td>
                    <td style="font-family: monospace; color: #a7f3d0;">${op.referencia_interna}</td>
                    <td style="color: var(--neon-green); font-weight: bold;">+${montoBdc.toFixed(2)}</td>
                    <td style="color: #fbbf24; font-weight: bold;">${montoBs.toFixed(2)} Bs</td>
                    <td><span class="badge-pending">${op.estado_operacion}</span></td>
                    <td>
                        <div class="btn-action-group">
                            <button class="btn-admin btn-approve" data-id="${op.operacion_id}" data-monedero="${op.monedero_id}" data-monto="${montoBdc}">
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
            console.error("❌ Error crítico en el módulo administrativo:", err.message);
            tbody.innerHTML = `<tr><td colspan="6" class="no-data">❌ Error al procesar datos: ${err.message}</td></tr>`;
        }
    }

    function asignarEventosBotones() {
        // CONFIRMAR RECARGA
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const opId = e.currentTarget.getAttribute('data-id');
                const monederoId = e.currentTarget.getAttribute('data-monedero');
                const bdcAAcreditar = parseFloat(e.currentTarget.getAttribute('data-monto'));

                if (!opId || !monederoId) {
                    showAlert("❌ Error: Datos de operación o monedero faltantes.", "#f87171");
                    return;
                }

                deshabilitarAccionesGlobales();

                try {
                    const ahora = new Date().toISOString();

                    const { data: monedero, error: monederoErr } = await supabase
                        .from('monederos')
                        .select('bdc_disponible')
                        .eq('monedero_id', monederoId)
                        .maybeSingle();

                    if (monederoErr) throw monederoErr;

                    let nuevoSaldoCalculado = 0;
                    if (!monedero) {
                        nuevoSaldoCalculado = bdcAAcreditar;
                    } else {
                        nuevoSaldoCalculado = (parseFloat(monedero.bdc_disponible) || 0) + bdcAAcreditar;
                    }

                    const { error: balanceErr } = await supabase
                        .from('monederos')
                        .update({ bdc_disponible: nuevoSaldoCalculado })
                        .eq('monedero_id', monederoId);

                    if (balanceErr) throw balanceErr;

                    const { error: opErr } = await supabase
                        .from('operaciones')
                        .update({ estado_operacion: 'Exitosa', fecha_finalizacion: ahora })
                        .eq('operacion_id', opId);

                    if (opErr) throw opErr;

                    showAlert(`✅ Operación #${opId} conciliada con éxito. Fondos acreditados.`, "#4ade80");
                    await consultarOperacionesPendientes(); 

                } catch (error) {
                    console.error("❌ Error en abono:", error.message);
                    showAlert(`❌ Error en abono: ${error.message}`, "#f87171");
                    await consultarOperacionesPendientes();
                }
            });
        });

        // RECHAZAR RECARGA
        document.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const opId = e.currentTarget.getAttribute('data-id');
                if (!opId) return;

                deshabilitarAccionesGlobales();

                try {
                    const { error } = await supabase
                        .from('operaciones')
                        .update({ estado_operacion: 'Fallida', fecha_finalizacion: new Date().toISOString() })
                        .eq('operacion_id', opId);

                    if (error) throw error;

                    showAlert(`❌ La operación fue marcada como 'Fallida'.`, "#eab308");
                    await consultarOperacionesPendientes();

                } catch (error) {
                    console.error("❌ Error al rechazar:", error.message);
                    showAlert(`❌ Error al actualizar estado: ${error.message}`, "#f87171");
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