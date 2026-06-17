import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const inputBuscar = document.getElementById('input-buscar');
    const btnBuscar = document.getElementById('btn-buscar');
    const searchResults = document.getElementById('search-results');
    const resNombre = document.getElementById('res-nombre');
    const resDetalles = document.getElementById('res-detalles');
    const btnAgregarContacto = document.getElementById('btn-agregar-contacto');
    
    const inputMonto = document.getElementById('input-monto');
    const txtComision = document.getElementById('txt-comision');
    const txtTotalDeducir = document.getElementById('txt-total-deducir');
    const formTransferir = document.getElementById('form-transferir');
    const btnSubmit = document.getElementById('btn-submit-transferencia');
    const mensajeStatus = document.getElementById('mensaje-status');

    const btnAbrirContactos = document.getElementById('btn-abrir-contactos');
    const modalContactos = document.getElementById('modal-contactos');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    const listaContactos = document.getElementById('lista-contactos');

    // Estado global de la vista
    let userUUID = null;
    let miMonedero = null;
    let miDocumento = 'NA';
    let factorComision = 0; // Guardará el valor decimal directo (ej: 0.02)
    let destinoSeleccionado = null; 

    // ID del monedero de la empresa para recaudar comisiones
    const MONEDERO_BIDDO_ID = 7;

    /**
     * 1. CHEQUEO DE AUTENTICACIÓN E INICIALIZACIÓN
     */
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }
    userUUID = session.user.id;
    await inicializarDatos();

    async function inicializarDatos() {
        try {
            // A. Cargar saldo disponible del emisor
            const { data: monedero, error: monErr } = await supabase
                .from('monederos')
                .select('monedero_id, bdc_disponible')
                .eq('usuario_id', userUUID)
                .maybeSingle();

            if (monErr) throw monErr;
            miMonedero = monedero;

            const { data: perfilEmisor } = await supabase
                .from('usuarios_perfil')
                .select('numero_documento')
                .eq('autenticacion_id', userUUID)
                .maybeSingle();

            if (perfilEmisor?.numero_documento) {
                miDocumento = perfilEmisor.numero_documento;
            }

            // B. Traer los registros de tasas_config
            const { data: tasasArray, error: tasaErr } = await supabase
                .from('tasas_config')
                .select('*');

            if (tasaErr) throw tasaErr;

            if (tasasArray && tasasArray.length > 0) {
                const tasaConfig = tasasArray[tasasArray.length - 1];
                console.log("📊 Registro de tasa detectado con éxito:", tasaConfig);

                // CORRECCIÓN: Validamos y extraemos el valor correcto
                if (tasaConfig.comision_transferencia !== undefined) {
                    factorComision = parseFloat(tasaConfig.comision_transferencia);
                } else if (tasaConfig.comision_retiro !== undefined) {
                    // Por si acaso usas el mismo factor para ambas en tu etapa de pruebas
                    factorComision = parseFloat(tasaConfig.comision_retiro);
                }
            }

            if (isNaN(factorComision)) factorComision = 0;

            // CORRECCIÓN VISUAL: Si en la DB es 0.02, multiplicamos por 100 para mostrar "2.00%"
            const porcentajeVisual = factorComision * 100;
            txtComision.textContent = `Comisión de red: ${porcentajeVisual.toFixed(2)}%`;

        } catch (error) {
            console.error("❌ Error al inicializar datos:", error.message);
        }
    }

    /**
     * 2. BUSCADOR DE USUARIOS
     */
    btnBuscar.addEventListener('click', ejecutarBusqueda);

    async function ejecutarBusqueda() {
        const queryText = inputBuscar.value.trim();
        if (!queryText) return;

        mostrarMensajeStatus(false);
        destinoSeleccionado = null;
        btnSubmit.disabled = true;
        searchResults.style.display = 'none';

        try {
            let resultadoPerfil = null;
            const esNumerico = /^\d+$/.test(queryText);

            if (esNumerico) {
                const { data, error } = await supabase
                    .from('usuarios_perfil')
                    .select(`
                        autenticacion_id, 
                        nombre_completo, 
                        numero_documento,
                        autenticacion (nombre_usuario)
                    `)
                    .eq('numero_documento', queryText)
                    .maybeSingle();

                if (error) throw error;
                resultadoPerfil = data;
            } else {
                const { data, error } = await supabase
                    .from('usuarios_perfil')
                    .select(`
                        autenticacion_id, 
                        nombre_completo, 
                        numero_documento,
                        autenticacion!inner (nombre_usuario)
                    `)
                    .eq('autenticacion.nombre_usuario', queryText)
                    .maybeSingle();

                if (error) throw error;
                resultadoPerfil = data;
            }

            if (!resultadoPerfil) {
                mostrarMensajeStatus(true, "❌ Usuario no encontrado en el sistema.", "#f87171");
                return;
            }

            if (resultadoPerfil.autenticacion_id === userUUID) {
                mostrarMensajeStatus(true, "⚠️ No puedes realizar transferencias a ti mismo.", "#eab308");
                return;
            }

            const usernameDestino = resultadoPerfil.autenticacion?.nombre_usuario || 'sin_usuario';
            
            destinoSeleccionado = {
                autenticacion_id: resultadoPerfil.autenticacion_id,
                nombre_completo: resultadoPerfil.nombre_completo,
                numero_documento: resultadoPerfil.numero_documento,
                username: usernameDestino
            };
            
            resNombre.textContent = destinoSeleccionado.nombre_completo;
            resDetalles.textContent = `@${destinoSeleccionado.username} • Documento: ${destinoSeleccionado.numero_documento}`;
            searchResults.style.display = 'block';

            // Verificar si ya está guardado en contactos
            const { data: contactoExistente } = await supabase
                .from('contactos')
                .select('usuario_contacto_id')
                .eq('usuario_propietario_id', userUUID)
                .eq('usuario_contacto_id', resultadoPerfil.autenticacion_id)
                .maybeSingle();

            if (contactoExistente) {
                btnAgregarContacto.disabled = true;
                btnAgregarContacto.innerHTML = `<i class="fa-solid fa-check"></i> Ya guardado`;
            } else {
                btnAgregarContacto.disabled = false;
                btnAgregarContacto.innerHTML = `<i class="fa-solid fa-user-plus"></i> Guardar`;
            }

            validarMontoYBalance();

        } catch (error) {
            console.error("❌ Error buscando usuario:", error.message);
            mostrarMensajeStatus(true, `Error en la búsqueda: ${error.message}`, "#f87171");
        }
    }

    /**
     * 3. AGREGAR A CONTACTOS
     */
    btnAgregarContacto.addEventListener('click', async () => {
        if (!destinoSeleccionado) return;
        try {
            const { error } = await supabase
                .from('contactos')
                .insert([{
                    usuario_propietario_id: userUUID,
                    usuario_contacto_id: destinoSeleccionado.autenticacion_id
                }]);

            if (error) {
                if (error.code === '23505') { 
                    btnAgregarContacto.innerHTML = `<i class="fa-solid fa-check"></i> Ya guardado`;
                } else { throw error; }
            } else {
                btnAgregarContacto.innerHTML = `<i class="fa-solid fa-check"></i> Agregado`;
            }
            btnAgregarContacto.disabled = true;
        } catch (error) {
            console.error("❌ Error al guardar contacto:", error.message);
        }
    });

    /**
     * 4. VALIDACIÓN DINÁMICA DE SALDOS
     */
    inputMonto.addEventListener('input', validarMontoYBalance);

    function validarMontoYBalance() {
        const monto = parseFloat(inputMonto.value) || 0;
        if (monto <= 0 || !destinoSeleccionado || !miMonedero) {
            btnSubmit.disabled = true;
            txtTotalDeducir.textContent = '';
            return;
        }

        // CORRECCIÓN MATEMÁTICA: Como factorComision ya es decimal (0.02), multiplicamos directo
        const comisionCalculada = monto * factorComision;
        const totalDeducir = monto + comisionCalculada;
        const saldoDisponible = parseFloat(miMonedero.bdc_disponible) || 0;

        txtTotalDeducir.textContent = `Total a descontar: ${totalDeducir.toFixed(2)} BDC (${monto.toFixed(2)} envío + ${comisionCalculada.toFixed(2)} comisión)`;

        if (totalDeducir > saldoDisponible) {
            txtTotalDeducir.style.color = "#f87171";
            txtTotalDeducir.textContent += " ❌ (Saldo Insuficiente)";
            btnSubmit.disabled = true;
        } else {
            txtTotalDeducir.style.color = "#4ade80";
            btnSubmit.disabled = false;
        }
    }

    /**
     * 5. PROCESAMIENTO DISTRIBUIDO DE LA TRANSFERENCIA
     */
    formTransferir.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const montoEnviar = parseFloat(inputMonto.value) || 0;
        // CORRECCIÓN MATEMÁTICA: Uso directo del factor decimal
        const comision = montoEnviar * factorComision;
        const totalDebitar = montoEnviar + comision;

        if (!destinoSeleccionado || montoEnviar <= 0 || !miMonedero) return;

        btnSubmit.disabled = true;
        btnSubmit.textContent = "Procesando Envío...";

        try {
            const fechaISO = new Date().toISOString();

            const { data: monederoDestino, error: destErr } = await supabase
                .from('monederos')
                .select('monedero_id, bdc_disponible')
                .eq('usuario_id', destinoSeleccionado.autenticacion_id)
                .single();

            if (destErr) throw destErr;

            const { data: monederoBiddo, error: biddoErr } = await supabase
                .from('monederos')
                .select('bdc_disponible')
                .eq('monedero_id', MONEDERO_BIDDO_ID)
                .single();

            if (biddoErr) throw biddoErr;

            const { data: operacion, error: opErr } = await supabase
                .from('operaciones')
                .insert([{
                    monedero_id: miMonedero.monedero_id,
                    monto_bruto: -totalDebitar, 
                    monto_comision: comision,
                    estado_operacion: 'Exitosa', 
                    referencia_interna: `TRANSFERENCIA-A-${destinoSeleccionado.numero_documento}`,
                    fecha_creacion: fechaISO,
                    fecha_finalizacion: fechaISO
                }])
                .select('operacion_id')
                .single();

            if (opErr) throw opErr;

            const { error: transErr } = await supabase
                .from('transferencias')
                .insert([{
                    operacion_id: operacion.operacion_id,
                    monto_bruto: totalDebitar,
                    monto_neto: montoEnviar
                }]);

            if (transErr) throw transErr;

            const { error: opReceptorErr } = await supabase
                .from('operaciones')
                .insert([{
                    monedero_id: monederoDestino.monedero_id,
                    monto_bruto: montoEnviar,
                    monto_comision: 0,
                    estado_operacion: 'Exitosa',
                    referencia_interna: `TRANSFERENCIA-DE-${miDocumento}`,
                    fecha_creacion: fechaISO,
                    fecha_finalizacion: fechaISO
                }]);

            if (opReceptorErr) throw opReceptorErr;

            if (comision > 0) {
                const { error: opBiddoErr } = await supabase
                    .from('operaciones')
                    .insert([{
                        monedero_id: MONEDERO_BIDDO_ID,
                        monto_bruto: comision, 
                        monto_comision: 0,
                        estado_operacion: 'Exitosa',
                        referencia_interna: `RECAUDACION-COMISION-OP-${operacion.operacion_id}`,
                        fecha_creacion: fechaISO,
                        fecha_finalizacion: fechaISO
                    }]);
                
                if (opBiddoErr) throw opBiddoErr;
            }

            const nuevoSaldoEmisor = parseFloat(miMonedero.bdc_disponible) - totalDebitar;
            await supabase.from('monederos').update({ bdc_disponible: nuevoSaldoEmisor }).eq('monedero_id', miMonedero.monedero_id);

            const nuevoSaldoReceptor = (parseFloat(monederoDestino.bdc_disponible) || 0) + montoEnviar;
            await supabase.from('monederos').update({ bdc_disponible: nuevoSaldoReceptor }).eq('monedero_id', monederoDestino.monedero_id);

            if (comision > 0) {
                const nuevoSaldoBiddo = (parseFloat(monederoBiddo.bdc_disponible) || 0) + comision;
                await supabase.from('monederos').update({ bdc_disponible: nuevoSaldoBiddo }).eq('monedero_id', MONEDERO_BIDDO_ID);
            }

            mostrarMensajeStatus(true, `✅ ¡Transferencia exitosa! Enviados: ${montoEnviar.toFixed(2)} BDC.`, "#4ade80");
            formTransferir.reset();
            searchResults.style.display = 'none';
            setTimeout(() => { window.location.href = 'mimonedero.html'; }, 2500);

        } catch (error) {
            console.error("❌ Fallo transaccional:", error.message);
            mostrarMensajeStatus(true, `❌ Error en transferencia: ${error.message}`, "#f87171");
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Confirmar y Transferir";
        }
    });

    /**
     * 6. MODAL DE CONTACTOS AGREGADOS (DOS PASOS)
     */
    btnAbrirContactos.addEventListener('click', async () => {
        modalContactos.classList.add('open');
        listaContactos.innerHTML = '<li>Cargando contactos...</li>';

        try {
            const { data: listaIds, error: errorContactos } = await supabase
                .from('contactos')
                .select('usuario_contacto_id')
                .eq('usuario_propietario_id', userUUID);

            if (errorContactos) throw errorContactos;

            if (!listaIds || listaIds.length === 0) {
                listaContactos.innerHTML = '<li>No tienes contactos guardados.</li>';
                return;
            }

            const listaUuids = listaIds.map(c => c.usuario_contacto_id);

            const { data: perfilesEncontrados, error: errorPerfiles } = await supabase
                .from('usuarios_perfil')
                .select(`
                    autenticacion_id,
                    nombre_completo,
                    numero_documento,
                    autenticacion (nombre_usuario)
                `)
                .in('autenticacion_id', listaUuids);

            if (errorPerfiles) throw errorPerfiles;

            listaContactos.innerHTML = '';
            if (!perfilesEncontrados || perfilesEncontrados.length === 0) {
                listaContactos.innerHTML = '<li>No se pudo cargar la información de tus contactos.</li>';
                return;
            }

            perfilesEncontrados.forEach(p => {
                const uName = p.autenticacion?.nombre_usuario || 'sin_usuario';
                const li = document.createElement('li');
                li.innerHTML = `<strong>${p.nombre_completo}</strong> <span style="font-size:0.75rem; color:#888;">@${uName}</span>`;
                
                li.addEventListener('click', () => {
                    inputBuscar.value = uName;
                    modalContactos.classList.remove('open');
                    ejecutarBusqueda();
                });
                listaContactos.appendChild(li);
            });

        } catch (error) {
            console.error("❌ Error en modal de contactos:", error.message);
            listaContactos.innerHTML = `<li>Error: ${error.message}</li>`;
        }
    });

    btnCerrarModal.addEventListener('click', () => { modalContactos.classList.remove('open'); });

    function mostrarMensajeStatus(visible, texto = "", color = "") {
        if (!visible) { mensajeStatus.style.display = 'none'; return; }
        mensajeStatus.textContent = texto;
        mensajeStatus.style.background = color;
        mensajeStatus.style.color = "#fff";
        mensajeStatus.style.display = 'block';
    }
});