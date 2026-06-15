-- ============================================================
-- Biddo - Modificaciones de base de datos
-- Ejecutar en el SQL Editor de Supabase (en orden)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Imagen obligatoria en productos
-- ------------------------------------------------------------
ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS url_imagen_producto TEXT;

COMMENT ON COLUMN public.productos.url_imagen_producto IS
    'URL pública de la imagen del producto en Supabase Storage (bucket: productos)';

-- Política para que vendedores vean sus propios productos (activos e inactivos) al gestionar
DROP POLICY IF EXISTS "Vendedores ven sus propios productos" ON public.productos;
CREATE POLICY "Vendedores ven sus propios productos"
    ON public.productos
    FOR SELECT
    USING (auth.uid() = vendedor_id);

-- ------------------------------------------------------------
-- 2. Bucket de Storage para imágenes de productos
-- (Crear también desde Dashboard > Storage si el INSERT falla)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'productos',
    'productos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Lectura pública imágenes productos" ON storage.objects;
CREATE POLICY "Lectura pública imágenes productos"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'productos');

DROP POLICY IF EXISTS "Vendedores suben imágenes productos" ON storage.objects;
CREATE POLICY "Vendedores suben imágenes productos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'productos');

DROP POLICY IF EXISTS "Vendedores actualizan imágenes productos" ON storage.objects;
CREATE POLICY "Vendedores actualizan imágenes productos"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'productos');

DROP POLICY IF EXISTS "Vendedores eliminan imágenes productos" ON storage.objects;
CREATE POLICY "Vendedores eliminan imágenes productos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'productos');

-- ------------------------------------------------------------
-- 3. Tabla: retiros (análoga a recargas, vinculada a operaciones)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.retiros (
    retiro_id         SERIAL PRIMARY KEY,
    operacion_id      INTEGER NOT NULL UNIQUE
                      REFERENCES public.operaciones (operacion_id) ON DELETE CASCADE,
    banco             VARCHAR(100) NOT NULL,
    numero_cuenta     VARCHAR(50) NOT NULL,
    titular_cuenta    VARCHAR(150) NOT NULL,
    cedula_titular    VARCHAR(20) NOT NULL,
    telefono          VARCHAR(20),
    monto_bruto       NUMERIC(12, 2) NOT NULL CHECK (monto_bruto > 0),
    monto_neto        NUMERIC(12, 2) NOT NULL CHECK (monto_neto > 0),
    monto_bs          NUMERIC(12, 2) NOT NULL CHECK (monto_bs > 0),
    fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.retiros IS 'Solicitudes de retiro BDC a cuenta bancaria (estado en operaciones)';
COMMENT ON COLUMN public.retiros.monto_bruto IS 'Total debitado del monedero (neto + comisión)';
COMMENT ON COLUMN public.retiros.monto_neto IS 'BDC netos que el usuario recibirá en su cuenta bancaria';
COMMENT ON COLUMN public.retiros.monto_bs IS 'Equivalente en bolívares según tasa_venta al momento del retiro';

CREATE INDEX IF NOT EXISTS idx_retiros_operacion ON public.retiros (operacion_id);

-- ------------------------------------------------------------
-- 4. Row Level Security para retiros
-- ------------------------------------------------------------
ALTER TABLE public.retiros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven sus propios retiros" ON public.retiros;
CREATE POLICY "Usuarios ven sus propios retiros"
    ON public.retiros
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.operaciones o
            JOIN public.monederos m ON m.monedero_id = o.monedero_id
            WHERE o.operacion_id = retiros.operacion_id
              AND m.usuario_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Usuarios crean sus propios retiros" ON public.retiros;
CREATE POLICY "Usuarios crean sus propios retiros"
    ON public.retiros
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.operaciones o
            JOIN public.monederos m ON m.monedero_id = o.monedero_id
            WHERE o.operacion_id = retiros.operacion_id
              AND m.usuario_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins ven todos los retiros" ON public.retiros;
CREATE POLICY "Admins ven todos los retiros"
    ON public.retiros
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.autenticacion a
            WHERE a.autenticacion_id = auth.uid()
              AND a.rol_id IN (1, 2)
        )
    );

-- ------------------------------------------------------------
-- 5. Notas post-instalación
-- ------------------------------------------------------------
-- • Tras migrar, los productos existentes sin imagen seguirán usando
--   el placeholder en el frontend hasta que el vendedor los edite.
-- • Para hacer url_imagen_producto NOT NULL en producción (opcional):
--     UPDATE public.productos SET url_imagen_producto = '' WHERE url_imagen_producto IS NULL;
--     ALTER TABLE public.productos ALTER COLUMN url_imagen_producto SET NOT NULL;
