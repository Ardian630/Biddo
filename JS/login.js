import { supabase } from './supabaseClient.js';

// Seleccionamos el formulario de inicio de sesión
const loginForm = document.querySelector('.login-form');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        // Detener el refresco de la página[cite: 2]
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            console.log("Intentando iniciar sesión...");

            // 1. Autenticación con Supabase Auth
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (authError) throw authError;

            // 2. Si el login es exitoso, actualizamos la última sesión en tu tabla[cite: 1]
            // Esto es opcional pero útil para el campo 'ultima_sesion' que mencionaste antes
            const { error: updateError } = await supabase
                .from('autenticacion')
                .update({ ultima_sesion: new Date().toISOString() })
                .eq('autenticacion_id', data.user.id);

            if (updateError) console.warn("No se pudo actualizar la última sesión:", updateError.message);

            // 3. Éxito: Redirigir al panel principal o inicio[cite: 2]
            alert("¡Bienvenido de nuevo a Biddo!");
            window.location.href = '../HTML/mimonedero.html'; // Ajusta la ruta según tu estructura

        } catch (error) {
            console.error("Error de login:", error.message);
            
            // Manejo de errores comunes para el usuario
            let mensajeAmigable = error.message;
            if (error.message.includes("Invalid login credentials")) {
                mensajeAmigable = "Correo o contraseña incorrectos.";
            } else if (error.message.includes("Email not confirmed")) {
                mensajeAmigable = "Por favor, verifica tu correo electrónico antes de entrar.";
            }

            alert(`Error: ${mensajeAmigable}`);
        }
    });
}