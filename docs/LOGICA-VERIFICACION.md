# Lógica de transacciones, retiros e imágenes de productos

Este documento describe cómo funcionan los flujos implementados y cómo comprobar que están correctos.

---

## 1. Historial de movimientos (`mimonedero.js`)

### Fuente de datos
El historial **no** usa una tabla `movimientos`. Lee directamente de `operaciones` filtrando por el `monedero_id` del usuario autenticado:

```sql
SELECT * FROM operaciones
WHERE monedero_id = <monedero del usuario>
ORDER BY fecha_creacion DESC
LIMIT 10;
```

### Regla de visualización
| `monto_bruto` | `referencia_interna` contiene | Título mostrado |
|---|---|---|
| Positivo | `TRANSFERENCIA-DE` | Transferencia recibida |
| Negativo | `TRANSFERENCIA-A` | Transferencia enviada |
| Positivo | `RECARGA` / `PAGOMOVIL` | Recarga por Pago Móvil |
| Negativo | `RETIRO` | Retiro a Cuenta Bancaria |
| Positivo | `SUBASTA` | Pago de subasta |

---

## 2. Transferencias — corrección aplicada

### Problema anterior
Al transferir, solo se insertaba una fila en `operaciones` para el **emisor**. El receptor recibía el saldo en `monederos.bdc_disponible`, pero **no tenía registro en `operaciones`**, por lo que su historial quedaba vacío.

### Solución
En `transferir.js`, tras la operación del emisor, se inserta una segunda fila para el receptor:

| Campo | Emisor | Receptor |
|---|---|---|
| `monedero_id` | Monedero del emisor | Monedero del receptor |
| `monto_bruto` | `-(monto + comisión)` | `+monto` |
| `estado_operacion` | Exitosa | Exitosa |
| `referencia_interna` | `TRANSFERENCIA-A-{doc destino}` | `TRANSFERENCIA-DE-{doc emisor}` |

### Cómo verificar
1. Usuario A transfiere 10 BDC a Usuario B.
2. En el monedero de **A**: aparece `-X.XX BDC` con título "Transferencia enviada".
3. En el monedero de **B**: aparece `+10.00 BDC` con título "Transferencia recibida".
4. El saldo de B aumenta exactamente en el monto neto enviado (sin comisión).

```sql
-- Verificar operaciones de una transferencia
SELECT operacion_id, monedero_id, monto_bruto, referencia_interna
FROM operaciones
WHERE referencia_interna LIKE 'TRANSFERENCIA-%'
ORDER BY fecha_creacion DESC;
```

---

## 3. Recargas (referencia)

Flujo existente sin cambios:

1. Usuario solicita recarga → `operaciones` con `monto_bruto` **positivo**, estado **En Proceso**.
2. Se crea fila en `recargas` vinculada por `operacion_id`.
3. Admin confirma en **Operaciones Pendientes** → acredita `bdc_disponible`, estado **Exitosa**.
4. Admin rechaza → estado **Fallida**, sin mover saldo.

---

## 4. Retiros — flujo completo

### Tablas involucradas
- `operaciones` — registro maestro del movimiento
- `retiros` — detalle bancario (análoga a `recargas`)
- `monederos` — `bdc_disponible` y `bdc_retenido`

### Estructura de `retiros`

```sql
CREATE TABLE public.retiros (
    retiro_id         SERIAL PRIMARY KEY,
    operacion_id      INTEGER NOT NULL UNIQUE REFERENCES operaciones(operacion_id),
    banco             VARCHAR(100) NOT NULL,
    numero_cuenta     VARCHAR(50) NOT NULL,
    titular_cuenta    VARCHAR(150) NOT NULL,
    cedula_titular    VARCHAR(20) NOT NULL,
    telefono          VARCHAR(20),
    monto_bruto       NUMERIC(12,2) NOT NULL,  -- total debitado (neto + comisión)
    monto_neto        NUMERIC(12,2) NOT NULL,  -- BDC que recibe el usuario en banco
    monto_bs          NUMERIC(12,2) NOT NULL,  -- equivalente en Bs (tasa_venta)
    fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Paso 1 — Usuario solicita retiro (`retiro.html` + `retiro.js`)

Variables:
- `montoNeto` = BDC que el usuario quiere recibir
- `comision` = `montoNeto × comision_retiro` (de `tasas_config`)
- `totalDebitar` = `montoNeto + comision`
- `montoBs` = `montoNeto × tasa_venta`

Acciones:
1. Validar que `totalDebitar ≤ bdc_disponible`.
2. Insertar en `operaciones`:
   - `monto_bruto = -totalDebitar`
   - `monto_comision = comision`
   - `estado_operacion = 'En Proceso'`
   - `referencia_interna = 'RETIRO-BANCARIO-{timestamp}'`
3. Insertar en `retiros` con datos bancarios.
4. Actualizar monedero:
   - `bdc_disponible -= totalDebitar`
   - `bdc_retenido += montoNeto`

> Los fondos quedan **retenidos** hasta que un admin apruebe o rechace.

### Paso 2 — Admin aprueba (`operaciones-pendientes.js`)

1. `bdc_retenido -= montoNeto` (libera el retiro, el dinero sale de la plataforma).
2. Si hay comisión → acredita comisión al monedero Biddo (ID 7) e inserta operación de recaudación.
3. `operaciones.estado_operacion = 'Exitosa'`.

### Paso 3 — Admin rechaza

1. `bdc_disponible += totalDebitar` (devuelve todo al usuario).
2. `bdc_retenido -= montoNeto`.
3. `operaciones.estado_operacion = 'Fallida'`.

### Cómo verificar un retiro

| Momento | `bdc_disponible` | `bdc_retenido` | Historial usuario |
|---|---|---|---|
| Antes | 100 | 0 | — |
| Solicitud de 50 BDC (2% comisión) | 100 - 51 = **49** | 0 + 50 = **50** | `-51.00 BDC` "Retiro..." En Proceso |
| Admin aprueba | 49 | **0** | Estado → Exitosa |
| Admin rechaza (alternativa) | 49 + 51 = **100** | 50 - 50 = **0** | Estado → Fallida |

```sql
-- Ver retiros pendientes
SELECT o.operacion_id, o.monto_bruto, o.estado_operacion,
       r.monto_neto, r.monto_bs, r.banco, r.titular_cuenta
