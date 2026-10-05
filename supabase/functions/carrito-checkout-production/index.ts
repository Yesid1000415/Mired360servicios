import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";
const O="https://mired360servicios.com",H={"Access-Control-Allow-Origin":O,"Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"};
const J=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json"}});
async function hash(x:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x));return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,"0")).join("")}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(req.method!=="POST"||req.headers.get("origin")!==O)return J({ok:false,error:"Solicitud no permitida"},403);
 try{
 const identity=Deno.env.get("BOLD_IDENTITY_KEY_PRODUCTION")||"",secret=Deno.env.get("BOLD_API_KEY_PRODUCTION")||"";
 if(!identity||!secret)return J({ok:false,error:"Pago no configurado"},503);
 const b=await req.json(),nombre=String(b.nombre||"").trim(),email=String(b.email||"").trim().toLowerCase(),telefono=String(b.telefono||"").replace(/\D/g,""),items=Array.isArray(b.items)?b.items:[],key=String(b.checkout_key||"");
 const ciudad=String(b.envio?.ciudad||"").trim(),direccion=String(b.envio?.direccion||"").trim(),complemento=String(b.envio?.complemento||"").trim();
 if(nombre.length<3||nombre.length>120||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||telefono.length<7||telefono.length>15||ciudad.length<3||ciudad.length>100||direccion.length<5||direccion.length>200||complemento.length>200||!items.length||items.length>20||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))return J({ok:false,error:"Completa los datos del cliente y de entrega."},400);
 const qty=new Map<string,number>();
 for(const x of items){const s=String(x.sku||""),q=Number(x.cantidad);if(!/^BOLD-[A-Z0-9-]{1,60}$/.test(s)||!Number.isInteger(q)||q<1||q>20)return J({ok:false,error:"Carrito inválido"},400);qty.set(s,(qty.get(s)||0)+q)}
 if([...qty.values()].some(q=>q>20))return J({ok:false,error:"Cantidad máxima: 20 por producto."},400);
 const normalized=[...qty].sort(([a],[b])=>a.localeCompare(b)).map(([sku,cantidad])=>({sku,cantidad})),envio={ciudad,direccion,complemento};
 const fingerprint=await hash(JSON.stringify({nombre,email,telefono,items:normalized,envio}));
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const {data:p,error}=await db.rpc("tienda_crear_carrito",{p_key:key,p_hash:fingerprint,p_nombre:nombre,p_email:email,p_telefono:telefono,p_items:normalized,p_envio:envio});
 if(error){console.error("cart_order_error",error.code);return J({ok:false,error:"No fue posible crear el pedido. Revisa los productos o vuelve a intentar."},409)}
 const sig=await hash(p.numero+String(p.total)+"COP"+secret);
 return J({ok:true,pedido:{numero:p.numero,total:p.total},checkout:{orderId:p.numero,currency:"COP",amount:String(p.total),apiKey:identity,integritySignature:sig,description:p.descripcion,redirectionUrl:O+"/pago-resultado.html?pedido="+encodeURIComponent(p.numero)}});
 }catch(_){return J({ok:false,error:"No fue posible preparar la compra"},500)}
});