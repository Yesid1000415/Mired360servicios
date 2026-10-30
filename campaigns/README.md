# MIRED360 CAMPAIGNS — control de entregas
29 de octubre de 2026

## Enlaces
- Panel: https://mired360servicios.com/campaigns/
- Página comercial: https://mired360servicios.com/campaigns/ventas.html
- Código: https://github.com/Yesid1000415/Mired360servicios/tree/main/campaigns

Los archivos están guardados en GitHub, pero se requiere validar manualmente que la ruta nueva carga en GitHub Pages con computador y celular.

## Implementado
- Interfaz corporativa responsive.
- Inicio de sesión y registro mediante Supabase Auth; flujo de recuperación de contraseña.
- Empresas separadas mediante RLS, con roles de propietario, admin y asesor.
- Invitación a colaboradores mediante enlace y correo confirmado; caducidad a 7 días.
- Revocación de colaboradores y cancelación de invitaciones por parte del propietario.
- Contactos, importación Excel XLSX y CSV, detección de nombre y celular entre primeras 20 filas, y exportación CSV.
- Consentimiento declarado, registro de fuente, exclusiones y historial básico de cambios.
- Creación de campañas asistidas, selección de contactos por campaña y apertura individual del chat desde WhatsApp; no hay envíos automáticos desde la aplicación normal.
- Tandas personales de 10, 25 o 50 contactos autorizados, con intervalo de 120 segundos **después de confirmar manualmente el envío**, pausa, continuación, omisión y progreso persistido en Supabase.
- Editor comercial de mensajes con borradores para software, datáfonos, internet/televisión y streaming, más opción de crear desde cero. El contenido es completamente editable y tiene vista previa por contacto con variables {nombre} y {empresa}.
- Permite editar nombre/mensaje de campañas ya creadas, excepto mientras tienen una tanda activa. Los mensajes aprobados por Meta para Cloud API siguen siendo un proceso diferente.
- Panel de diagnóstico de WhatsApp Cloud API exclusivo para administradores, sin revelar tokens ni enviar mensajes; comprueba validez de acceso y número esperado por Meta. Esto NO conecta por sí solo una cuenta ni habilita campañas automáticas.
- Gestiones manuales y resumen comercial.
- Período de prueba de 14 días por propietario (no reinicia por crear otra empresa).
- Estado de licencias, solicitud de plan Emprendedor y activación manual después de verificar el pago; historial.
- Página comercial separada con publicidad de prestaciones efectivamente implementadas.

## Por terminar ANTES de comercializar masivamente
1. **Acceso real:** comprobar las URL publicadas y un flujo completo con usuario y correo de prueba.
2. **Supabase Auth Redirect URLs:** autorizar https://mired360servicios.com/campaigns/ en Authentication > URL Configuration. Si se usa enlace de GitHub Pages, autorizar también su ruta.
3. **Correo SMTP:** el dominio mired360servicios.com ya está verificado para enviar correo mediante Resend, pero falta instalar las credenciales SMTP en la configuración privada de Auth. Datos de Resend: host smtp.resend.com, usuario resend, puerto 465 o 587 según TLS, contraseña mediante API key de Resend, remitente corporativo. Nunca publicar una key en GitHub. La configuración Auth es compartida con MIRED360CRM; revisar efectos antes de cambiarla.
4. **Legales:** completar términos de servicio, política de tratamiento de datos con razón social y NIT, autorizaciones comerciales, exclusiones, gestión de reclamaciones y tratamiento por terceros. Aplican reglas colombianas de Ley 1581 de 2012 y Ley 2300 de 2023 para comunicaciones comerciales.
5. **Infraestructura:** migrar a un proyecto Supabase dedicado al SaaS; configurar copias de seguridad, retención, controles antiabuso y límites por plan. El núcleo actual se aloja temporalmente en la instancia MIRED360SERVICIOS en tablas prefijadas wa_.
6. **Seguridad preexistente:** la instancia compartida contiene avisos sobre funciones antiguas SECURITY DEFINER públicas y protección de contraseñas filtradas. Auditar sin desconfigurar el CRM.
7. **Meta Cloud API:** no está conectada. Requiere cuenta y permisos de Meta, configuración de app y tokens seguros por cliente, plantillas, webhooks y control de tarifas.
8. **Cobros automatizados:** no disponibles; hoy la venta Emprendedor se realiza por WhatsApp y la licencia se activa tras verificar el pago.
9. **Pruebas E2E:** pendientes en navegador; pruebas transaccionales SQL superadas para creación de empresa, invitación, revocación, aislamiento RLS y licencia.

