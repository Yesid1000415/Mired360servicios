create table if not exists public.tienda_gestion_log(id uuid primary key default gen_random_uuid(),pedido_id uuid not null references public.tienda_pedidos(id),admin_id uuid not null references auth.users(id),estado_anterior text not null,estado_nuevo text not null,nota text,creado_en timestamptz not null default now());
alter table public.tienda_gestion_log enable row level security;
revoke all on public.tienda_gestion_log from anon,authenticated;
grant all on public.tienda_gestion_log to service_role;
CREATE OR REPLACE FUNCTION public.tienda_gestionar_entrega(p_id uuid, p_admin uuid, p_estado text, p_nota text, p_version timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare o public.tienda_pedidos;
begin
 select * into o from public.tienda_pedidos where id=p_id for update;
 if not found or o.proveedor<>'mired360' or o.pasarela<>'bold' or o.estado_pago<>'aprobado' or (o.producto_codigo<>'CARRITO' and not exists(select 1 from public.tienda_catalogo where codigo=o.producto_codigo and categoria='datafono')) then raise exception 'Pedido no gestionable'; end if;
 if o.actualizado_en<>p_version then raise exception 'Pedido actualizado. Recarga la lista'; end if;
 if p_estado not in ('pendiente','procesando','entregado','fallido') or length(p_nota)>500 then raise exception 'Estado inválido'; end if;
 if o.estado_entrega='entregado' and p_estado<>'entregado' then raise exception 'Pedido ya entregado'; end if;
 update public.tienda_pedidos set estado_entrega=p_estado,actualizado_en=clock_timestamp(),entrega_finalizada_en=case when p_estado='entregado' then clock_timestamp() else entrega_finalizada_en end where id=p_id;
 insert into public.tienda_gestion_log(pedido_id,admin_id,estado_anterior,estado_nuevo,nota) values(p_id,p_admin,o.estado_entrega,p_estado,p_nota);
 return jsonb_build_object('ok',true);
end $function$

revoke all on function public.tienda_gestionar_entrega(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.tienda_gestionar_entrega(uuid,uuid,text,text,timestamptz) to service_role;