import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";
const O="https://mired360servicios.com",H={"Access-Control-Allow-Origin":O,"Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"};
const J=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(req.method!=="POST")return J({error:"Método no permitido"},405);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /i,"");
 const {data:u,error:ae}=await db.auth.getUser(token);
 if(ae||!u.user)return J({error:"Inicia sesión."},401);
 if(u.user.id!=="661a5db6-e11e-4874-b5d3-ed81037de79b")return J({error:"No tienes acceso a la gestión de pedidos."},403);
 try{
 const b=await req.json();
 if(b.action==="update"){
  if(!/^[0-9a-f-]{36}$/i.test(String(b.id))||!["pendiente","procesando","entregado","fallido"].includes(b.estado)||typeof b.nota!=="string"||b.nota.length>500||typeof b.version!=="string")return J({error:"Datos inválidos"},400);
  const {error}=await db.rpc("tienda_gestionar_entrega",{p_id:b.id,p_admin:u.user.id,p_estado:b.estado,p_nota:b.nota,p_version:b.version});
  if(error)return J({error:"No se pudo actualizar. Solo puedes gestionar datáfonos pagados. Recarga la lista."},409);
  return J({ok:true});
 }
 const page=Math.max(0,Math.min(10000,Math.trunc(Number(b.page)||0))),limit=30;
 let q=db.from("tienda_pedidos").select("id,numero_pedido,cliente_nombre,cliente_email,cliente_telefono,producto_codigo,producto_nombre,valor,moneda,estado_pago,estado_entrega,creado_en,actualizado_en,detalle,tienda_pedido_items(producto_nombre,cantidad,valor_unitario,subtotal)",{count:"exact"}).eq("proveedor","mired360").eq("pasarela","bold").order("creado_en",{ascending:false}).range(page*limit,page*limit+limit-1);
 if(["pendiente","aprobado","rechazado","expirado","reembolsado"].includes(b.pago))q=q.eq("estado_pago",b.pago);
 if(["pendiente","procesando","entregado","fallido","reversado"].includes(b.entrega))q=q.eq("estado_entrega",b.entrega);
 const {data,error,count}=await q;if(error)throw error;
 return J({ok:true,pedidos:(data||[]).map(({detalle,...p})=>({...p,envio:detalle?.envio||null})),count,page,limit});
 }catch(_){return J({error:"No fue posible consultar los pedidos."},500)}
});