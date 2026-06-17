-- ============================================================
-- Biddo - Creación de tabla para productos deseados (favoritos)
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deseados (
    deseado_id  SERIAL PRIMARY KEY,
    usuario_id  UUID NOT NULL REFERENCES public.autenticacion (autenticacion_id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES public.productos (producto_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un usuario no puede guardar el mismo producto dos veces
    UNIQUE (usuario_id, producto_id)
);

COMMENT ON TABLE public.deseados IS 'Productos marcados como favoritos por los usuarios';
COMMENT ON COLUMN public.deseados.usuario_id IS 'FK al usuario que marcó el producto';
COMMENT ON COLUMN public.deseados.producto_id IS 'FK al producto marcado como favorito';

CREATE INDEX IF NOT EXISTS idx_deseados_usuario ON public.deseados (usuario_id);
CREATE INDEX IF NOT EXISTS idx_deseados_producto ON public.deseados (producto_id);

-- Row Level Security
ALTER TABLE public.deseados ENABLE ROW LEVEL SECURITY;

-- Los usuarios sólo ven sus propios favoritos
DROP POLICY IF EXISTS "Usuarios ven sus propios deseados" ON public.deseados;
CREATE POLICY "Usuarios ven sus propios deseados"
    ON public.deseados FOR SELECT
    USING (auth.uid() = usuario_id);

-- Los usuarios sólo pueden agregar sus propios favoritos
DROP POLICY IF EXISTS "Usuarios insertan sus propios deseados" ON public.deseados;
CREATE POLICY "Usuarios insertan sus propios deseados"
    ON public.deseados FOR INSERT
    WITH CHECK (auth.uid() = usuario_id);

-- Los usuarios sólo pueden eliminar sus propios favoritos
DROP POLICY IF EXISTS "Usuarios eliminan sus propios deseados" ON public.deseados;
CREATE POLICY "Usuarios eliminan sus propios deseados"
    ON public.deseados FOR DELETE
    USING (auth.uid() = usuario_id);
