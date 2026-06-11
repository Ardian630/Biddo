import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Elementos del DOM
    const btcLabel = document.getElementById('btc-disponibles');
    const retenidoLabel = document.getElementById('btc-retenido');
    const tarjetaNumLabel = document.getElementById('tarjeta-numero');
    const tarjetaFechaLabel = document.getElementById('tarjeta-fecha');
    const tarjetaTitularLabel = document.getElementById('tarjeta-titular');
    const btnReveal = document.querySelector('.btn-reveal');
    const listaMovimientos = document.querySelector('.transactions-list'); // Contenedor del HTML


    // Captura de botones de acción
    const btnIrRecarga = document.getElementById('btn-ir-recarga');
    const btnIrTransferir = document.getElementById('btn-ir-transferir');
    const btnIrRetiro = document.getElementById('btn-ir-retiro');

    // Escuchar el click para redirigir a la pantalla de recarga
    if (btnIrRecarga) {
        btnIrRecarga.addEventListener('click', () => {
            window.location.href = 'recarga.html';
        });
    }

    // Escuchar el click para redirigir a la pantalla de transferencia
    if (btnIrTransferir) {
        btnIrTransferir.addEventListener('click', () => {
            window.location.href = 'transferir.html'; // Redirige a tu interfaz de transferencia
        });
    }

    // Escuchar el click para redirigir a la pantalla de retiro
    if (btnIrRetiro) {
        btnIrRetiro.addEventListener('click', () => {
            window.location.href = 'retiro.html'; // Redirige a tu interfaz de retiro
        });
    }

    /**
     * 2. VALIDACIÓN DE SESIÓN REFORZADA
     */
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        console.warn("Sesión no encontrada o expirada.");
        window.location.href = 'login.html';
        return;
    }

    const userUUID = session.user.id;
    let datosReales = { numero: '', fecha: '' };
    let esVisible = false;

    // Ejecutar la carga inicial
    await cargarDatos();

    async function cargarDatos() {
        try {
            // Consulta de Saldos (Tabla: monederos, Columnas: bdc_disponible, bdc_retenido)
            const { data: monedero, error: monederoError } = await supabase
                .from('monederos')
                .select('monedero_id, bdc_disponible, bdc_retenido')
                .eq('usuario_id', userUUID)
                .maybeSingle();

            if (monedero) {
                if (btcLabel) btcLabel.textContent = parseFloat(monedero.bdc_disponible).toFixed(2);
                if (retenidoLabel) retenidoLabel.textContent = parseFloat(monedero.bdc_retenido).toFixed(2);

                // ========================================================
                // CARGAR LAS ÚLTIMAS 10 OPERACIONES REALES DEL MONEDERO
                // ========================================================
                await cargarUltimosMovimientos(monedero.monedero_id);
            } else {
                // Si por algún motivo no hay monedero, limpiar la lista y mostrar el mensaje vacío
                if (listaMovimientos) {
                    listaMovimientos.innerHTML = `
                        <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 0.95rem;">
                            <i class="fa-solid fa-receipt" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
                            No hay operaciones realizadas
                        </div>`;
                }
            }

            // Consulta de Tarjeta (Tabla: tarjetas, Columnas: numero_tarjeta, fecha_vencimiento)
            // Vinculada mediante el monedero_id si existe
            if (monedero) {
                const { data: tarjeta } = await supabase
                    .from('tarjetas')
                    .select('numero_tarjeta, fecha_vencimiento')
                    .eq('monedero_id', monedero.monedero_id)
                    .maybeSingle();

                if (tarjeta) {
                    datosReales.numero = tarjeta.numero_tarjeta || '0000000000000000';
                    
                    // Formatear fecha si viene como objeto Date/string completo de Postgres (YYYY-MM-DD)
                    if (tarjeta.fecha_vencimiento && tarjeta.fecha_vencimiento.includes('-')) {
                        const [year, month] = tarjeta.fecha_vencimiento.split('-');
                        datosReales.fecha = `${month}/${year.slice(-2)}`;
                    } else {
                        datosReales.fecha = tarjeta.fecha_vencimiento || '00/00';
                    }
                    
                    const { data: perfil } = await supabase
                        .from('usuarios_perfil')
                        .select('nombre_completo')
                        .eq('autenticacion_id', userUUID)
                        .maybeSingle();

                    if (tarjetaTitularLabel) {
                        tarjetaTitularLabel.textContent = perfil?.nombre_completo || session.user.email.split('@')[0];
                    }
                    actualizarInterfazTarjeta();
                }
            }

        } catch (err) {
            console.error("Error al cargar datos generales:", err.message);
        }
    }

    async function cargarUltimosMovimientos(monederoId) {
        if (!listaMovimientos) return;

        try {
            // Consultamos las últimas 10 operaciones del monedero ordenadas por fecha_creacion descendente
            const { data: operaciones, error: opError } = await supabase
                .from('operaciones')
                .select('operacion_id, monto_bruto, estado_operacion, referencia_interna, fecha_creacion')
                .eq('monedero_id', monederoId)
                .order('fecha_creacion', { ascending: false })
                .limit(10);

            if (opError) throw opError;

            // Limpiamos los elementos estáticos de simulación que tiene el HTML
            listaMovimientos.innerHTML = '';

            // Caso: No hay registros
            if (!operaciones || operaciones.length === 0) {
                listaMovimientos.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 0.95rem;">
                        <i class="fa-solid fa-receipt" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
                        No hay operaciones realizadas
                    </div>`;
                return;
            }

            // Caso: Si hay operaciones, las recorremos para agregarlas al DOM
            operaciones.forEach(op => {
                const itemHTML = crearItemMovimiento(op);
                listaMovimientos.appendChild(itemHTML);
            });

        } catch (error) {
            console.error("Error al obtener movimientos de la BD:", error.message);
            listaMovimientos.innerHTML = `<div style="text-align: center; color: var(--error-red); padding: 20px;">Error al cargar el historial</div>`;
        }
    }

    /**
     * Formatea la fecha y hora exactamente como en el diseño de simulación original: "23 Abr 2026 - 15:30" u "Hoy - En espera"
     */
    function formatearFechaHora(dateString, estadoClase) {
        if (estadoClase === 'pending') {
            return "Hoy - En espera";
        }

        // El string viene en formato ISO o UTC de Postgres, creamos el objeto Date local
        const fechaObj = new Date(dateString);
        
        // Formato de fecha abreviada en español (ej. "23 Abr 2026")
        const opcionesFecha = { day: 'numeric', month: 'short', year: 'numeric' };
        let fechaFormateada = fechaObj.toLocaleDateString('es-ES', opcionesFecha);
        
        // Limpiar el punto que toLocaleDateString añade automáticamente a los meses abreviados (ej: "abr." -> "abr")
        fechaFormateada = fechaFormateada.replace('.', '');
        // Capitalizar la primera letra del mes (ej: "23 abr 2026" -> "23 Abr 2026")
        fechaFormateada = fechaFormateada.replace(/\b[a-z]/g, letter => letter.toUpperCase());

        // Formato de hora (ej. "15:30")
        const opcionesHora = { hour: '2-digit', minute: '2-digit', hour12: false };
        const horaFormateada = fechaObj.toLocaleTimeString('es-ES', opcionesHora);

        return `${fechaFormateada} - ${horaFormateada}`;
    }

    /**
     * Construye dinámicamente el nodo HTML del movimiento inyectando las clases y los iconos correctos según el estado_operacion
     */
    function crearItemMovimiento(op) {
        const div = document.createElement('div');
        
        // 1. Obtener el estado tal cual viene de la base de datos (para mostrarlo textualmente)
        const estadoTextoOriginal = op.estado_operacion || 'Desconocido';

        // 2. Estandarizar temporalmente a minúsculas solo para asignar la clase de estilos CSS correctos
        let estadoClase = 'success'; 
        const est = estadoTextoOriginal.toLowerCase().trim();

        if (est === 'failed' || est === 'fallida' || est === 'rechazada' || est === 'cancelada') {
            estadoClase = 'failed';
        } else if (est === 'pending' || est === 'espera' || est === 'procesando' || est === 'en proceso') {
            estadoClase = 'pending';
        }

        div.className = `transaction ${estadoClase}`;

        // Determinar el ícono de FontAwesome basándonos en la clase asignada
        let iconoHTML = '<i class="fa-solid fa-check"></i>'; 
        if (estadoClase === 'failed') {
            iconoHTML = '<i class="fa-solid fa-xmark"></i>';
        } else if (estadoClase === 'pending') {
            iconoHTML = '<i class="fa-solid fa-clock"></i>';
        }

        // Determinar el prefijo matemático (+ o -) según el valor de monto_bruto
        const montoNum = parseFloat(op.monto_bruto);
        const montoAbsoluto = Math.abs(montoNum).toFixed(2);
        let prefijo = '';

        if (montoNum >= 0) {
            prefijo = `+ ${montoAbsoluto}`;
        } else {
            prefijo = `- ${montoAbsoluto}`;
        }

        // Generar un título descriptivo inteligente basado en la referencia interna
        let tituloOperacion = montoNum >= 0 ? 'Transferencia recibida' : 'Transferencia enviada';
        
        if (op.referencia_interna && op.referencia_interna.toLowerCase().includes('pagomovil')) {
            tituloOperacion = 'Recarga por Pago Móvil';
        } else if (op.referencia_interna && op.referencia_interna.toLowerCase().includes('subasta')) {
            tituloOperacion = 'Pago de subasta';
        } else if (op.referencia_interna && op.referencia_interna.toLowerCase().includes('retiro')) {
            tituloOperacion = 'Retiro a Cuenta Bancaria';
        }

        // Formatear la estampa de tiempo
        const timestampTexto = formatearFechaHora(op.fecha_creacion, estadoClase);

        // Estructura interna: Inyectamos estadoTextoOriginal directamente para que diga "En Proceso", "Exitosa", etc.
        div.innerHTML = `
            <div class="t-icon">${iconoHTML}</div>
            <div class="t-info">
                <span class="t-type">${tituloOperacion}</span>
                <span class="t-date">${timestampTexto}  •  <small style="font-weight: 600; text-transform: capitalize;">${estadoTextoOriginal}</small></span>
            </div>
            <div class="t-amount">${prefijo} BDC</div>
        `;

        return div;
    }

    function actualizarInterfazTarjeta() {
        if (esVisible) {
            tarjetaNumLabel.textContent = datosReales.numero;
            tarjetaFechaLabel.textContent = datosReales.fecha;
            if (btnReveal) btnReveal.textContent = "Ocultar";
        } else {
            tarjetaNumLabel.textContent = `•••• •••• •••• ${datosReales.numero.slice(-4)}`;
            tarjetaFechaLabel.textContent = "••/••";
            if (btnReveal) btnReveal.textContent = "Ver Datos";
        }
    }

    window.addEventListener('toggle-tarjeta', () => {
        esVisible = !esVisible;
        actualizarInterfazTarjeta();
    });
});