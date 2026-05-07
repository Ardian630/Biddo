import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    const userMenuWrapper = document.querySelector('.user-dropdown-wrapper');
    const dropdownMenu = document.querySelector('.user-dropdown-menu');
    const btnLoginUI = document.getElementById('btn-login-ui');
    const userMenuContainer = document.getElementById('user-menu');
    const btnLogout = document.getElementById('btn-logout');

    // 1. Manejo del Click para abrir/cerrar
    if (userMenuWrapper) {
        userMenuWrapper.addEventListener('click', (e) => {
            // Evitamos que el click se propague al documento
            e.stopPropagation(); 
            dropdownMenu.classList.toggle('active');
        });
    }

    // 2. Cerrar el menú si se hace click en cualquier otro lugar de la pantalla
    document.addEventListener('click', () => {
        if (dropdownMenu.classList.contains('active')) {
            dropdownMenu.classList.remove('active');
        }
    });

    // 3. Lógica de Supabase (Escucha de sesión)
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            btnLoginUI.style.display = 'none';
            userMenuContainer.style.display = 'block';
            
            const displayName = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
            document.getElementById('user-name-label').textContent = displayName;
        } else {
            btnLoginUI.style.display = 'block';
            userMenuContainer.style.display = 'none';
        }
    });

    // Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.reload();
        });
    }
});