# Manual de Administrador - Biddo

Bienvenido al panel administrativo de **Biddo**. Este manual te guiará sobre cómo gestionar la plataforma.

## 1. Gestión de Recargas
- Los usuarios solicitarán recargas a través de sus monederos.
- Las solicitudes aparecerán en el panel administrativo.
- **Verificación:** Es necesario confirmar en la cuenta bancaria de la plataforma que el pago móvil (verificado por la referencia de 6-8 dígitos) se ha recibido de forma exitosa y coincide con el monto.
- **Aprobación/Rechazo:** Si los fondos son correctos, aprueba la recarga, lo que liberará el saldo en el monedero del usuario. De lo contrario, rechaza la solicitud indicando el motivo.

## 2. Gestión de Retiros
- Los usuarios pueden solicitar retiros de BDC a su cuenta bancaria.
- Verifica el monto, descuenta la comisión de la plataforma y procesa el pago a la cuenta bancaria del usuario.
- Marca el retiro como "Completado" una vez realizada la transferencia.

## 3. Configuración de Tasas
- **Tasa de Compra y Venta:** Debes actualizar periódicamente las tasas de conversión entre Bolívares y BDC en la tabla `tasas_config` para que las conversiones en tiempo real del sistema sean exactas.

## 4. Supervisión del Mercado
- **Auditoría de Productos:** Puedes monitorear las publicaciones y subastas para asegurar que cumplan con las normas de la plataforma.
- **Resolución de Disputas:** En caso de inconvenientes entre comprador y vendedor durante el proceso de envío, el administrador puede mediar para solucionar el conflicto.

## 5. Mantenimiento y Seguridad
- Revisa de forma periódica las tablas de la base de datos (Supabase) para identificar operaciones pendientes o atascadas.
- Asegúrate de que las políticas de seguridad de base de datos (RLS) en Supabase estén protegiendo la información sensible.
