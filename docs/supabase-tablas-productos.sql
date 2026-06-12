-- ============================================================
-- Biddo - Script de creación de tablas para Mercado / Productos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla: categorias
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categorias (
    categoria_id    SERIAL PRIMARY KEY,
    nombre_categoria VARCHAR(100) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.categorias IS 'Categorías del mercado Biddo';
COMMENT ON COLUMN public.categorias.categoria_id IS 'Identificador único de la categoría';
COMMENT ON COLUMN public.categorias.nombre_categoria IS 'Nombre visible de la categoría';

-- ------------------------------------------------------------
-- 2. Tabla: productos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.productos (
    producto_id        SERIAL PRIMARY KEY,
    vendedor_id        UUID NOT NULL REFERENCES public.autenticacion (autenticacion_id) ON DELETE CASCADE,
    categoria_id       INTEGER NOT NULL REFERENCES public.categorias (categoria_id) ON DELETE RESTRICT,
    nombre_producto    VARCHAR(150) NOT NULL,
    descripcion        TEXT NOT NULL,
    precio_bdc         NUMERIC(12, 2) NOT NULL CHECK (precio_bdc > 0),
    fecha_publicacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.productos IS 'Productos publicados por vendedores (rol_id = 3)';
COMMENT ON COLUMN public.productos.vendedor_id IS 'FK al vendedor en autenticacion.autenticacion_id';
COMMENT ON COLUMN public.productos.precio_bdc IS 'Precio en moneda BDC de la plataforma';

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON public.productos (categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_vendedor ON public.productos (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_productos_fecha ON public.productos (fecha_publicacion DESC);

-- ------------------------------------------------------------
-- 3. Datos iniciales de categorías
-- ------------------------------------------------------------
INSERT INTO public.categorias (nombre_categoria) VALUES
    ('Sugerencias'),
    ('Electrónica'),
    ('Moda y Accesorios'),
    ('Hogar'),
    ('Deportes'),
    ('Belleza y Cuidado Personal'),
    ('Videojuegos'),
    ('Otros')
ON CONFLICT (nombre_categoria) DO NOTHING;

-- ------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- ------------------------------------------------------------
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- Categorías: lectura pública
CREATE POLICY "Categorías visibles para todos"
    ON public.categorias
    FOR SELECT
    USING (true);

-- Productos: lectura pública de productos activos
CREATE POLICY "Productos activos visibles para todos"
    ON public.productos
    FOR SELECT
    USING (activo = true);

-- Productos: vendedores (rol 3) pueden insertar sus propios productos
CREATE POLICY "Vendedores pueden publicar productos"
    ON public.productos
    FOR INSERT
    WITH CHECK (
        auth.uid() = vendedor_id
        AND EXISTS (
            SELECT 1
            FROM public.autenticacion a
            WHERE a.autenticacion_id = auth.uid()
              AND a.rol_id = 3
        )
    );

-- Productos: vendedores pueden editar/eliminar solo los suyos
CREATE POLICY "Vendedores pueden actualizar sus productos"
    ON public.productos
    FOR UPDATE
    USING (auth.uid() = vendedor_id)
    WITH CHECK (auth.uid() = vendedor_id);

CREATE POLICY "Vendedores pueden eliminar sus productos"
    ON public.productos
    FOR DELETE
    USING (auth.uid() = vendedor_id);

-- ------------------------------------------------------------
-- 5. Notas de configuración
-- ------------------------------------------------------------
-- • Asignar rol de vendedor a un usuario existente:
--     UPDATE public.autenticacion SET rol_id = 3 WHERE email = 'vendedor@ejemplo.com';
--
-- • El rol por defecto al registrarse depende del RPC registrar_usuario_completo.
--   Si deseas que nuevos usuarios sean compradores, mantén rol_id distinto de 3
--   y asigna rol 3 manualmente o mediante un flujo de solicitud de vendedor.