FROM operaciones o
JOIN retiros r ON r.operacion_id = o.operacion_id
WHERE o.estado_operacion = 'En Proceso';
```

---

## 5. Imagen obligatoria en productos

### Cambio en base de datos
```sql
ALTER TABLE public.productos
ADD COLUMN url_imagen_producto TEXT;
```

Bucket de Storage: **`productos`** (público, máx. 5 MB, JPG/PNG/WEBP/GIF).

### Flujo de publicación
1. Vendedor selecciona imagen (obligatoria).
2. Se sube a `productos/producto-{userId}-{timestamp}.{ext}`.
3. Se guarda la URL pública en `productos.url_imagen_producto`.
4. Mercado y detalle muestran esa URL; si falta, usan placeholder.

### Flujo de edición
- Si el producto ya tiene imagen → puede guardarse sin cambiarla.
- Si no tiene imagen → obligatorio subir una.

### Cómo verificar
1. Intentar publicar sin imagen → debe mostrar error.
2. Publicar con imagen → debe verse en mercado y detalle.
3. En Supabase Storage → bucket `productos` debe contener el archivo.
4. En BD → `url_imagen_producto` no debe ser NULL en productos nuevos.

---

## 6. Script SQL a ejecutar en Supabase

Ejecutar **en orden** el archivo:

```
docs/supabase-modificaciones.sql
```

Contiene:
1. Columna `url_imagen_producto` en `productos`
2. Política RLS para que vendedores vean sus propios productos
3. Bucket y políticas de Storage `productos`
4. Tabla `retiros` con índices y RLS

---

## 7. Checklist de pruebas manuales

### Transferencias
- [ ] Emisor ve movimiento negativo en historial
- [ ] Receptor ve movimiento positivo en historial
- [ ] Saldos cuadran en ambos monederos

### Retiros
- [ ] Pantalla `retiro.html` carga saldo y comisión
- [ ] Solicitud reduce `bdc_disponible` y aumenta `bdc_retenido`
- [ ] Aparece en historial como "Retiro a Cuenta Bancaria" con monto negativo
- [ ] Admin ve la solicitud en Operaciones Pendientes con tipo "Retiro"
- [ ] Aprobar libera retenido y marca Exitosa
- [ ] Rechazar devuelve fondos y marca Fallida

### Productos
- [ ] No se puede publicar sin imagen
- [ ] Imagen visible en mercado y detalle
- [ ] Edición permite cambiar imagen

---

## 8. Diagrama de flujo — retiro

```
Usuario                    BD                         Admin
  │                         │                           │
  ├── Solicita retiro ─────► operaciones (En Proceso)    │
  │                         retiros (detalle bancario)   │
  │                         monederos: disp ↓ reten ↑    │
  │                         │                           │
  │◄── Historial: -X BDC ───┤                           │
  │                         │◄── Aprueba ───────────────┤
  │                         monederos: reten ↓           │
  │                         operaciones: Exitosa         │
  │                         comisión → monedero Biddo    │
  │                         │                           │
  │                         │◄── Rechaza ───────────────┤
  │                         monederos: disp ↑ reten ↓    │
  │                         operaciones: Fallida         │
```

---

## 9. Consistencia contable

Para que los saldos sean coherentes en todo momento:

```
bdc_disponible + bdc_retenido + retiros_pendientes_neto
≈ total BDC que el usuario "posee" en la plataforma
```

Donde `retiros_pendientes_neto` = suma de `retiros.monto_neto` cuyas operaciones están en **En Proceso**.

La comisión de retiro, mientras está pendiente, ya fue descontada de `bdc_disponible` pero no está en `bdc_retenido`; al aprobar, pasa al monedero Biddo.
