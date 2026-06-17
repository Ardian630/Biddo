-- ============================================================
-- Biddo - Creación de tablas para bancos y cuentas bancarias
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Eliminar columna numero_cuenta de la tabla retiros si existe (ahora se usa Pago Móvil)
ALTER TABLE public.retiros DROP COLUMN IF EXISTS numero_cuenta;

-- ------------------------------------------------------------
-- 1. Tabla: banco
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.banco (
    banco_id      SERIAL PRIMARY KEY,
    nombre_banco  VARCHAR(150) NOT NULL UNIQUE,
    codigo_banco  VARCHAR(10) NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.banco IS 'Catálogo de bancos disponibles en el sistema';
COMMENT ON COLUMN public.banco.banco_id IS 'Identificador único del banco';
COMMENT ON COLUMN public.banco.nombre_banco IS 'Nombre comercial del banco';
COMMENT ON COLUMN public.banco.codigo_banco IS 'Código numérico de asignación de la institución financiera';

-- ------------------------------------------------------------
-- 2. Tabla: cuenta_bancaria (cuenta_cuenta bancaria)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuenta_bancaria (
    cuenta_id       SERIAL PRIMARY KEY,
    usuario_id      UUID NOT NULL REFERENCES public.autenticacion (autenticacion_id) ON DELETE CASCADE,
    banco_id        INTEGER NOT NULL REFERENCES public.banco (banco_id) ON DELETE RESTRICT,
    titular_cuenta  VARCHAR(150) NOT NULL,
    cedula_titular  VARCHAR(20) NOT NULL,
    telefono        VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.cuenta_bancaria IS 'Cuentas bancarias registradas por los usuarios para retiros';
COMMENT ON COLUMN public.cuenta_bancaria.cuenta_id IS 'Identificador único de la cuenta';
COMMENT ON COLUMN public.cuenta_bancaria.usuario_id IS 'FK al usuario propietario de la cuenta';
COMMENT ON COLUMN public.cuenta_bancaria.banco_id IS 'FK al banco asociado';

-- ------------------------------------------------------------
-- 3. Datos iniciales para la tabla banco (Semilla)
-- ------------------------------------------------------------
INSERT INTO public.banco (nombre_banco, codigo_banco) VALUES
    ('Banco de Venezuela', '0102'),
    ('Banco Mercantil', '0105'),
    ('Banco Provincial', '0108'),
    ('Banesco', '0134'),
    ('Banco del Tesoro', '0163'),
    ('BNC (Banco Nacional de Crédito)', '0191')
ON CONFLICT (nombre_banco) DO NOTHING;

-- ------------------------------------------------------------
-- 4. Row Level Security (RLS) para Banco y Cuenta Bancaria
-- ------------------------------------------------------------
ALTER TABLE public.banco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuenta_bancaria ENABLE ROW LEVEL SECURITY;

-- Banco: lectura pública
DROP POLICY IF EXISTS "Bancos visibles para todos" ON public.banco;
CREATE POLICY "Bancos visibles para todos"
    ON public.banco
    FOR SELECT
    USING (true);

-- Cuenta Bancaria: Lectura y escritura exclusiva del dueño
DROP POLICY IF EXISTS "Usuarios ven sus propias cuentas" ON public.cuenta_bancaria;
CREATE POLICY "Usuarios ven sus propias cuentas"
    ON public.cuenta_bancaria
    FOR SELECT
    USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Usuarios insertan sus propias cuentas" ON public.cuenta_bancaria;
CREATE POLICY "Usuarios insertan sus propias cuentas"
    ON public.cuenta_bancaria
    FOR INSERT
    WITH CHECK (auth.uid() = usuario_id);

-- Admins pueden ver todas las cuentas bancarias para conciliación administrativa
DROP POLICY IF EXISTS "Admins ven todas las cuentas" ON public.cuenta_bancaria;
CREATE POLICY "Admins ven todas las cuentas"
    ON public.cuenta_bancaria
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.autenticacion a
            WHERE a.autenticacion_id = auth.uid()
              AND a.rol_id IN (1, 2)
        )
    );

-- ------------------------------------------------------------
-- 5. Correcciones RLS para la tabla recargas (Monto Bs Pendientes)
-- ------------------------------------------------------------
-- Asegurar que RLS esté habilitado en recargas
ALTER TABLE public.recargas ENABLE ROW LEVEL SECURITY;

-- Permitir a usuarios ver sus propias recargas
DROP POLICY IF EXISTS "Usuarios ven sus propias recargas" ON public.recargas;
CREATE POLICY "Usuarios ven sus propias recargas"
    ON public.recargas
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.operaciones o
            JOIN public.monederos m ON m.monedero_id = o.monedero_id
            WHERE o.operacion_id = recargas.operacion_id
              AND m.usuario_id = auth.uid()
        )
    );

-- Permitir a usuarios registrar sus propias recargas
DROP POLICY IF EXISTS "Usuarios crean sus propias recargas" ON public.recargas;
CREATE POLICY "Usuarios crean sus propias recargas"
    ON public.recargas
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.operaciones o
            JOIN public.monederos m ON m.monedero_id = o.monedero_id
            WHERE o.operacion_id = recargas.operacion_id
              AND m.usuario_id = auth.uid()
        )
    );

-- Permitir a administradores ver todas las recargas en el panel de control
DROP POLICY IF EXISTS "Admins ven todas las recargas" ON public.recargas;
CREATE POLICY "Admins ven todas las recargas"
    ON public.recargas
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.autenticacion a
            WHERE a.autenticacion_id = auth.uid()
              AND a.rol_id IN (1, 2)
        )
    );
