import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Elementos del DOM
    const btcLabel = document.getElementById('btc-disponibles');
    const retenidoLabel = document.getElementById('btc-retenido');
    const tarjetaNumLabel = document.getElementById('tarjeta-numero');
    const tarjetaFechaLabel = document.getElementById('tarjeta-fecha');
    const tarjetaTitularLabel = document.getElementById('tarjeta-titular');
    const btnReveal = document.querySelector('.btn-reveal');

    /**
     * 2. VALIDACIÓN DE SESIÓN REFORZADA
     * Obtenemos la sesión directamente de Supabase Auth (la que inició login.js)
     */
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        console.warn("Sesión no encontrada o expirada.");
        window.location.href = 'login.html'; // Redirige al login si no hay sesión activa
        return;
    }

    const userUUID = session.user.id;
    console.log("Usuario autenticado con UUID:", userUUID);

    // Variables para guardar los datos reales y poder ocultarlos/mostrarlos
    let datosReales = { numero: '', fecha: '' };
    let esVisible = false;

    if (!session) { window.location.href = 'login.html'; return; }

async function cargarDatos() {
    try {
        // 1. Obtener el Monedero del usuario actual
        const { data: monedero, error: errorMonedero } = await supabase
            .from('monederos')
            .select('*')
            .eq('usuario_id', session.user.id)
            .maybeSingle();

        if (errorMonedero) throw errorMonedero;

        if (monedero) {
            // Actualizar balances en la UI
            if (btcLabel) btcLabel.innerHTML = `${monedero.bdc_disponible || '0.00'} <span class="bdc_unity">BDC</span>`;
            if (retenidoLabel) retenidoLabel.innerHTML = `${monedero.bdc_retenido || '0.00'} <span class="bdc_unity">BDC</span>`;

            // 2. Obtener la Tarjeta (Sin el join que daba error 400)
            const { data: tarjeta, error: errorTarjeta } = await supabase
                .from('tarjetas')
                .select('*')
                .eq('monedero_id', monedero.monedero_id)
                .maybeSingle();

            if (errorTarjeta) throw errorTarjeta;

            if (tarjeta) {
                // Guardamos los datos para el botón "Ver Datos"
                datosReales.numero = tarjeta.numero_tarjeta;
                datosReales.fecha = tarjeta.fecha_vencimiento;
                
                // 3. Obtener el Nombre del Titular desde 'usuarios_perfil'
                const { data: perfil } = await supabase
                    .from('usuarios_perfil')
                    .select('nombre_completo')
                    .eq('autenticacion_id', session.user.id)
                    .maybeSingle();

                // Mostramos el nombre: Prioridad Tarjeta > Perfil > Email
                if (tarjetaTitularLabel) {
                    tarjetaTitularLabel.textContent = tarjeta.titular || 
                                                     perfil?.nombre_completo || 
                                                     session.user.email.split('@')[0];
                }

                actualizarInterfazTarjeta();
            }
        }
    } catch (err) {
        console.error("Error al cargar datos:", err.message);
    }
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

    // Escuchamos el evento del botón del HTML
    window.addEventListener('toggle-tarjeta', () => {
        esVisible = !esVisible;
        actualizarInterfazTarjeta();
    });

    cargarDatos();
});

    