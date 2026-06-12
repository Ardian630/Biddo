# Tablas de Mercado — Supabase

Este documento describe las tablas necesarias para el módulo de **Publicar Producto** y **Mercado** de Biddo.

## Archivo SQL

Ejecuta el script completo en el **SQL Editor** de Supabase:

📄 [`supabase-tablas-productos.sql`](./supabase-tablas-productos.sql)

---

## Tabla: `categorias`

| Columna           | Tipo          | Descripción                    |
|-------------------|---------------|--------------------------------|
| `categoria_id`    | SERIAL (PK)   | Identificador único            |
| `nombre_categoria`| VARCHAR(100)  | Nombre visible (único)           |

## Tabla: `productos`

| Columna            | Tipo           | Descripción                              |
|--------------------|----------------|------------------------------------------|
| `producto_id`      | SERIAL (PK)    | Identificador único                      |
| `vendedor_id`      | UUID (FK)      | Referencia a `autenticacion.autenticacion_id` |
| `categoria_id`     | INTEGER (FK)   | Referencia a `categorias.categoria_id`   |
| `nombre_producto`  | VARCHAR(150)   | Título del producto                      |
| `descripcion`      | TEXT           | Descripción detallada                    |
| `precio_bdc`       | NUMERIC(12,2)  | Precio en BDC (debe ser > 0)             |
| `fecha_publicacion`| TIMESTAMPTZ    | Fecha de publicación                     |

> El script también incluye la columna `activo` (BOOLEAN) para ocultar productos sin eliminarlos, y políticas RLS.

---

## Roles

| `rol_id` | Descripción                          |
|----------|--------------------------------------|
| 1, 2     | Admin / moderador                    |
| 3        | Vendedor (puede publicar productos)  |
| Otros    | Comprador / usuario estándar         |

### Asignar rol de vendedor

```sql
UPDATE public.autenticacion
SET rol_id = 3
WHERE email = 'vendedor@ejemplo.com';
```

---

## Políticas RLS incluidas

- **Lectura pública** de categorías y productos activos.
- **Inserción** solo para usuarios autenticados con `rol_id = 3`.
- **Edición/eliminación** solo sobre productos propios.

---

## Categorías iniciales

El script inserta: Sugerencias, Electrónica, Moda y Accesorios, Hogar, Deportes, Belleza y Cuidado Personal, Videojuegos, Otros.

---

## Archivos del frontend relacionados

| Archivo | Función |
|---------|---------|
| `HTML/publicar-producto.html` | Formulario de publicación (solo rol 3) |
| `JS/publicar-producto.js` | Validación e inserción en Supabase |
| `HTML/mercado.html` | Vista del mercado |
| `JS/mercado.js` | Carga productos agrupados por categoría |
| `JS/auth-header.js` | Enlace "Publicar producto" en menú de vendedores |
