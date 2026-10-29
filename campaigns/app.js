import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.3/+esm';

const API_URL = 'https://lpiusomsuswdcraoozdn.supabase.co';
const PUBLIC_KEY = 'sb_publishable_ZFjdUsgyfSxOqm4L1SrJJg_Z2f0lL0r';
const db = createClient(API_URL, PUBLIC_KEY);
const $ = (id) => document.getElementById(id);
const state = { user: null, orgs: [], org: null, contacts: [], campaigns: [], actions: [], selectedCampaign: null, page: 'resumen', authMode: 'login' };
const html = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate = (v) => v ? new Date(v).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) : 'Sin fecha';
let toastTimer;

function toast(message, isError = false) {
  const node = $('toast'); node.textContent = message; node.classList.toggle('error', isError); node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 4600);
}
function reportError(error, fallback = 'No se pudo completar la operación.') {
  console.error(error); toast(error?.message || fallback, true);
}
function normalizePhone(value) {
  const str = String(value ?? '').trim().replace(/^00/,'+');
  const digits = str.replace(/\D/g,'');
  let result = '';
  if (/^3\d{9}$/.test(digits)) result = '+57' + digits;
  else if (/^57[3]\d{9}$/.test(digits)) result = '+' + digits;
  else if (str.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) result = '+' + digits;
  if (!result) throw new Error('Usa un celular válido: 10 dígitos colombianos o formato internacional +código.');
  return result;
}
function eligibleContacts() {
  return state.contacts.filter(c => !!c.consentimiento_fecha && !c.excluido);
}
function switchAuth(mode) {
  state.authMode = mode;
  const register = mode === 'register';
  $('authTitle').textContent = register ? 'Empieza a vender mejor' : 'Bienvenido de nuevo';
  $('authSubtitle').textContent = register ? 'Crea una cuenta para organizar tu actividad comercial.' : 'Ingresa para continuar con tus campañas.';
  $('authSubmit').innerHTML = register ? 'Crear mi cuenta <span>→</span>' : 'Ingresar a la plataforma <span>→</span>';
  $('signupOrgField').hidden = !register;
  $('loginTab').classList.toggle('active', !register);
  $('registerTab').classList.toggle('active', register);
  $('authPrompt').textContent = register ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?';
  $('authToggle').textContent = register ? 'Ingresar' : 'Crear cuenta';
  $('authPassword').autocomplete = register ? 'new-password' : 'current-password';
}
async function submitAuth(event) {
  event.preventDefault();
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const submit = $('authSubmit');
  submit.disabled = true;
  try {
    if (state.authMode === 'register') {
      const company = $('authOrg').value.trim();
      if (company.length < 2) throw new Error('Escribe el nombre de la empresa.');
      const {data,error} = await db.auth.signUp({email,password});
      if (error) throw error;
      localStorage.setItem('wa_pending_org',company);
      if (data?.session && data?.user) {
        state.user = data.user; await boot();
      } else {
        toast('Revisa tu correo para confirmar la cuenta. Después regresa e ingresa aquí.');
        switchAuth('login');
      }
    } else {
      const {data,error} = await db.auth.signInWithPassword({email,password});
      if (error) throw error;
      state.user = data.user;
      await boot();
    }
  } catch(error) { reportError(error); } finally { submit.disabled = false; }
}
async function boot() {
  if (!state.user) return;
  $('authScreen').hidden = true; $('appScreen').hidden = false;
  $('userAvatar').textContent = (state.user.email || 'M').slice(0,1).toUpperCase();
  await loadOrgs();
}
async function loadOrgs() {
  const {data,error} = await db.from('wa_organizaciones').select('id,nombre,plan,creado_en').order('creado_en',{ascending:true});
  if (error) { reportError(error); return; }
  state.orgs = data || [];
  if (!state.orgs.length) {
    state.org = null;
    $('workspaceContent').hidden = true;
    $('onboarding').hidden = false;
    $('orgSelect').innerHTML = '<option value="">Sin empresa</option>';
    $('orgName').value = localStorage.getItem('wa_pending_org') || '';
    return;
  }
  $('onboarding').hidden = true; $('workspaceContent').hidden = false;
  const remembered = localStorage.getItem('wa_current_org');
  const selected = state.orgs.find(o => o.id === remembered) || state.orgs[0];
  $('orgSelect').innerHTML = state.orgs.map(o => '<option value="' + html(o.id) + '">' + html(o.nombre) + '</option>').join('');
  await selectOrg(selected.id);
}
async function createOrg(event) {
  if (event) event.preventDefault();
  const inputName = $('onboarding').hidden ? prompt('Nombre de la nueva empresa:') : $('orgName').value;
  const nombre = (inputName || '').trim();
  if (!nombre) return;
  if (nombre.length < 2 || nombre.length > 100) return toast('El nombre debe tener de 2 a 100 caracteres.',true);
  try {
    const {data,error} = await db.from('wa_organizaciones').insert({nombre,propietario_id:state.user.id}).select('id').single();
    if (error) throw error;
    localStorage.setItem('wa_current_org',data.id);
    localStorage.removeItem('wa_pending_org');
    toast('Empresa creada y protegida correctamente.');
    await loadOrgs();
  } catch(error) { reportError(error); }
}
async function selectOrg(id) {
  state.org = state.orgs.find(o => o.id === id) || null;
  if (!state.org) return;
  localStorage.setItem('wa_current_org',id);
  $('orgSelect').value = id;
  state.selectedCampaign = null;
  $('campaignDetail').hidden = true;
  await loadData();
  navigate(state.page);
}
async function allRows(table) {
  const list = []; const pageSize = 500;
  for(let start=0;start<10000;start+=pageSize) {
    const {data,error} = await db.from(table).select('*').eq('organizacion_id',state.org.id).order('id',{ascending:true}).range(start,start+pageSize-1);
    if(error) throw error;
    list.push(...(data || []));
    if((data || []).length < pageSize) return list;
  }
  toast('Esta cuenta supera los 10.000 registros. Se requiere paginación del servidor.',true);
  return list;
}
async function loadData() {
  if (!state.org) return;
  try {
    const [contacts,campaigns,actions] = await Promise.all([allRows('wa_contactos'),allRows('wa_campanas'),allRows('wa_gestiones')]);
    state.contacts = contacts.sort((a,b) => (b.creado_en || '').localeCompare(a.creado_en || ''));
    state.campaigns = campaigns.sort((a,b) => (b.creado_en || '').localeCompare(a.creado_en || ''));
    state.actions = actions;
    renderAll();
  } catch(error) { reportError(error,'Error al consultar los datos de la empresa.'); }
}
function renderAll() {
  $('statContacts').textContent = state.contacts.length.toLocaleString('es-CO');
  $('statOptin').textContent = eligibleContacts().length.toLocaleString('es-CO');
  $('statCampaigns').textContent = state.campaigns.length.toLocaleString('es-CO');
  $('statActions').textContent = state.actions.length.toLocaleString('es-CO');
  $('contactsCount').textContent = state.contacts.length.toLocaleString('es-CO');
  renderContacts();
  renderCampaigns();
  if(state.selectedCampaign) renderCampaignDetail();
}
function navigate(page) {
  state.page = page;
  const names = {resumen:'Resumen',contactos:'Contactos',campanas:'Campañas',integraciones:'Integraciones',planes:'Suscripción'};
  document.querySelectorAll('[data-section]').forEach(el => el.hidden = el.dataset.section !== page);
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active',el.dataset.page === page));
  $('breadcrumbPage').textContent = names[page] || 'Resumen';
  $('sidebar').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}
