import { supabase } from './supabaseClient.js';

const form = document.getElementById('form-perfil');
const status = document.getElementById('mensaje-status');
const inputAvatar = document.getElementById('input-avatar');
const avatarPreview = document.getElementById('avatar-preview');

let archivoImagen = null; // Almacena el archivo seleccionado localmente

// 1. CARGAR DATOS AL INICIAR LA PÁGINA
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // Traer datos de autenticacion y usuarios_perfil desde Postgres
    const { data: authData } = await supabase.from('autenticacion').select('*').eq('autenticacion_id', user.id).single();
    const { data: perfilData } = await supabase.from('usuarios_perfil').select('*').eq('autenticacion_id', user.id).single();

    if (authData) {
        document.getElementById('nombre_usuario').value = authData.nombre_usuario || "";
        document.getElementById('email').value = authData.email || "";
    }
    
    if (perfilData) {
        document.getElementById('nombre_completo').value = perfilData.nombre_completo || "";
        document.getElementById('fecha_nacimiento').value = perfilData.fecha_nacimiento || "";
        
        // Elementos nuevos agregados a la interfaz
        if (document.getElementById('telefono')) document.getElementById('telefono').value = perfilData.telefono || "";
        if (document.getElementById('direccion_usuario')) document.getElementById('direccion_usuario').value = perfilData.direccion_usuario || "";
        if (document.getElementById('pasaporte')) document.getElementById('pasaporte').value = perfilData.pasaporte || "";
        
        // Si el usuario ya tiene una foto en el Storage, asignamos su URL
        if (perfilData.url_imagen_vendedor && avatarPreview) {
            // Añadimos un timestamp (?t=...) para romper la caché del navegador al recargar
            avatarPreview.src = `${perfilData.url_imagen_vendedor}?t=${new Date().getTime()}`;
        }
    }
});

// 2. PREVISUALIZACIÓN LOCAL DE LA IMAGEN
if (inputAvatar && avatarPreview) {
    inputAvatar.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            archivoImagen = files[0];
            avatarPreview.src = URL.createObjectURL(archivoImagen);
        }
    });
}

// 3. PROCESAR EL FORMULARIO (SUBIDA DIRECTA A SUPABASE STORAGE)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarMensaje("⏳ Actualizando perfil a máxima velocidad...", "#3b82f6");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Almacenamos los valores actuales de los inputs de texto
    const dataUpdate = {
        nombre_usuario: document.getElementById('nombre_usuario').value,
        email: document.getElementById('email').value,
        nombre_completo: document.getElementById('nombre_completo').value,
        fecha_nac: document.getElementById('fecha_nacimiento').value,
        telefono: document.getElementById('telefono') ? document.getElementById('telefono').value : null,
        direccion: document.getElementById('direccion_usuario') ? document.getElementById('direccion_usuario').value : null,
        pasaporte: document.getElementById('pasaporte') ? document.getElementById('pasaporte').value : null
    };

    let urlImagenFinal = avatarPreview ? avatarPreview.src.split('?')[0] : null; // Limpiar parámetros de caché previos

    try {
        // SI SE SELECCIONÓ UNA NUEVA IMAGEN:
        if (archivoImagen) {
            // Nombre idéntico y fijo (.png) para asegurar que el 'upsert' reemplace el archivo anterior
            const filePath = `avatar-${user.id}.png`;

            // Subir el archivo binario al bucket 'avatares'
            const { error: uploadError } = await supabase.storage
                .from('avatares')
                .upload(filePath, archivoImagen, { 
                    cacheControl: '3600',
                    upsert: true // Obliga a sobreescribir si el archivo ya existe en tu bucket
                });

            if (uploadError) throw uploadError;

            // Obtener la URL pública oficial generada por tu bucket de Supabase
            const { data: urlData } = supabase.storage
                .from('avatares')
                .getPublicUrl(filePath);

            urlImagenFinal = urlData.publicUrl;
        }

        // ACTUALIZAR DATOS EN LA TABLA 'AUTENTICACION'
        const { error: authError } = await supabase.from('autenticacion').update({ 
            nombre_usuario: dataUpdate.nombre_usuario, 
            email: dataUpdate.email 
        }).eq('autenticacion_id', user.id);

        if (authError) throw authError;

        // ACTUALIZAR DATOS EN LA TABLA 'USUARIOS_PERFIL' (Mapeado con tus columnas de Postgres)
        const { error: perfilError } = await supabase.from('usuarios_perfil').update({
            nombre_completo: dataUpdate.nombre_completo,
            fecha_nacimiento: dataUpdate.fecha_nac,
            telefono: dataUpdate.telefono,
            direccion_usuario: dataUpdate.direccion,
            pasaporte: dataUpdate.pasaporte,
            url_imagen_vendedor: urlImagenFinal // Guardamos la URL de Supabase Storage en formato texto
        }).eq('autenticacion_id', user.id);

        if (perfilError) throw perfilError;

        archivoImagen = null; 
        
        // Forzar actualización visual del avatar con la estampa de tiempo actualizada
        if (avatarPreview && urlImagenFinal) {
            avatarPreview.src = `${urlImagenFinal}?t=${new Date().getTime()}`;
        }
        
        mostrarMensaje("✅ ¡Perfil actualizado con éxito!", "#4ade80");
    } catch (err) {
        console.error("Error al gestionar Supabase:", err);
        mostrarMensaje("❌ Error interno al guardar los datos", "#f87171");
    }
});

// Agrega esto al final de tu perfil.js
function mostrarMensaje(txt, color) {
    if (status) {
        status.innerText = txt;
        status.style.display = "block";
        status.style.color = color;
    }
}