## Consideraciones de seguridad
- La web solo incluye una llave pública de Supabase, no llaves privadas.
- Los controles de acceso críticos se ejecutan en PostgreSQL.
- Las funciones de mayor privilegio verifican la identidad y el rol en el servidor.
- Los contactos sin consentimiento pueden organizarse dentro de campañas, pero no se habilitan para abrir WhatsApp ni para las tandas sin autorización verificable.
- Abrir una conversación por WhatsApp no implica enviado ni entregado.
- Las bibliotecas de navegador son externas y tienen versiones especificadas.

## Tandas asistidas
1. Crear o abrir una campaña y asignarle contactos.
2. Registrar solo las autorizaciones comerciales verificables.
3. Preparar una tanda de 10, 25 o 50 contactos habilitados.
4. Pulsar «Abrir chat», enviar personalmente desde WhatsApp y volver para confirmar «Ya envié el mensaje».
5. Tras confirmar, comienza el reloj de 120 segundos. Nunca se abre otra conversación ni se envía un mensaje automáticamente.
6. Pausar, continuar y omitir no requieren reiniciar la campaña. El avance por usuario y campaña se conserva en la base de datos.
7. El sistema NO conoce el estado real de entrega de WhatsApp normal. El usuario debe respetar el consentimiento y los horarios.

## Importación
Excel .xlsx o CSV UTF-8 con encabezados nombre y celular. Las filas inválidas y repetidas se omiten.

## Contacto comercial
WhatsApp 3229432085 · ventas@mired360servicios.com

## Plantilla oficial de WhatsApp Cloud API — primera fase
- Herramienta del administrador en **Integraciones → Internet Claro Hogar — plantilla oficial**.
- La función privada \`wa-meta-templates\` consulta y solicita aprobación de la plantilla \`mired360_claro_hogar_info_v1\`, categoría \`MARKETING\`, idioma \`es_CO\`. Usa el token del servidor y la WABA MIRED360, no envía secretos al navegador.
- Al aprobar Meta la plantilla, el administrador puede probar **un solo contacto autorizado y asignado** a una campaña que sea de su propiedad. El backend revalida la autorización, la exclusión y la relación empresa-campaña-contacto.
- \`wa_api_envios\` guarda reserva, estado y \`wamid\` con deduplicación por campaña/contacto/plantilla. Está bloqueada para roles públicos y accesible solamente al servidor.
- Un envío aceptado por Meta **no equivale a entregado**. Los eventos de entrega se siguen en \`whatsapp_mensajes\` mediante el webhook existente.
- MIRED360 IA procesa \`SALIR\`, \`BAJA\`, \`STOP\` y expresiones inequívocas de cancelación, bloqueando futuras comunicaciones comerciales para los contactos corporativos correspondientes.
- Esto **no** habilita campañas masivas automáticas. Cada empresa SaaS necesitará su propia conexión oficial y controles de opt-in, suscripciones, plantillas, calidad y facturación.



## Bandeja WhatsApp corporativa — MIRED360SERVICIOS

Acceso: **Bandeja WhatsApp**, solo para el propietario administrador de MIRED360 en el menú de CAMPAIGNS. El resto de empresas del SaaS no puede ver ni utilizar el número corporativo.

- Diseño profesional tipo inbox con lista, búsqueda, filtros, estados de mensaje, panel de conversación y vista móvil en pantalla de chat; contador de mensajes nuevos en el menú y actualización periódica.
- Función de servidor \`wa-inbox\`: lista de conversaciones, lectura del hilo, marcado leído, modo IA/humano y respuesta oficial Meta solamente dentro de la ventana de atención de 24 horas. Requiere JWT válido, perfil superadministrador y propiedad de la organización.
- Fuente: \`whatsapp_mensajes\` filtrada por \`CRM_USER_ID\` del número **3133938312**. No se expone directamente al cliente web. La consulta optimizada \`wa_inbox_resumen\` se ejecuta solo con rol \`service_role\`; el navegador no puede acceder a sus tablas ni funciones internas.
- \`wa_inbox_control\`: registra estado de atención y hasta dónde se han leído los mensajes. El módulo \`mired360-ia-whatsapp\` omite las respuestas cuando el modo de la conversación es \`humano\`, sin desactivar la IA para otras conversaciones.
- El envío manual se habilita solo con modo humano, conversación existente y mensaje entrante de menos de 24 horas. Meta puede aceptar un mensaje sin haberlo entregado todavía. El estado de entrega se actualiza por webhook.
- Solo se muestran los mensajes más recientes de cada conversación; la lista muestra hasta 150 hilos (buscar por nombre o número) y el chat hasta 120 mensajes. La paginación y roles de asesor por empresa serán una fase posterior.
- La bandeja compartida para empresas clientes y los envíos comerciales masivos **no** están habilitados; necesitarán conexión de Meta independiente por empresa, permisos y consentimiento verificable.

