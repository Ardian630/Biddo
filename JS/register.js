import { supabase } from './supabaseClient.js';

// --- 1. ALGORITMO DE GENERACIÓN DE TARJETA (Luhn) ---
function generarNumeroTarjetaValido() {
    let numero = "5337"; // Prefijo (Mastercard)
    for (let i = 0; i < 11; i++) {
        numero += Math.floor(Math.random() * 10);
    }
    
    // Dígito de control
    let sum = 0;
    for (let i = 0; i < numero.length; i++) {
        let digit = parseInt(numero[i]);
        if (i % 2 === 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    let checkDigit = (10 - (sum % 10)) % 10;
    return numero + checkDigit;
}

// Genera una cadena aleatoria (ej: hacsxai, biddox12, etc.)
function generarSufijoAleatorio(longitud = 6) {
    const caracteres = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let resultado = '';
    for (let i = 0; i < longitud; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

// Genera el username y verifica en la base de datos que no exista
async function obtenerUsernameUnico() {
    let esUnico = false;
    let usernameGenerado = "";
    let intentos = 0;
    const maxIntentos = 10;

    while (!esUnico && intentos < maxIntentos) {
        intentos++;
        // Generamos un nombre estilo 'user_a1b2c3'
        usernameGenerado = `user_${generarSufijoAleatorio()}`;
        
        console.log(`Validando disponibilidad de: ${usernameGenerado}`);

        // CAMBIO: Ahora buscamos en la tabla 'autenticacion'
        const { data, error } = await supabase
            .from('autenticacion')
            .select('nombre_usuario')
            .eq('nombre_usuario', usernameGenerado)
            .maybeSingle();

        if (error) {
            console.error("Error de base de datos:", error.message);
            throw new Error("Error al conectar con la tabla de autenticación.");
        }

        // Si data es null, significa que el nombre está libre
        if (!data) {
            esUnico = true; 
        }
    }

    if (!esUnico) {
        throw new Error("No se pudo generar un nombre de usuario único. Intenta de nuevo.");
    }

    return usernameGenerado;
}

// --- 2. VERIFICACIÓN DE UNICIDAD ---
async function obtenerNumeroUnico() {
    let esUnico = false;
    let num;
    while (!esUnico) {
        num = generarNumeroTarjetaValido();
        const { data } = await supabase.from('tarjetas').select('numero_tarjeta').eq('numero_tarjeta', num).maybeSingle();
        if (!data) esUnico = true;
    }
    return num;
}

const registerForm = document.querySelector('.login-form');

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const nombreReal = document.getElementById('realname').value;
        const tipoDoc = document.getElementById('doc-type').value;
        const numDoc = document.getElementById('doc-num').value;
        const fechaTexto = document.getElementById('birthdate').value;

        try {
    // 1. Preparar datos automáticos
    const hoy = new Date();
    const fechaExp = `${String(hoy.getMonth() + 1).padStart(2, '0')}/${String(hoy.getFullYear() + 5).slice(-2)}`;
    
    // --- NUEVO: Generar Username Único ---
    const usernameUnico = await obtenerUsernameUnico();
    
    // 2. Generar número de tarjeta único
    const numeroTarjeta = await obtenerNumeroUnico();

    // 3. Formatear fecha de nacimiento
    const partes = fechaTexto.split('-');
    const fechaISO = `${partes[2]}-${partes[1]}-${partes[0]}`;

    // 4. Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
    });

    if (authError) throw authError;

    const userUUID = authData.user.id; 

    // 5. Llamar al RPC con el username generado
    const { error: rpcError } = await supabase.rpc('registrar_usuario_completo', {
    p_uuid: userUUID,
    p_email: email,
    p_password: password, 
    p_username: usernameUnico, // El nombre generado como 'user_hacsxai'
    p_nombre_completo: nombreReal,
    p_tipo_doc: tipoDoc,
    p_num_doc: numDoc,
    p_fecha_nac: fechaISO,
    p_numero_tarjeta: numeroTarjeta,
    p_fecha_exp: fechaExp
    });

    if (rpcError) throw rpcError;

    alert(`✅ ¡Cuenta creada! Tu nombre de usuario es: ${usernameUnico}`);
    window.location.href = 'login.html';

} catch (error) {
    console.error("Error:", error.message);
    alert(`Error: ${error.message}`);
}
    });
}