async function addContact(event) {
  event.preventDefault(); if(!state.org) return;
  const consent = $('contactConsent').checked, source = $('contactSource').value.trim();
  if(consent && !source) return toast('Escribe la fuente del consentimiento.',true);
  try {
    const payload = {
      organizacion_id:state.org.id, creado_por:state.user.id,
      nombre:$('contactName').value.trim(), telefono_e164:normalizePhone($('contactPhone').value),
      origen:$('contactOrigin').value.trim() || null,
      consentimiento_fecha:consent ? new Date().toISOString() : null,
      consentimiento_fuente:consent ? source : null
    };
    const {error} = await db.from('wa_contactos').insert(payload);
    if(error) throw error;
    $('contactForm').reset(); $('contactFormPanel').hidden = true;
    toast('Contacto guardado.'); await loadData();
  } catch(error) {
    if(error.code === '23505') toast('Ese teléfono ya está registrado en esta empresa.',true);
    else reportError(error);
  }
}
function renderContacts() {
  const q = $('contactSearch').value.trim().toLocaleLowerCase();
  const found = state.contacts.filter(c => (c.nombre || '').toLocaleLowerCase().includes(q) || (c.telefono_e164 || '').includes(q)).slice(0,250);
  $('contactsEmpty').hidden = !!found.length;
  $('contactRows').innerHTML = found.map(c => {
    const allow = !!c.consentimiento_fecha, status = c.excluido;
    return '<tr><td><strong>' + html(c.nombre) + '</strong><br><small>' + html(c.origen || 'Sin origen') + '</small></td>' +
      '<td>' + html(c.telefono_e164) + '</td><td><span class="tag ' + (allow?'yes':'no') + '">' + (allow?'Autorizado':'Sin autorizar') + '</span></td>' +
      '<td><span class="tag ' + (status?'off':'yes') + '">' + (status?'Excluido':'Disponible') + '</span></td>' +
      '<td><button class="table-action ' + (status?'':'danger') + '" data-optout="' + html(c.id) + '">' + (status?'Reactivar':'Excluir') + '</button></td></tr>';
  }).join('');
}
async function toggleOptout(id) {
  const c = state.contacts.find(item=>item.id===id);
  if(!c) return;
  const next = !c.excluido;
  if(!next && !confirm('¿Reactivar este contacto? Hazlo únicamente si no solicitó dejar de recibir mensajes.')) return;
  try {
    const {error} = await db.from('wa_contactos').update({excluido:next}).eq('id',id).eq('organizacion_id',state.org.id);
    if(error) throw error;
    toast(next?'Contacto excluido de futuras campañas.':'Contacto reactivado.'); await loadData();
  } catch(error) {reportError(error);}
}
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/,1)[0];
  const separators = [',',';','\t'];
  const sep = separators.sort((a,b)=>firstLine.split(b).length-firstLine.split(a).length)[0];
  const rows = []; let row = [],cell = '',quote = false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quote && text[i+1]==='"'){cell+='"';i++;} else quote=!quote;}
    else if(c===sep&&!quote){row.push(cell.trim());cell='';}
    else if((c==='\r'||c==='\n')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}
