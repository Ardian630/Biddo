import { supabase } from './supabaseClient.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOMBRE_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{3,100}$/;
const FECHA_REGEX = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/;

function generarNumeroTarjetaValido() {
    let numero = "5337";
    for (let i = 0; i < 11; i++) {
        numero += Math.floor(Math.random() * 10);
    }

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

function generarSufijoAleatorio(longitud = 6) {
    const caracteres = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let resultado = '';
    for (let i = 0; i < longitud; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

async function obtenerUsernameUnico() {
    let esUnico = false;
    let usernameGenerado = "";
    let intentos = 0;
    const maxIntentos = 10;

    while (!esUnico && intentos < maxIntentos) {
        intentos++;
        usernameGenerado = `user_${generarSufijoAleatorio()}`;

        const { data, error } = await supabase
            .from('autenticacion')
            .select('nombre_usuario')
            .eq('nombre_usuario', usernameGenerado)
            .maybeSingle();

        if (error) {
            throw new Error("Error al conectar con la tabla de autenticación.");
        }

        if (!data) {
            esUnico = true;
        }
    }

    if (!esUnico) {
        throw new Error("No se pudo generar un nombre de usuario único. Intenta de nuevo.");
    }

    return usernameGenerado;
}

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

function mostrarMensaje(texto, color) {
    const mensajeStatus = document.getElementById('mensaje-status');
    if (mensajeStatus) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.color = color;
    } else {
        alert(texto);
    }
}

function validarDocumento(tipoDoc, numDoc) {
    const docLimpio = numDoc.trim();

    if (!/^\d+$/.test(docLimpio)) {
        return '❌ El número de documento solo debe contener dígitos.';
    }

    switch (tipoDoc) {
        case 'V':
        case 'E':
            if (docLimpio.length < 6 || docLimpio.length > 8) {
                return '❌ La cédula debe tener entre 6 y 8 dígitos.';
            }
            break;
        case 'J':
            if (docLimpio.length < 7 || docLimpio.length > 10) {
                return '❌ El RIF jurídico debe tener entre 7 y 10 dígitos.';
            }
            break;
        case 'RIF-J':
        case 'RIF-V':
            if (docLimpio.length < 7 || docLimpio.length > 12) {
                return '❌ El RIF debe tener entre 7 y 12 dígitos.';
            }
            break;
        default:
            return '❌ Tipo de documento no válido.';
    }

    return null;
}

function validarFechaNacimiento(fechaTexto) {
    if (!FECHA_REGEX.test(fechaTexto)) {
        return '❌ La fecha debe tener el formato dd-mm-yyyy (ej: 15-03-1995).';
    }

    const [dia, mes, anio] = fechaTexto.split('-').map(Number);
    const fecha = new Date(anio, mes - 1, dia);

    if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
        return '❌ La fecha de nacimiento no es válida.';
    }

    const hoy = new Date();
    let edad = hoy.getFullYear() - anio;
    const cumpleEsteAnio = hoy.getMonth() < mes - 1 || (hoy.getMonth() === mes - 1 && hoy.getDate() < dia);
    if (cumpleEsteAnio) edad--;

    if (edad < 18) {
        return '❌ Debes ser mayor de 18 años para registrarte.';
    }
    if (edad > 120) {
        return '❌ La fecha de nacimiento no es válida.';
    }

    return null;
}

function validarRegistro(datos) {
    const { email, password, nombreReal, tipoDoc, numDoc, fechaTexto } = datos;

    if (!nombreReal || !NOMBRE_REGEX.test(nombreReal)) {
        return '❌ El nombre real debe tener al menos 3 letras y solo caracteres alfabéticos.';
    }

    if (!email) {
        return '❌ Ingresa tu correo electrónico.';
    }
    if (!EMAIL_REGEX.test(email)) {
        return '❌ El formato del correo electrónico no es válido.';
    }

    if (!password) {
        return '❌ Ingresa una contraseña.';
    }
    if (password.length < 8) {
        return '❌ La contraseña debe tener al menos 8 caracteres.';
    }
    if (!/[A-Z]/.test(password)) {
        return '❌ La contraseña debe incluir al menos una letra mayúscula.';
    }
    if (!/[0-9]/.test(password)) {
        return '❌ La contraseña debe incluir al menos un número.';
    }

    const errorDoc = validarDocumento(tipoDoc, numDoc);
    if (errorDoc) return errorDoc;

    const errorFecha = validarFechaNacimiento(fechaTexto);
    if (errorFecha) return errorFecha;

    return null;
}

function traducirErrorSupabase(mensaje) {
    if (mensaje.includes('User already registered')) {
        return 'Este correo electrónico ya está registrado.';
    }
    if (mensaje.includes('Password should be at least')) {
        return 'La contraseña no cumple los requisitos mínimos de seguridad.';
    }
    if (mensaje.includes('Unable to validate email address')) {
        return 'El correo electrónico no es válido.';
    }
    if (mensaje.includes('duplicate key') || mensaje.includes('already exists')) {
        return 'Ya existe un usuario con esos datos.';
    }
    return mensaje;
}

const registerForm = document.querySelector('.login-form');
const btnRegister = document.getElementById('btn-register');

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        const nombreReal = document.getElementById('realname').value.trim();
        const tipoDoc = document.getElementById('doc-type').value;
        const numDoc = document.getElementById('doc-num').value.trim();
        const fechaTexto = document.getElementById('birthdate').value.trim();

        const errorValidacion = validarRegistro({ email, password, nombreReal, tipoDoc, numDoc, fechaTexto });
        if (errorValidacion) {
            mostrarMensaje(errorValidacion, '#f87171');
            return;
        }

        mostrarMensaje('', '');
        if (btnRegister) {
            btnRegister.disabled = true;
            btnRegister.textContent = 'Creando cuenta...';
        }

        try {
            const hoy = new Date();
            const fechaExp = `${String(hoy.getMonth() + 1).padStart(2, '0')}/${String(hoy.getFullYear() + 5).slice(-2)}`;

            const usernameUnico = await obtenerUsernameUnico();
            const numeroTarjeta = await obtenerNumeroUnico();

            const partes = fechaTexto.split('-');
            const fechaISO = `${partes[2]}-${partes[1]}-${partes[0]}`;

            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            if (authError) throw authError;

            const userUUID = authData.user.id;

            const { error: rpcError } = await supabase.rpc('registrar_usuario_completo', {
                p_uuid: userUUID,
                p_email: email,
                p_password: password,
                p_username: usernameUnico,
                p_nombre_completo: nombreReal,
                p_tipo_doc: tipoDoc,
                p_num_doc: numDoc,
                p_fecha_nac: fechaISO,
                p_numero_tarjeta: numeroTarjeta,
                p_fecha_exp: fechaExp
            });

            if (rpcError) throw rpcError;

            mostrarMensaje(`✅ ¡Cuenta creada! Tu nombre de usuario es: ${usernameUnico}`, '#4ade80');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);

        } catch (error) {
            console.error("Error:", error.message);
            mostrarMensaje(`❌ ${traducirErrorSupabase(error.message)}`, '#f87171');

            if (btnRegister) {
                btnRegister.disabled = false;
                btnRegister.textContent = 'Crear Cuenta';
            }
        }
    });
}
