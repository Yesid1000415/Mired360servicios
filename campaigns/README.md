# MIRED360 CAMPAIGNS

Módulo web independiente para gestionar empresas, contactos y campañas asistidas. Implementación inicial del 29 de octubre de 2026.

## Estado real

**Funciona con Supabase Auth y PostgreSQL**: registro y acceso de usuario, creación de empresa, separación de registros por propietario mediante RLS, contactos manuales, importación CSV UTF-8 (nombres y celulares detectados en las primeras 20 filas), registro de consentimiento declarado, exclusión de contactos, campañas asistidas y seguimiento manual de las gestiones.

**No implementado**: envíos automáticos desde WhatsApp normal, API oficial de Meta, envío/recepción programático, webhooks, bandeja multiagente, invitación de asesores, suscripciones cobradas, facturación, controles de cuotas, importación directa XLSX, panel de superadministración. No vender como disponible.

La interfaz se sirve desde GitHub Pages bajo /campaigns/. El backend usa temporalmente la instancia Supabase existente de MIRED360SERVICIOS, pero con tablas **wa_** y políticas independientes. No consulta las tablas del CRM clásico. Antes de comercializar masivamente, migrar a un proyecto dedicado y configurar backups y SMTP propio.

## Seguridad y cumplimiento

- La llave de cliente embebida es **publishable** (pública), nunca es service-role.
- RLS en todas las tablas nuevas.
- Datos por propietario/organización; miembros y roles registrados para ampliación posterior.
- Las campañas asistidas solo muestran contactos con consentimiento declarado y sin exclusión.
- La plataforma NO envía automáticamente mensajes por WhatsApp normal: abre un chat individual prellenado en wa.me. El usuario decide si envía.
- Abrir un chat registra **preparado** y nunca equivale a **enviado** o **entregado**.
- Para Cloud API: plantillas aprobadas por Meta, registro de opt-in, secretos exclusivamente del lado del servidor y estados recibidos por webhook.
- En producción, configurar SMTP propio de Supabase, correos de verificación, redirects, límites de registro, privacidad, política de tratamiento de datos, derecho de revocación y controles antiabuso.

## Primer uso

1. Ingresa en /campaigns/ con una cuenta de Supabase Auth ya confirmada, o crea una cuenta y confírmala por correo.
2. Crea tu empresa desde el formulario inicial.
3. Agrega contactos o usa "Importar CSV". Excel permite guardar el archivo como CSV UTF-8; encabezados sugeridos: nombre, celular.
4. Registra prueba o fuente de autorización cuando corresponda. Los contactos sin permiso no aparecen en campañas.
5. Crea campaña en el módulo Campañas y abre cada chat individualmente.

## Próximas entregas

1. SMTP transaccional, restablecimiento de contraseña, controles de privacidad y límites.
2. Importación directa .xlsx con mapeo de columnas, deduplicación avanzada y paginación server-side.
3. Miembros, invitaciones, sucursales, aislamiento entre usuarios de una misma empresa.
4. WhatsApp Cloud API vía servidor/Edge Functions: conexión segura, plantillas, webhooks, tracking y exclusiones.
5. Facturación y planes SaaS con estado real, roles de administración y costos medidos.
