import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Referencias seguras al DOM
    const userMenuWrapper = document.querySelector('.user-dropdown-wrapper');
    const dropdownMenu = document.querySelector('.user-dropdown-menu');
    const btnLoginUI = document.getElementById('btn-login-ui');
    const userMenuContainer = document.getElementById('user-menu');
    const btnLogout = document.getElementById('btn-logout');
    const userNameLabel = document.getElementById('user-name-label');
    const navMonedero = document.getElementById('nav-monedero');
    const userAvatarNav = document.getElementById('user-avatar-nav'); 

    /**
     * 2. GESTIÓN DEL MENÚ DESPLEGABLE
     */
    if (userMenuWrapper && dropdownMenu) {
        userMenuWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('active');
        });
    }

    // Cerrar menú al hacer clic fuera del dropdown
    document.addEventListener('click', () => {
        if (dropdownMenu && dropdownMenu.classList.contains('active')) {
            dropdownMenu.classList.remove('active');
        }
    });

    /**
     * 3. CONTROL CENTRALIZADO DE LA INTERFAZ (UI)
     */
     async function updateUI(session) {
        // 1. Nuevas referencias a los elementos dinámicos del DOM
        const navMercado = document.getElementById('nav-mercado');
        const navSubastas = document.getElementById('nav-subastas');
        const navAdminOps = document.getElementById('nav-admin-ops');
        
        if (session && session.user) {
            // --- ESTADO: SESIÓN INICIADA ---
            if (btnLoginUI) btnLoginUI.style.display = 'none';
            if (userMenuContainer) userMenuContainer.style.display = 'block';
            if (navMonedero) navMonedero.style.display = 'block';
    
            try {
                // CONSULTA EXTENDIDA: Traemos también el campo rol_id
                const { data: authData, error: authError } = await supabase
                    .from('autenticacion')
                    .select('nombre_usuario, rol_id') // <-- Traemos el rol_id de la BD
                    .eq('autenticacion_id', session.user.id)
                    .maybeSingle();
    
                if (authError) throw authError;
    
                // Renderizar nombre de usuario
                const finalName = (authData && authData.nombre_usuario)
                    ? authData.nombre_usuario
                    : session.user.email.split('@')[0];
    
                if (userNameLabel) userNameLabel.textContent = finalName;
    
                // ========================================================
                // LÓGICA DE ROLES (rol_id === 1 o rol_id === 2)
                // ========================================================
                if (authData && (authData.rol_id === 1 || authData.rol_id === 2)) {
                    
                    // A. Ocultar Mercado y Subastas en el NAV
                    if (navMercado) navMercado.style.display = 'none';
                    if (navSubastas) navSubastas.style.display = 'none';

                    const elGestionar = document.getElementById('dropdown-gestionar');
                    if (elGestionar) elGestionar.remove();
    
                    // B. Mostrar e Inyectar "Operaciones Pendientes" en el NAV
                    if (navAdminOps) {
                        navAdminOps.innerHTML = `<a href="../HTML/operaciones-pendientes.html" class="anchors">Operaciones Pendientes</a>`;
                        navAdminOps.style.display = 'block';
                    }
    
                    // C. Agregar "Tasas y comisiones" al menú desplegable del perfil
                    // Primero verificamos que no se haya agregado ya para evitar duplicados
                    if (!document.getElementById('dropdown-tasas')) {
                        const liTasas = document.createElement('li');
                        liTasas.id = 'dropdown-tasas';
                        liTasas.innerHTML = `<a href="../HTML/tasas-config.html"><i class="fa-solid fa-percent"></i> Tasas y comisiones</a>`;
                        
                        // Lo insertamos justo antes de la línea divisoria (o antes del botón de cerrar sesión)
                        const divider = dropdownMenu.querySelector('.divider');
                        if (divider) {
                            dropdownMenu.insertBefore(liTasas, divider);
                        } else {
                            dropdownMenu.appendChild(liTasas);
                        }
                    }
                } else {
                    // Si el usuario está logueado pero NO es rol 1 ni 2 (Reseteo de seguridad)
                    if (navMercado) navMercado.style.display = 'block';
                    if (navSubastas) navSubastas.style.display = 'block';
                    if (navAdminOps) navAdminOps.style.display = 'none';
                    const elTasas = document.getElementById('dropdown-tasas');
                    if (elTasas) elTasas.remove();

                    // Agregar enlace "Mis Deseados" para todos los usuarios normales
                    if (!document.getElementById('dropdown-deseados')) {
                        const liDeseados = document.createElement('li');
                        liDeseados.id = 'dropdown-deseados';
                        liDeseados.innerHTML = `<a href="../HTML/deseados.html"><i class="fa-solid fa-heart"></i> Mis Deseados</a>`;
                        const divider = dropdownMenu.querySelector('.divider');
                        if (divider) {
                            dropdownMenu.insertBefore(liDeseados, divider);
                        } else {
                            dropdownMenu.appendChild(liDeseados);
                        }
                    }

                    // Vendedores (rol_id === 3): enlace para gestionar productos
                    if (authData && authData.rol_id === 3) {
                        if (!document.getElementById('dropdown-gestionar')) {
                            const liGestionar = document.createElement('li');
                            liGestionar.id = 'dropdown-gestionar';
                            liGestionar.innerHTML = `<a href="../HTML/gestionar-productos.html"><i class="fa-solid fa-store"></i> Gestionar Productos</a>`;
                            const divider = dropdownMenu.querySelector('.divider');
                            if (divider) {
                                dropdownMenu.insertBefore(liGestionar, divider);
                            } else {
                                dropdownMenu.appendChild(liGestionar);
                            }
                        }
                    } else {
                        const elGestionar = document.getElementById('dropdown-gestionar');
                        if (elGestionar) elGestionar.remove();
                    }
                }
                // ========================================================
    
                // Consultar imagen de perfil en 'usuarios_perfil'
                const { data: perfilData } = await supabase
                    .from('usuarios_perfil')
                    .select('url_imagen_vendedor')
                    .eq('autenticacion_id', session.user.id)
                    .maybeSingle();
    
                if (perfilData && perfilData.url_imagen_vendedor && userAvatarNav) {
                    userAvatarNav.src = `${perfilData.url_imagen_vendedor}?t=${new Date().getTime()}`;
                } else if (userAvatarNav) {
                    userAvatarNav.src = "../assets/img/user1.jpeg";
                }
    
            } catch (err) {
                console.warn("Error al traer datos dinámicos del header:", err.message);
                if (userNameLabel) userNameLabel.textContent = session.user.email.split('@')[0];
                if (userAvatarNav) userAvatarNav.src = "../assets/img/user1.jpeg";
            }
        } else {
            // --- ESTADO: MODO INVITADO (Valores por defecto de la App) ---
            if (btnLoginUI) btnLoginUI.style.display = 'block';
            if (userMenuContainer) userMenuContainer.style.display = 'none';
            if (navMonedero) navMonedero.style.display = 'none';
            if (navMercado) navMercado.style.display = 'block';
            if (navSubastas) navSubastas.style.display = 'block';
            if (navAdminOps) navAdminOps.style.display = 'none';
            if (userAvatarNav) userAvatarNav.src = "../assets/img/user1.jpeg";
            
            // Remover enlaces dinámicos si existían de una sesión previa
            const elTasas = document.getElementById('dropdown-tasas');
            if (elTasas) elTasas.remove();
            const elGestionar = document.getElementById('dropdown-gestionar');
            if (elGestionar) elGestionar.remove();
        }
    }

    /**
     * 4. ESCUCHA DE CAMBIOS DE AUTENTICACIÓN
     */
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            updateUI(session);
        } else {
            updateUI(null);
        }
    });

    /**
     * 5. BOTÓN PARA CERRAR SESIÓN
     */
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            const { error } = await supabase.auth.signOut();
            if (!error) {
                window.location.href = '2inicio.html';
            } else {
                console.error("Error al cerrar sesión:", error.message);
            }
        });
    }
});