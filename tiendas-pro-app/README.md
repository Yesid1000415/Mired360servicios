# MIRED360 TIENDAS PRO · Fase 1 (arquitectura comercial)

**Versión:** 0.3 — 29 de octubre de 2026  
**Propietario de la marca:** MIRED360SERVICIOS  
**Estado:** código base preparado y comprobaciones estáticas completadas. **NO DESPLEGADO en una base de datos real.**

## Qué trae el paquete

| Archivo | Función |
|---|---|
| `web/demo.html` | Demostración visual premiun, con datos ficticios guardados únicamente en el navegador. |
| `web/panel.html` | Panel real preparado para autenticación, crear comercio, sucursales, productos, invitar equipo, ver pedidos y cambiar estados. |
| `web/tienda.html` | Tienda pública conectable a la base de datos, con catálogo, búsqueda, carrito, atribución a asesor y checkout de servidor. |
| `web/config.example.js` | Configuración pública de la aplicación, sin claves secretas. |
| `database/001_mired360_tiendas.sql` | Modelo multiempresa con 7 tablas, políticas RLS, auditoría, catálogo público protegido y pedido transaccional. |
| `supabase/functions/crear-pedido/index.ts` | API para pedidos con CAPTCHA, verificación de precio, stock e idempotencia. |
| `supabase/functions/invitar-miembro/index.ts` | Invitaciones por correo autorizadas únicamente al propietario. |
| `supabase/config.toml` | Ajustes de autorización de las funciones. |
| `tests/check_static.py` | Verificación estructural y sintáctica del código. |
| `tests/smoke.py` | Pruebas visuales Playwright (requieren navegador sin bloqueos del entorno). |

## Qué funciona al conectar un proyecto dedicado

1. El propietario crea una cuenta con correo y contraseña y registra una tienda privada.
2. Agrega sucursales, productos físicos o servicios, con inventario y valores en COP.
3. Invita a asesores o encargados por correo (requiere configurar la redirección del correo).
4. Cada colaborador entra con su cuenta y consulta sólo los pedidos autorizados para su sucursal o su propio asesor.
5. Cada asesor tiene un enlace de tienda atribuido que puede copiar y compartir.
6. Un comprador puede consultar catálogo y generar pedido; el servidor fija el precio, valida el inventario y asigna sucursal/asesor.
7. El dueño ve consolidado y administra estados; el asesor sólo consulta sus pedidos. La suma de ventas completadas está diferenciada de pedidos pendientes.

## Instalación técnica — **en un proyecto Supabase nuevo y dedicado**

**Nunca ejecutar esta migración en MIRED360CRM, CERCA, Beauty o MIRED360 NEGOCIOS.** Hay que elegir la organización y confirmar cualquier costo de infraestructura antes de crear el proyecto.

1. Crear un proyecto independiente `MIRED360-TIENDAS-PRO` en Supabase, región cercana a Colombia (p. ej. São Paulo si está disponible). Habilitar email/contraseña con confirmación y revisar los ajustes de redirección.
2. Revisar y ejecutar `database/001_mired360_tiendas.sql` en una base recién creada, no sobre datos existentes.
3. Desplegar `crear-pedido` e `invitar-miembro` y definir secretos `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`, `INVITE_REDIRECT_URL`. Supabase debe proveer `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ANON_KEY` al entorno de funciones.
4. Registrar el dominio público en Cloudflare Turnstile; el secreto queda **sólo** en el servidor. El `sitekey` público va en `web/config.js`.
5. Copiar `web/config.example.js` a `web/config.js` y sustituir URL y *publishable key* del nuevo Supabase. **Nunca insertar la llave `service_role` en archivos web.**
6. Publicar `web/panel.html`, `web/tienda.html` y `web/config.js` bajo HTTPS (GitHub Pages o hosting compatible). Configurar dominios válidos para los correos de invitación en Auth. Mantener `demo.html` aislado como demostración.
7. Crear el usuario dueño, la tienda `mired360`, al menos una sucursal y un producto; publicar sólo cuando todo haya sido validado. Probar con dos navegadores, dos teléfonos, una cuenta de asesor y una de propietario.

## Controles de seguridad ya programados

- Separación lógica por tienda (`tienda_id`) en todas las tablas comerciales y relaciones compuestas para impedir referencias cruzadas.
- RLS sobre las 7 tablas; propietario ve su empresa completa, encargado sólo su sede en pedidos, asesor sólo sus pedidos.
- Roles derivados de membresía protegida en base de datos (no de un selector visual ni de metadatos de usuario editables).
- Pedido sólo insertable mediante función de servidor; totales recalculados según precios en base de datos y productos bloqueados en transacción.
- Sin almacenar información bancaria. WhatsApp sólo acompaña la confirmación de un pedido **ya registrado**.
- Protección básica contra automatización mediante Turnstile, URL de origen autorizada y validación de entradas.
- Protección de campos cruciales del pedido, idempotencia y registro de cambios de estado.

## Límites y controles aún por completar antes de cobrar una suscripción

- **Sin despliegue real:** no se han probado invitaciones, compras ni aislamiento entre dos usuarios en un Supabase real. Las pruebas de navegador estuvieron bloqueadas en este entorno; el script está incluido para ejecutar en otro entorno.
- Pasarela de pagos verificada por webhooks, devoluciones y facturación.
- Inventario por sucursal, devoluciones que reponen inventario y límites transaccionales; por ahora el stock es por tienda y se descuenta al registrar un pedido físico.
- Para pedidos cancelados aún **no se repone stock automáticamente**; requiere flujo de devolución auditado.
- Prueba de carga, rate limit durable por IP/usuario, CAPTCHA revisado en producción, límites por plan y protección de datos personales.
- Comisiones parametrizadas por asesor, suscripciones, dominios de clientes, multi-moneda y panel de superadministrador SaaS.
- Pruebas RLS autenticadas (incluidos intentos de acceso entre empresas) y auditoría de seguridad completas.
- Política de privacidad/consentimientos aplicables en Colombia, copias de seguridad y monitoreo de errores.

### Reglas de operación

- El valor facturado no debe interpretarse como ingreso cobrado: sólo se suman las órdenes con estado `completado` para el tablero operativo. No representa confirmación de pago (`pago_estado`).
- Los productos de telecomunicaciones del demo son ilustrativos; precios, cobertura y vigencia deben validarse antes de publicar.
- El catálogo público sólo aparece si tienda y producto están habilitados; crear una cuenta no publica la tienda automáticamente.

## Comprobaciones ejecutadas

`python tests/check_static.py` — pasó: 7 tablas RLS, RPC protegida, idempotencia, ausencia de claves secretas en web y sintaxis de los 4 scripts de cliente/servidor.

**Importante:** una revisión estática no valida las políticas RLS contra Supabase real. No habilitar pagos ni aceptar datos reales hasta ejecutar pruebas end-to-end.