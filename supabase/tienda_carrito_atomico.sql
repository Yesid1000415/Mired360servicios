alter table public.tienda_pedidos add column if not exists checkout_key uuid;
alter table public.tienda_pedidos add column if not exists checkout_hash text;
create unique index if not exists tienda_pedidos_checkout_key_idx on public.tienda_pedidos(checkout_key) where checkout_key is not null;
create or replace function public.tienda_crear_carrito(p_key uuid,p_hash text,p_nombre text,p_email text,p_telefono text,p_items jsonb,p_envio jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.tienda_pedidos; x record; c record; total numeric:=0; n integer:=0; rows jsonb:='[]'::jsonb; numero text; descp text;
begin
 if p_key is null or p_hash is null or length(p_hash)<>64 or length(p_nombre)<3 or length(p_nombre)>120 or length(p_email)>254 or length(p_telefono)>20 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Datos inválidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into o from public.tienda_pedidos where checkout_key=p_key;
 if found then
  if o.checkout_hash<>p_hash or o.cliente_email<>p_email then raise exception 'Solicitud distinta'; end if;
  if o.estado_pago<>'pendiente' then raise exception 'Pedido ya finalizado'; end if;
  return jsonb_build_object('id',o.id,'numero',o.numero_pedido,'total',o.valor,'descripcion',o.producto_nombre);
 end if;
 for x in select v->>'sku' as sku,sum((v->>'cantidad')::integer)::integer as cantidad from jsonb_array_elements(p_items) v group by v->>'sku' loop
  if x.cantidad<1 or x.cantidad>20 then raise exception 'Cantidad inválida'; end if;
  select * into c from public.tienda_catalogo where codigo=x.sku and activo=true and categoria='datafono' and tipo_flujo='bold';
  if not found or c.moneda<>'COP' or c.valor<1000 or c.valor<>trunc(c.valor) then raise exception 'Producto no disponible'; end if;
  total:=total+c.valor*x.cantidad; n:=n+x.cantidad;
  rows:=rows||jsonb_build_array(jsonb_build_object('producto_codigo',c.codigo,'producto_nombre',c.nombre,'cantidad',x.cantidad,'valor_unitario',c.valor,'subtotal',c.valor*x.cantidad));
 end loop;
 if total<1000 or total>20000000 then raise exception 'Total inválido'; end if;
 numero:='MR-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||upper(replace(gen_random_uuid()::text,'-',''));
 descp:=case when jsonb_array_length(rows)=1 then rows->0->>'producto_nombre' else 'Compra MIRED360 · '||jsonb_array_length(rows)||' productos' end;
 insert into public.tienda_pedidos(numero_pedido,cliente_nombre,cliente_email,cliente_telefono,tipo_servicio,proveedor,producto_codigo,producto_nombre,referencia,valor,moneda,estado_pago,estado_entrega,pasarela,detalle,checkout_key,checkout_hash)
 values(numero,p_nombre,p_email,p_telefono,'otro','mired360','CARRITO',descp,'CARRITO',total,'COP','pendiente','pendiente','bold',jsonb_build_object('production',true,'cart',true,'item_count',n,'envio',p_envio),p_key,p_hash) returning * into o;
 insert into public.tienda_pedido_items(pedido_id,producto_codigo,producto_nombre,cantidad,valor_unitario,subtotal)
 select o.id,r.producto_codigo,r.producto_nombre,r.cantidad,r.valor_unitario,r.subtotal from jsonb_to_recordset(rows) as r(producto_codigo text,producto_nombre text,cantidad integer,valor_unitario numeric,subtotal numeric);
 return jsonb_build_object('id',o.id,'numero',numero,'total',total,'descripcion',descp);
end $$;
revoke all on function public.tienda_crear_carrito(uuid,text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.tienda_crear_carrito(uuid,text,text,text,text,jsonb,jsonb) to service_role;
grant select,insert on public.tienda_pedido_items to service_role;