function normHeader(v) {
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_\-\.]/g,' ').replace(/\s+/g,' ').trim();
}
function detectCSVHeaders(rows) {
  for(let i=0;i<Math.min(20,rows.length);i++) {
    const heads=rows[i].map(normHeader);
    const name=heads.findIndex(s=>/nombre|cliente|contacto/.test(s)&&!/telefono|celular|numero|asesor/.test(s));
    const phone=heads.findIndex(s=>/celular|telefono|movil|whatsapp|numero.*(contacto|celular|telefono)|phone/.test(s)&&!/nombre/.test(s));
    if(name>=0&&phone>=0&&name!==phone)return {row:i,name,phone};
  }
  return null;
}
async function importCSV(event) {
  const file=event.target.files?.[0]; if(!file || !state.org)return;
  const consent=$('importConsent').checked,source=$('importSource').value.trim();
  event.target.value='';
  if(consent && !source) return toast('Indica primero la fuente de autorización de los contactos.',true);
  if(file.size>5*1024*1024)return toast('El CSV debe pesar menos de 5 MB. Divide el archivo.',true);
  try {
    const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));
    const header=detectCSVHeaders(rows);
    if(!header)throw new Error('No se encontraron encabezados de nombre y celular en las primeras 20 filas.');
    const prepared=[],seen=new Set();let invalid=0;
    for(const row of rows.slice(header.row+1)) {
      const nombre=String(row[header.name]||'').trim().slice(0,160);
      let phone;
      try{phone=normalizePhone(row[header.phone]);}catch{invalid++;continue;}
      if(nombre.length<2 || seen.has(phone)){invalid++;continue;}
      seen.add(phone);
      prepared.push({organizacion_id:state.org.id,creado_por:state.user.id,nombre,telefono_e164:phone,
        origen:'Importación CSV',
        consentimiento_fecha:consent?new Date().toISOString():null,
        consentimiento_fuente:consent?source:null});
    }
    if(!prepared.length)throw new Error('No encontramos filas válidas. Revisa nombres y celulares.');
    if(!confirm('Importar '+prepared.length+' contactos válidos ('+invalid+' filas omitidas). Los duplicados existentes se conservarán sin modificar.'))return;
    let added=0;
    for(let i=0;i<prepared.length;i+=100) {
      const chunk=prepared.slice(i,i+100);
      const {data,error}=await db.from('wa_contactos').upsert(chunk,{onConflict:'organizacion_id,telefono_e164',ignoreDuplicates:true}).select('id');
      if(error)throw error;
      added+=(data||[]).length;
    }
    toast('Importados '+added+' contactos nuevos. '+invalid+' filas descartadas.');await loadData();
  } catch(error) {reportError(error);} 
}
async function addCampaign(event) {
  event.preventDefault();
  if(!state.org)return;
  try {
    const {error}=await db.from('wa_campanas').insert({
      organizacion_id:state.org.id, creado_por:state.user.id, nombre:$('campaignName').value.trim(),
      mensaje:$('campaignText').value.trim(), canal:'asistido', estado:'activa'
    });
    if(error)throw error;
    $('campaignForm').reset();$('campaignFormPanel').hidden=true;
    toast('Campaña creada. El envío es asistido y manual.');await loadData();
  } catch(error){reportError(error);}
}
function renderCampaigns() {
  $('campaignsEmpty').hidden=!!state.campaigns.length;
  $('campaignCards').innerHTML=state.campaigns.map(c=>
    '<article class="campaign-tile"><div class="campaign-meta"><span class="tag yes">WhatsApp asistido</span><span>'+html(formatDate(c.creado_en))+'</span></div>'+
    '<h3>'+html(c.nombre)+'</h3><p>'+html(c.mensaje).slice(0,160)+'</p><button class="btn btn-secondary" data-open-campaign="'+html(c.id)+'">Ver y gestionar →</button></article>'
  ).join('');
}
function renderCampaignDetail() {
  const c=state.campaigns.find(x=>x.id===state.selectedCampaign);
  if(!c){$('campaignDetail').hidden=true;return;}
  $('campaignDetail').hidden=false;
  $('detailTitle').textContent=c.nombre;
  const people=eligibleContacts();
  $('detailHint').textContent=people.length+' contactos autorizados disponibles. Abre uno por uno.';
  $('targetRows').innerHTML=people.slice(0,400).map(person=>{
    const record=state.actions.find(a=>a.campana_id===c.id && a.contacto_id===person.id);
    let stateLabel=record?.estado==='contactado'?'Contactado (manual)':record?.estado==='respondio'?'Respondió':record?.estado==='preparado'?'Chat abierto':'Sin gestionar';
    return '<tr><td><strong>'+html(person.nombre)+'</strong></td><td>'+html(person.telefono_e164)+'</td><td>'+html(stateLabel)+'</td><td>'+
    '<button class="table-action" data-whatsapp="'+html(person.id)+'">Abrir WhatsApp</button> '+
    '<button class="table-action" data-mark-contacted="'+html(person.id)+'">Marcar contactado</button></td></tr>';
  }).join('') || '<tr><td colspan="4">Agrega contactos autorizados para preparar esta campaña.</td></tr>';
}
async function recordAction(contactId,estado) {
  const c=state.campaigns.find(x=>x.id===state.selectedCampaign);
  if(!c)return;
  const {error}=await db.from('wa_gestiones').upsert({
    organizacion_id:state.org.id,campana_id:c.id,contacto_id:contactId,usuario_id:state.user.id,estado,actualizado_en:new Date().toISOString()
  },{onConflict:'campana_id,contacto_id'});
  if(error)throw error;
  await loadData();
}
async function openWhatsApp(contactId) {
  const person=eligibleContacts().find(x=>x.id===contactId);
  const c=state.campaigns.find(x=>x.id===state.selectedCampaign);
  if(!person||!c)return toast('Este contacto no tiene permiso vigente.',true);
  const msg=c.mensaje.replace(/\{nombre\}/gi,person.nombre);
  window.open('https://wa.me/'+person.telefono_e164.replace('+','')+'?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
  try {await recordAction(contactId,'preparado');toast('Conversación abierta. No se ha confirmado el envío.');}
  catch(error){reportError(error);}
}
async function markContacted(contactId) {
  if(!confirm('¿Confirmas que contactaste personalmente a esta persona?'))return;
  try{await recordAction(contactId,'contactado');toast('Gestión manual registrada.');}catch(error){reportError(error);}
}
function bindEvents() {
  $('loginTab').addEventListener('click',()=>switchAuth('login'));
  $('registerTab').addEventListener('click',()=>switchAuth('register'));
  $('authToggle').addEventListener('click',()=>switchAuth(state.authMode==='register'?'login':'register'));
  $('authForm').addEventListener('submit',submitAuth);
  $('orgForm').addEventListener('submit',createOrg);
  $('newOrgButton').addEventListener('click',()=>createOrg());
  $('orgSelect').addEventListener('change',event=>selectOrg(event.target.value));
  $('signOut').addEventListener('click',async()=>{
    await db.auth.signOut();
    state.user=null;state.org=null;state.contacts=[];state.campaigns=[];state.actions=[];
    $('authScreen').hidden=false;$('appScreen').hidden=true;
  });
  $('menuToggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
  document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.go)));
  document.querySelectorAll('[data-hide]').forEach(el=>el.addEventListener('click',()=>$ (el.dataset.hide).hidden=true));
  $('contactFormToggle').addEventListener('click',()=>$('contactFormPanel').hidden=!$('contactFormPanel').hidden);
  $('campaignFormToggle').addEventListener('click',()=>$('campaignFormPanel').hidden=!$('campaignFormPanel').hidden);
  $('contactForm').addEventListener('submit',addContact);
  $('contactSearch').addEventListener('input',renderContacts);
  $('csvFile').addEventListener('change',importCSV);
  $('campaignForm').addEventListener('submit',addCampaign);
  $('contactRows').addEventListener('click',event=>{
    const button=event.target.closest('[data-optout]');
    if(button)toggleOptout(button.dataset.optout);
  });
  $('campaignCards').addEventListener('click',event=>{
    const button=event.target.closest('[data-open-campaign]');
    if(button){state.selectedCampaign=button.dataset.openCampaign;renderCampaignDetail();$('campaignDetail').scrollIntoView({behavior:'smooth'});}
  });
  $('closeDetail').addEventListener('click',()=>{state.selectedCampaign=null;$('campaignDetail').hidden=true;});
  $('targetRows').addEventListener('click',event=>{
    const open=event.target.closest('[data-whatsapp]'),done=event.target.closest('[data-mark-contacted]');
    if(open)openWhatsApp(open.dataset.whatsapp);
    if(done)markContacted(done.dataset.markContacted);
  });
}
async function init() {
  bindEvents();
  try {
    const {data,error}=await db.auth.getUser();
    if(error && !/session missing/i.test(error.message)) console.warn(error.message);
    if(data?.user){state.user=data.user;await boot();}
  } catch(error){reportError(error,'No fue posible iniciar la sesión.');}
}
init();
