import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
function hex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function safeEq(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
async function hmac(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)))}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 try{
  const raw=await req.text(),sig=(req.headers.get("x-bold-signature")||"").trim().toLowerCase();
  const mode="production"; let verified=false;
  if(mode==="production"){
   const secret=Deno.env.get("BOLD_API_KEY_PRODUCTION")||"";if(!secret)return new Response("Webhook not configured",{status:503});
   const encoded=btoa(unescape(encodeURIComponent(raw))),expected=await hmac(secret,encoded);
   if(!sig||!safeEq(expected,sig))return new Response("Invalid signature",{status:400}); verified=true;
  }else if(!sig)return new Response("Missing signature",{status:400});
  let evt:any;try{evt=JSON.parse(raw)}catch{return new Response("Invalid JSON",{status:400})}
  if(!evt?.id||!evt?.type)return new Response("Ignored",{status:200});
  const ref=evt?.data?.metadata?.reference||evt?.data?.reference||null,tx=evt?.data?.payment_id||evt?.data?.transaction_id||evt?.data?.id||null;
  const amount=evt?.data?.amount?.total??evt?.data?.amount??null,currency=evt?.data?.amount?.currency??evt?.data?.currency??"COP";
  const status=evt.type==="SALE_APPROVED"?"aprobado":evt.type==="SALE_REJECTED"?"rechazado":evt.type==="VOID_APPROVED"?"anulado":"recibido";
  const url=Deno.env.get("SUPABASE_URL")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supa=createClient(url,serviceKey,{auth:{persistSession:false}});
  let pedido:any=null;
  if(ref){const {data:p}=await supa.from("tienda_pedidos").select("id,valor,moneda,tipo_servicio,estado_pago").eq("numero_pedido",ref).maybeSingle();pedido=p||null}
  const pedidoId=pedido?.id||null;
  const audit={pedido_id:pedidoId,proveedor:"bold",ambiente:mode==="production"?"production":"sandbox",evento_id:String(evt.id),evento_tipo:String(evt.type),referencia_pedido:ref,transaccion_id:tx?String(tx):null,estado:status,valor:amount,moneda:currency,firma_verificada:verified,payload:evt,procesado_en:new Date().toISOString()};
  const resp=await fetch(url+"/rest/v1/tienda_pagos?on_conflict=proveedor%2Cambiente%2Cevento_id",{method:"POST",headers:{"apikey":serviceKey,"Authorization":"Bearer "+serviceKey,"Content-Type":"application/json","Prefer":"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(audit)});
  if(!resp.ok){console.error("bold_audit_error",resp.status,await resp.text());return new Response("Audit error",{status:500})}
  if(mode==="sandbox"&&pedidoId&&evt.type==="SALE_APPROVED"){
   const {error:u}=await supa.from("tienda_pedidos").update({pago_referencia:tx?String(tx):String(evt.id),actualizado_en:new Date().toISOString()}).eq("id",pedidoId);
   if(u)console.error("bold_sandbox_link_error",u.message);
  }
  if(mode==="production"&&verified&&pedidoId&&evt.type==="SALE_APPROVED"){
   const expectedAmount=Number(pedido.valor),receivedAmount=Number(amount);
   if(!Number.isFinite(receivedAmount)||receivedAmount!==expectedAmount||String(currency)!==String(pedido.moneda||"COP")){
    console.error("bold_amount_mismatch",JSON.stringify({pedidoId,expectedAmount,receivedAmount,currency}));
    return new Response("Payment mismatch",{status:400});
   }
   const {data:updated,error:u}=await supa.from("tienda_pedidos").update({estado_pago:"aprobado",pasarela:"bold",pago_referencia:tx?String(tx):String(evt.id),actualizado_en:new Date().toISOString()}).eq("id",pedidoId).eq("estado_pago","pendiente").select("id,tipo_servicio").maybeSingle();
   if(u){console.error("bold_order_error",u.message);return new Response("Order update error",{status:500})}
   if(updated?.id&&updated.tipo_servicio==="recarga"){
    const internalToken=Deno.env.get("TIENDA_FULFILLMENT_PRODUCTION_TOKEN")||"";
    if(!internalToken){console.error("fulfillment_not_configured",updated.id)}
    else{
     const fr=await fetch(url+"/functions/v1/tienda-fulfillment-production",{method:"POST",headers:{"Content-Type":"application/json","x-internal-token":internalToken},body:JSON.stringify({pedido_id:updated.id})});
     if(!fr.ok)console.error("fulfillment_trigger_error",fr.status,await fr.text());
    }
   }
  }
  console.log(JSON.stringify({bold_webhook_valid:true,audited:true,verified,mode,type:evt.type,id:evt.id,reference:ref,pedido_id:pedidoId}));
  return new Response("OK",{status:200});
 }catch(e){console.error("bold_webhook_error",e instanceof Error?e.message:String(e));return new Response("Webhook error",{status:500})}
});