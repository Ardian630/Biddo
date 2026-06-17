-- ============================================================
-- Biddo - Script de Actualizaciones de Base de Datos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Modificaciones en la tabla productos (Agregar stock y control)
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 1 CHECK (stock >= 0);

-- 2. Asegurar restricción UNIQUE en usuarios_perfil para la sentencia ON CONFLICT
ALTER TABLE public.usuarios_perfil DROP CONSTRAINT IF EXISTS usuarios_perfil_autenticacion_id_key;
ALTER TABLE public.usuarios_perfil ADD CONSTRAINT usuarios_perfil_autenticacion_id_key UNIQUE (autenticacion_id);

-- 3. Crear tabla de envíos para gestionar la logística post-venta
CREATE TABLE IF NOT EXISTS public.envios (
    envio_id          SERIAL PRIMARY KEY,
    producto_id       INTEGER NOT NULL REFERENCES public.productos (producto_id) ON DELETE CASCADE,
    comprador_id      UUID NOT NULL REFERENCES public.autenticacion (autenticacion_id) ON DELETE CASCADE,
    vendedor_id       UUID NOT NULL REFERENCES public.autenticacion (autenticacion_id) ON DELETE CASCADE,
    cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario   NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
    telefono_contacto VARCHAR(20) NOT NULL,
    direccion_entrega TEXT NOT NULL,
    estado_envio      VARCHAR(50) NOT NULL DEFAULT 'Pendiente', -- 'Pendiente', 'Enviado'
    fecha_envio       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS en envíos
ALTER TABLE public.envios ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para envíos
DROP POLICY IF EXISTS "Usuarios ven sus propios envios" ON public.envios;
CREATE POLICY "Usuarios ven sus propios envios"
    ON public.envios FOR SELECT
    USING (auth.uid() = comprador_id OR auth.uid() = vendedor_id);

DROP POLICY IF EXISTS "Compradores pueden crear envios" ON public.envios;
CREATE POLICY "Compradores pueden crear envios"
    ON public.envios FOR INSERT
    WITH CHECK (auth.uid() = comprador_id);

DROP POLICY IF EXISTS "Vendedores pueden actualizar envios" ON public.envios;
CREATE POLICY "Vendedores pueden actualizar envios"
    ON public.envios FOR UPDATE
    USING (auth.uid() = vendedor_id)
    WITH CHECK (auth.uid() = vendedor_id);

-- 4. FUNCIÓN RPC PARA REDUCIR STOCK DE FORMA SEGURA
-- Esta función permite a cualquier usuario autenticado descontar el stock de un producto al comprarlo
-- sin necesidad de darle permisos globales de UPDATE en la tabla 'productos' (evitando errores de RLS).
CREATE OR REPLACE FUNCTION decrementar_stock_producto(p_producto_id INT, p_cantidad INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.productos
  SET stock = GREATEST(0, COALESCE(stock, 1) - p_cantidad),
      activo = CASE WHEN COALESCE(stock, 1) - p_cantidad > 0 THEN true ELSE false END
  WHERE producto_id = p_producto_id;
END;
$$;
