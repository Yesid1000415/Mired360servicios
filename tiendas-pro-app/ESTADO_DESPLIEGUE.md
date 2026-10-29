# MIRED360 TIENDAS PRO — estado de implementación
Fecha: 29 de octubre de 2026.

## Comprobación de infraestructura
- Se consultó Supabase en la organización de MIRED360SERVICIOS.
- La cotización para un proyecto gratuito fue **$0 mensuales**.
- Se intentó crear un proyecto independiente MIRED360 TIENDAS PRO en Sao Paulo.
- **Supabase denegó la creación:** el titular alcanzó el límite de dos proyectos gratuitos activos.
- No se pausó, eliminó, modificó ni migró ningún proyecto existente.

## Estado del software
- Versión de demostración estética publicada en rama principal como `tiendas-pro.html`.
- Esta rama de desarrollo contiene vistas de panel empresarial y demostración, con configuración deliberadamente inhabilitada.
- La versión técnica completa (incluidos SQL y Edge Functions) está respaldada en el archivo entregado en conversación `MIRED360_TIENDAS_FASE1_CODIGO.zip`. Todavía no se ha aplicado a producción.
- No se aceptan pedidos reales, no hay cuentas de producción nuevas, ni hay un medio de pago habilitado.

## Para desbloquear el despliegue
1. Autorizar expresamente la pausa de un proyecto Supabase gratuito que esté realmente sin uso, después de evaluar respaldos e impacto; **o** aprobar una organización/plan de pago con su precio confirmado.
2. Crear Supabase dedicado.
3. Aplicar migración y desplegar Edge Functions desde el paquete técnico.
4. Configurar Auth, confirmaciones, variables privadas, captcha y claves públicas.
5. Validar con dos usuarios de empresas diferentes, un asesor y un dueño; probar aislamiento RLS, pedidos, inventario y correos.
6. Solo luego habilitar tienda pública y pagos.

Regla: **Nunca instalar el SQL sobre MIRED360CRM, CERCA o cualquier otra base activa.**
