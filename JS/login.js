import { supabase } from './supabaseClient.js';

const loginForm = document.querySelector('.login-form');
const mensajeStatus = document.getElementById('mensaje-status');
const btnLogin = document.getElementById('btn-login');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function mostrarMensaje(texto, color) {
    if (mensajeStatus) {
        mensajeStatus.textContent = texto;
        mensajeStatus.style.color = color;
    } else {
        alert(texto);
    }
}

function validarLogin(email, password) {
    if (!email) {
        return '❌ Ingresa tu correo electrónico.';
    }
    if (!EMAIL_REGEX.test(email)) {
        return '❌ El formato del correo electrónico no es válido.';
    }
    if (!password) {
        return '❌ Ingresa tu contraseña.';
    }
    if (password.length < 6) {
        return '❌ La contraseña debe tener al menos 6 caracteres.';
    }
    return null;
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        const errorValidacion = validarLogin(email, password);
        if (errorValidacion) {
            mostrarMensaje(errorValidacion, '#f87171');
            return;
        }

        mostrarMensaje('', '');
        if (btnLogin) {
            btnLogin.disabled = true;
            btnLogin.textContent = 'Ingresando...';
        }

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (authError) throw authError;

            const { error: updateError } = await supabase
                .from('autenticacion')
                .update({ ultima_sesion: new Date().toISOString() })
                .eq('autenticacion_id', data.user.id);

            if (updateError) console.warn("No se pudo actualizar la última sesión:", updateError.message);

            mostrarMensaje('✅ Inicio de sesión exitoso. Redirigiendo...', '#4ade80');
            window.location.href = '../HTML/mimonedero.html';

        } catch (error) {
            console.error("Error de login:", error.message);

            let mensajeAmigable = error.message;
            if (error.message.includes("Invalid login credentials")) {
                mensajeAmigable = "Correo o contraseña incorrectos.";
            } else if (error.message.includes("Email not confirmed")) {
                mensajeAmigable = "Por favor, verifica tu correo electrónico antes de entrar.";
            } else if (error.message.includes("Too many requests")) {
                mensajeAmigable = "Demasiados intentos. Espera un momento e intenta de nuevo.";
            }

            mostrarMensaje(`❌ ${mensajeAmigable}`, '#f87171');

            if (btnLogin) {
                btnLogin.disabled = false;
                btnLogin.textContent = 'Ingresar';
            }
        }
    });
}
