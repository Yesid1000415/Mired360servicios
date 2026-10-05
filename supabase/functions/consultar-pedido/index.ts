import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const cors={"Access-Control-Allow-Origin":"https://mired360servicios.com","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return new Response(JSON.stringify({error:"Método no permitido"}),{status:405,headers:cors});
 try{
  const {pedido,email}=await req.json();
  const p=String(pedido||"").trim().toUpperCase(), e=String(email||"").trim().toLowerCase();
  if(!/^MR-[A-Z0-9-]{6,64}$/.test(p)||!/^\S+@\S+\.\S+$/.test(e)) return new Response(JSON.stringify({error:"Datos inválidos"}),{status:400,headers:cors});
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data,error}=await sb.from("tienda_pedidos").select("id,numero_pedido,producto_nombre,producto_codigo,valor,moneda,estado_pago,estado_entrega,creado_en,actualizado_en").eq("numero_pedido",p).eq("cliente_email",e).maybeSingle();
  if(error) throw error;
  if(!data) return new Response(JSON.stringify({error:"No encontramos un pedido con ese número y correo."}),{status:404,headers:cors});
  const {data:items,error:ie}=await sb.from("tienda_pedido_items").select("producto_codigo,producto_nombre,cantidad,valor_unitario,subtotal").eq("pedido_id",data.id);
  if(ie) throw ie;
  return new Response(JSON.stringify({items:items||[],pedido:data.numero_pedido,producto:data.producto_nombre,codigo:data.producto_codigo,valor:data.valor,moneda:data.moneda,estado_pago:data.estado_pago,estado_entrega:data.estado_entrega,fecha:data.creado_en,actualizado:data.actualizado_en}),{headers:cors});
 }catch(_){return new Response(JSON.stringify({error:"No fue posible consultar el pedido."}),{status:500,headers:cors})}
});