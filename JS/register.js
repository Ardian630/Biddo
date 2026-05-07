import { supabase } from './supabaseClient.js';

// Seleccionamos el formulario de registro
const registerForm = document.querySelector('.login-form');

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        // 1. Detenemos el refresco de la página inmediatamente
        e.preventDefault();
        
        console.log("Iniciando proceso de registro atómico...");

        // 2. Captura de datos desde los IDs de register_2.html
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const nombreReal = document.getElementById('realname').value;
        const tipoDoc = document.getElementById('doc-type').value;
        const numDoc = document.getElementById('doc-num').value;
        const fechaTexto = document.getElementById('birthdate').value; // Formato esperado: dd-mm-yyyy

        try {
            // --- TRANSFORMACIÓN DE FECHA (Opción 1) ---
            // Convierte "dd-mm-yyyy" a "yyyy-mm-dd" para PostgreSQL[cite: 2]
            const partes = fechaTexto.split('-');
            if (partes.length !== 3) {
                throw new Error("El formato de fecha debe ser dd-mm-yyyy (ej: 25-12-1995)");
            }
            const fechaISO = `${partes[2]}-${partes[1]}-${partes[0]}`;

            // Algoritmo para generar un nombre de usuario aleatorio[cite: 2]
            const generatedUsername = `usuario_${Math.random().toString(36).substring(2, 7)}`;

            // --- PASO 1: Registro en Supabase Auth ---
            // Esto crea la cuenta técnica necesaria para el login[cite: 2]
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password
            });

            if (authError) throw authError;

            // Obtenemos el UUID generado por Supabase[cite: 2]
            const uuid = authData.user.id;

            // --- PASO 2: Ejecución de la Transacción Atómica (RPC) ---
            // Llamamos a la función SQL que inserta en 'autenticacion' y 'usuarios_perfil' al mismo tiempo[cite: 2]
            const { error: transactionError } = await supabase.rpc('registrar_usuario_transaccional', {
                p_uuid: uuid,
                p_email: email,
                p_password: "PROTECTED", // La contraseña real ya está segura en auth.users[cite: 2]
                p_username: generatedUsername,
                p_nombre_completo: nombreReal,
                p_tipo_doc: tipoDoc,
                p_num_doc: numDoc,
                p_fecha_nac: fechaISO
            });

            // Si la transacción falla, lanzamos el error para el catch[cite: 2]
            if (transactionError) throw transactionError;

            // --- ÉXITO ---
            alert(`✅ ¡Registro Exitoso!\nBienvenido, ${generatedUsername}.\nYa puedes iniciar sesión.`);
            window.location.href = 'login.html';

        } catch (error) {
            // Captura y muestra cualquier error en un pop-up[cite: 2]
            console.error("Detalle del error de registro:", error);
            
            let mensajeError = error.message;
            
            // Manejo amigable de errores comunes
            if (mensajeError.includes("rate limit")) {
                mensajeError = "Demasiados intentos. Por favor, espera un momento o desactiva la confirmación de email.";
            } else if (mensajeError.includes("PGRST203")) {
                mensajeError = "Error de duplicidad en la función de base de datos. Asegúrate de haber ejecutado el DROP FUNCTION.";
            }

            alert(`❌ Error en el registro:\n${mensajeError}`);
        }
    });
}