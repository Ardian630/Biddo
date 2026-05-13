import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    // Referencias al DOM
    const userMenuWrapper = document.querySelector('.user-dropdown-wrapper');
    const dropdownMenu = document.querySelector('.user-dropdown-menu');
    const btnLoginUI = document.getElementById('btn-login-ui');
    const userMenuContainer = document.getElementById('user-menu');
    const btnLogout = document.getElementById('btn-logout');
    const userNameLabel = document.getElementById('user-name-label');
    const navMonedero = document.getElementById('nav-monedero');
    

    /**
     * 1. GESTIÓN DEL MENÚ DESPLEGABLE (CLICK)
     */
    if (userMenuWrapper) {
        userMenuWrapper.addEventListener('click', (e) => {
            e.stopPropagation(); 
            dropdownMenu.classList.toggle('active');
        });
    }

    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', () => {
        if (dropdownMenu?.classList.contains('active')) {
            dropdownMenu.classList.remove('active');
        }
    });

    /**
     * 2. FUNCIÓN CENTRALIZADA DE INTERFAZ (UI)
     * Controla qué se ve y qué no según la sesión
     */
    async function updateUI(session) {
        if (session && session.user) {
            // --- ESTADO: SESIÓN INICIADA ---
            if (btnLoginUI) btnLoginUI.style.display = 'none';
            if (userMenuContainer) userMenuContainer.style.display = 'block';
            if (navMonedero) navMonedero.style.display = 'block'; // Mostrar Monedero

            try {
                // Consultar nombre real en la base de datos
                const { data, error } = await supabase
                    .from('autenticacion')
                    .select('nombre_usuario')
                    .eq('autenticacion_id', session.user.id)
                    .maybeSingle();

                if (error) throw error;

                const finalName = (data && data.nombre_usuario) 
                    ? data.nombre_usuario 
                    : session.user.email.split('@')[0];

                if (userNameLabel) userNameLabel.textContent = finalName;
                console.log("Sesión activa:", finalName);

            } catch (err) {
                console.warn("Error al traer nombre_usuario, usando email:", err.message);
                if (userNameLabel) userNameLabel.textContent = session.user.email.split('@')[0];
            }
        } else {
            // --- ESTADO: MODO INVITADO ---
            if (btnLoginUI) btnLoginUI.style.display = 'block';
            if (userMenuContainer) userMenuContainer.style.display = 'none';
            if (navMonedero) navMonedero.style.display = 'none'; // Ocultar Monedero
            console.log("Modo invitado activo");
        }
    }

    /**
     * 3. ESCUCHA DE EVENTOS DE AUTENTICACIÓN
     */
    supabase.auth.onAuthStateChange((event, session) => {
        console.log("Evento Auth:", event);
        
        // Manejamos la UI basándonos en la existencia de la sesión
        if (session) {
            updateUI(session);
        } else {
            updateUI(null);
        }
    });

    /**
     * 4. CERRAR SESIÓN
     */
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            const { error } = await supabase.auth.signOut();
            if (!error) {
                window.location.href = '2inicio.html'; 
            } else {
                console.error("Error al salir:", error.message);
            }
        });
    }
});