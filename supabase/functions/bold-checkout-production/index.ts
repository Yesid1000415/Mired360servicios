import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const ORIGIN="https://mired360servicios.com", H={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json"}});
async function hash(x:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x));return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,"0")).join("")}
const BEAUTY_URL="https://lyefgbckvzfxkjjumvmp.supabase.co", BEAUTY_KEY="sb_publishable_9WL85w0XrKJwr1CMAHl6-w__n2-Ziix";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H}); if(req.method!=="POST")return J({ok:false,error:"Metodo no permitido"},405); if(req.headers.get("origin")!==ORIGIN)return J({ok:false,error:"Origen no permitido"},403);
 try{
  const identity=Deno.env.get("BOLD_IDENTITY_KEY_PRODUCTION")||"",secret=Deno.env.get("BOLD_API_KEY_PRODUCTION")||""; if(!identity||!secret)return J({ok:false,error:"Bold Produccion no configurado"},503);
  const b=await req.json(); let codigo=String(b.codigo||"").trim(), email=String(b.email||"").trim().toLowerCase(); const nombre=String(b.nombre||"").trim(),telefono=String(b.telefono||"").replace(/\D/g,""),token=String(b.beauty_token||"");
  if(token){
   const rr=await fetch(BEAUTY_URL+"/rest/v1/rpc/resolve_checkout_token",{method:"POST",headers:{"apikey":BEAUTY_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token:token})});
   const a=await rr.json(); if(!rr.ok||!Array.isArray(a)||!a[0])return J({ok:false,error:"Compra Beauty vencida o invalida"},409); codigo=a[0].plan_code; email=a[0].buyer_email;
  }
  if(!codigo||nombre.length<3||nombre.length>120||telefono.length<7||telefono.length>15||email.length>254||!/^\S+@\S+\.\S+$/.test(email))return J({ok:false,error:"Datos invalidos"},400);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:item,error:ce}=await db.from("tienda_catalogo").select("codigo,nombre,categoria,valor,moneda,activo").eq("codigo",codigo).eq("activo",true).maybeSingle(); if(ce||!item)return J({ok:false,error:"Producto no disponible"},404);
  const valor=Math.trunc(Number(item.valor)); if(!Number.isInteger(valor)||valor<1000)return J({ok:false,error:"Precio invalido"},500);
  const numero="MR-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,6).toUpperCase();
  if(token){
   const br=await fetch(BEAUTY_URL+"/rest/v1/rpc/bind_checkout_order",{method:"POST",headers:{"apikey":BEAUTY_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token:token,p_order:numero})});
   const ok=await br.json(); if(!br.ok||ok!==true)return J({ok:false,error:"No fue posible vincular la barberia"},409);
  }
  const {data:p,error:pe}=await db.from("tienda_pedidos").insert({numero_pedido:numero,cliente_nombre:nombre,cliente_email:email||null,cliente_telefono:telefono,tipo_servicio:"otro",proveedor:"mired360",producto_codigo:item.codigo,producto_nombre:item.nombre,referencia:item.codigo,valor,moneda:item.moneda,estado_pago:"pendiente",estado_entrega:"pendiente",pasarela:"bold",detalle:{categoria:item.categoria,production:true,beauty_token:token||null}}).select("id,numero_pedido").single();
  if(pe)return J({ok:false,error:"No se pudo crear el pedido"},500);
  const integrity=await hash(numero+String(valor)+String(item.moneda)+secret);
  return J({ok:true,pedido:{id:p.id,numero:p.numero_pedido,producto:item.nombre,valor,moneda:item.moneda},checkout:{orderId:numero,currency:item.moneda,amount:String(valor),apiKey:identity,integritySignature:integrity,description:item.nombre,redirectionUrl:ORIGIN+"/pago-resultado.html?pedido="+encodeURIComponent(numero)+(token?"&beauty_token="+encodeURIComponent(token):"")}});
 }catch(e){console.error(e);return J({ok:false,error:"Error interno"},500)}
});