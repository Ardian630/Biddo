import { supabase } from './supabaseClient.js';

const form = document.getElementById('form-perfil');
const status = document.getElementById('mensaje-status');

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // Obtener datos actuales de las tablas 'autenticacion' y 'usuarios_perfil'
    const { data: authData } = await supabase.from('autenticacion').select('*').eq('autenticacion_id', user.id).single();
    const { data: perfilData } = await supabase.from('usuarios_perfil').select('*').eq('autenticacion_id', user.id).single();

    if (authData) {
        document.getElementById('nombre_usuario').value = authData.nombre_usuario || "";
        document.getElementById('email').value = authData.email || "";
    }
    if (perfilData) {
        document.getElementById('nombre_completo').value = perfilData.nombre_completo || "";
        document.getElementById('fecha_nacimiento').value = perfilData.fecha_nacimiento || "";
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();

    const dataUpdate = {
        nombre_usuario: document.getElementById('nombre_usuario').value,
        email: document.getElementById('email').value,
        nombre_completo: document.getElementById('nombre_completo').value,
        fecha_nac: document.getElementById('fecha_nacimiento').value
    };

    try {
        // Actualización en cadena
        await supabase.from('autenticacion').update({ 
            nombre_usuario: dataUpdate.nombre_usuario, 
            email: dataUpdate.email 
        }).eq('autenticacion_id', user.id);

        await supabase.from('usuarios_perfil').update({
            nombre_completo: dataUpdate.nombre_completo,
            fecha_nacimiento: dataUpdate.fecha_nac
        }).eq('autenticacion_id', user.id);

        mostrarMensaje("✅ Perfil actualizado", "#4ade80");
    } catch (err) {
        mostrarMensaje("❌ Error al guardar", "#f87171");
    }
});

function mostrarMensaje(txt, color) {
    status.innerText = txt;
    status.style.display = "block";
    status.style.color = color;
}