import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.3/+esm';
import { createManualQueueController } from './queue.js?v=20261029-tandas-9';

const API_URL = 'https://lpiusomsuswdcraoozdn.supabase.co';
const PUBLIC_KEY = 'sb_publishable_ZFjdUsgyfSxOqm4L1SrJJg_Z2f0lL0r';
const db = createClient(API_URL, PUBLIC_KEY);
const $ = (id) => document.getElementById(id);
const state = { user: null, orgs: [], org: null, contacts: [], campaigns: [], actions: [], invites: [], teamMembers: [], member: null, isSuperAdmin: false, recovering: false, contactLimit: 250, recipientAssignments: [], campaignPick: new Set(), campaignPickLimit: 150, campaignTargetLimit: 150, returnToCampaign: false, manualQueues: [], selectedCampaign: null, editingCampaignId: null, page: 'resumen', authMode: 'login' };
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
function permittedCommercialHourCO() {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t)?.value;
  const day=get('weekday'),minutes=Number(get('hour'))*60+Number(get('minute'));
  return day==='Sat' ? minutes>=480 && minutes<900 : day==='Sun' ? false : minutes>=420 && minutes<1140;
}
function eligibleContacts() {
  return state.contacts.filter(c => !!c.consentimiento_fecha && !c.excluido);
}
function pendingInvite() {
  const token = new URLSearchParams(window.location.search).get('invite');
  if(token && /^[a-f0-9-]{36}$/i.test(token)) localStorage.setItem('wa_pending_invite',token);
  return localStorage.getItem('wa_pending_invite') || '';
}
function switchAuth(mode) {
  state.authMode = mode;
  const register = mode === 'register', invited=!!pendingInvite();
  $('authTitle').textContent = register ? (invited?'Únete al equipo':'Empieza a vender mejor') : 'Bienvenido de nuevo';
  $('authSubtitle').textContent = invited ? (register?'Crea tu cuenta con el correo invitado.':'Ingresa con el correo invitado para aceptar el acceso.') : (register?'Crea una cuenta para organizar tu actividad comercial.':'Ingresa para continuar con tus campañas.');
  $('authSubmit').innerHTML = register ? 'Crear mi cuenta <span>→</span>' : 'Ingresar a la plataforma <span>→</span>';
  $('signupOrgField').hidden = !register || invited;
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
      const invited=!!pendingInvite();
      const company = invited ? '' : $('authOrg').value.trim();
      if (!invited && company.length < 2) throw new Error('Escribe el nombre de la empresa.');
      const inviteSuffix = invited ? '?invite='+encodeURIComponent(pendingInvite()) : '';
      const {data,error} = await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin + window.location.pathname + inviteSuffix}});
      if (error) throw error;
      if(!invited)localStorage.setItem('wa_pending_org',company);
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
  const {data:administrator}=await db.from('wa_superadministradores').select('usuario_id').eq('usuario_id',state.user.id).maybeSingle();
  state.isSuperAdmin=!!administrator;
  $('adminNav').hidden=!state.isSuperAdmin;
  $('inboxNav').hidden=!state.isSuperAdmin;
  $('inboxIntegrationLink').hidden=!state.isSuperAdmin;
  $('inboxQuickLink').hidden=!state.isSuperAdmin;
  $('apiSummaryDescription').textContent=state.isSuperAdmin
    ?'Número corporativo 3133938312 operativo. Respuestas y conversaciones en la Bandeja WhatsApp.'
    :'La integración oficial para tu empresa se encuentra en preparación. Puedes utilizar campañas asistidas.';
  $('apiSummaryState').textContent=state.isSuperAdmin?'Operativa':'Pendiente';
  $('apiSummaryState').className=state.isSuperAdmin?'status available':'status pending';
  $('apiOwnerPanel').hidden=!state.isSuperAdmin;
  $('apiTenantNotice').hidden=state.isSuperAdmin;
  const invite = pendingInvite();
  if(invite){
    const {data:accepted,error} = await db.rpc('wa_aceptar_invitacion',{p_id:invite});
    if(error) reportError(error,'No fue posible aceptar la invitación. Verifica el correo invitado.');
    else {
      localStorage.setItem('wa_current_org',accepted);
      localStorage.removeItem('wa_pending_invite');
      toast('Invitación aceptada. Bienvenido al equipo.');
    }
    window.history.replaceState({},'',window.location.pathname);
  }
  await loadOrgs();
  const targetView=new URLSearchParams(window.location.search).get('view');
  if(targetView==='bandeja' && state.isSuperAdmin && state.org){
    navigate('bandeja');
  }else if(targetView==='bandeja' && !state.isSuperAdmin){
    toast('Esta bandeja corporativa requiere ingresar como administrador de MIRED360.',true);
  }
  if(state.isSuperAdmin)inboxStartBadge();else inboxStopBadge();
}
async function loadOrgs() {
  const {data,error} = await db.from('wa_organizaciones').select('id,nombre,plan,estado_suscripcion,prueba_hasta,vigente_hasta,creado_en').order('creado_en',{ascending:true});
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
  const {data:membership,error:membershipError}=await db.from('wa_miembros').select('rol').eq('organizacion_id',id).eq('usuario_id',state.user.id).maybeSingle();
  if(membershipError){reportError(membershipError);return;}
  state.member=membership;
  localStorage.setItem('wa_current_org',id);
  $('orgSelect').value = id;
  state.selectedCampaign = null;
  state.editingCampaignId = null;
  state.recipientAssignments = [];
  state.manualQueues = [];
  state.campaignPick = new Set();
  $('campaignDetail').hidden = true;
  $('campaignAssignPanel').hidden = true;
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
    const [contacts,campaigns,actions,assignments,queues,invites,members] = await Promise.all([allRows('wa_contactos'),allRows('wa_campanas'),allRows('wa_gestiones'),allRows('wa_campana_destinatarios'),allRows('wa_campana_colas'),state.member?.rol==='propietario'?allRows('wa_invitaciones'):Promise.resolve([]),state.member?.rol==='propietario'?db.rpc('wa_equipo_listar',{p_org:state.org.id}).then(x=>{if(x.error)throw x.error;return x.data||[];}):Promise.resolve([])]);
    state.contacts = contacts.sort((a,b) => (b.creado_en || '').localeCompare(a.creado_en || ''));
    state.campaigns = campaigns.sort((a,b) => (b.creado_en || '').localeCompare(a.creado_en || ''));
    state.actions = actions;
    state.recipientAssignments = assignments;
    state.manualQueues = queues;
    state.invites = invites;
    state.teamMembers = members;
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
  renderTeam();
  renderLicense();
  renderMetaTestCampaigns();
  if(state.selectedCampaign) renderCampaignDetail();
}
function navigate(page) {
  state.page = page;
  const names = {resumen:'Resumen',contactos:'Contactos',campanas:'Campañas',bandeja:'Bandeja WhatsApp',equipo:'Equipo',integraciones:'Integraciones',planes:'Suscripción',administracion:'Administración'};
  document.querySelectorAll('[data-section]').forEach(el => el.hidden = el.dataset.section !== page);
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active',el.dataset.page === page));
  $('breadcrumbPage').textContent = names[page] || 'Resumen';
  $('sidebar').classList.remove('open');
  if(page==='bandeja'&&!state.isSuperAdmin){
    toast('La bandeja corporativa solo está disponible para el administrador.',true);
    return;
  }
  if(page==='bandeja'&&state.isSuperAdmin)inboxStart(); else inboxStop();
  if(page==='administracion'&&state.isSuperAdmin)loadAdmin();
  if(page==='integraciones'&&state.isSuperAdmin){
    renderMetaTestCampaigns();
    refreshMetaTemplate();
    refreshMetaDeliveries();
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
async function addContact(event) {
  event.preventDefault(); if(!state.org) return;
  if(!licenseEnabled())return toast('Suscripción vencida: solicita la activación.',true);
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
  const filter = $('contactFilter').value;
  const authorized = eligibleContacts().length;
  const pending = state.contacts.filter(c => !c.consentimiento_fecha && !c.excluido).length;
  $('contactSummaryTitle').textContent = state.contacts.length.toLocaleString('es-CO') + ' registrados · ' + authorized.toLocaleString('es-CO') + ' autorizados · ' + pending.toLocaleString('es-CO') + ' pendientes';
  $('contactSummaryText').textContent = pending > 0
    ? 'Los contactos ya están guardados en tu empresa. Los que aún no tienen autorización no se muestran en campañas. Registra el permiso únicamente si puedes verificarlo.'
    : 'La base está registrada. Solo los contactos con permiso vigente aparecen en las campañas.';
  $('showPendingContacts').disabled = pending === 0;
  const filtered = state.contacts.filter(c => {
    if (filter==='pending' && (c.consentimiento_fecha || c.excluido)) return false;
    if (filter==='allowed' && (!c.consentimiento_fecha || c.excluido)) return false;
    if (filter==='excluded' && !c.excluido) return false;
    return (c.nombre || '').toLocaleLowerCase().includes(q) || (c.telefono_e164 || '').includes(q);
  });
  const found=filtered.slice(0,state.contactLimit);
  $('contactsEmpty').hidden = !!found.length;
  $('contactDisplayCount').textContent = 'Mostrando '+found.length.toLocaleString('es-CO')+' de '+filtered.length.toLocaleString('es-CO')+' contactos encontrados.';
  $('contactLoadMore').hidden = filtered.length <= found.length;
  $('contactRows').innerHTML = found.map(c => {
    const allow = !!c.consentimiento_fecha, status = c.excluido;
    return '<tr><td><strong>' + html(c.nombre) + '</strong><br><small>' + html(c.origen || 'Sin origen') + '</small></td>' +
      '<td>' + html(c.telefono_e164) + '</td><td><span class="tag ' + (allow?'yes':'no') + '">' + (allow?'Autorizado':'Sin autorizar') + '</span></td>' +
      '<td><span class="tag ' + (status?'off':'yes') + '">' + (status?'Excluido':'Disponible') + '</span></td>' +
      '<td>' + (!allow&&!status?'<button class="table-action" data-verify-consent="' + html(c.id) + '">Registrar permiso</button> ':'') +
      '<button class="table-action ' + (status?'':'danger') + '" data-optout="' + html(c.id) + '">' + (status?'Reactivar':'Excluir') + '</button></td></tr>';
  }).join('');
}
function openConsentForm(id) {
  state.returnToCampaign=false;
  const person=state.contacts.find(c=>c.id===id);
  if(!person)return toast('Contacto no encontrado.',true);
  if(person.excluido)return toast('Este contacto fue excluido. Necesita nueva autorización y revisión de su exclusión.',true);
  $('consentContactId').value=person.id;
  $('consentContactTitle').textContent=person.nombre;
  $('consentEvidence').value='';
  $('consentVerified').checked=false;
  const current=new Date(), local=new Date(current.getTime()-current.getTimezoneOffset()*60000).toISOString().slice(0,16);
  $('consentDate').max=local;
  $('consentDate').value='';
  $('consentFormPanel').hidden=false;
  $('consentFormPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveContactConsent(event) {
  event.preventDefault();
  if(!state.org || !licenseEnabled())return toast('No hay una empresa con acceso activo.',true);
  const id=$('consentContactId').value, person=state.contacts.find(c=>c.id===id);
  if(!person || person.excluido)return toast('El contacto no está disponible para autorizar.',true);
  if(!$('consentVerified').checked)return toast('Confirma la verificación del permiso.',true);
  const source=$('consentEvidence').value.trim(),timestamp=new Date($('consentDate').value);
  if(source.length<6)return toast('Describe la fuente verificable de la autorización.',true);
  if(!Number.isFinite(timestamp.getTime()) || timestamp.getTime()>Date.now())return toast('Indica una fecha válida que no sea futura.',true);
  $('saveConsent').disabled=true;
  try {
    const {data,error}=await db.from('wa_contactos').update({
      consentimiento_fecha:timestamp.toISOString(),consentimiento_fuente:source
    }).eq('id',id).eq('organizacion_id',state.org.id).select('id').single();
    if(error)throw error;
    if(!data)throw new Error('No se pudo actualizar el contacto.');
    $('consentFormPanel').hidden=true;
    toast('Autorización registrada. El contacto ya puede aparecer en campañas.');
    await loadData();
    if(state.returnToCampaign && state.selectedCampaign){
      state.returnToCampaign=false;
      navigate('campanas');
      renderCampaignDetail();
      $('campaignDetail').scrollIntoView({behavior:'smooth',block:'start'});
    }
  }catch(error){reportError(error);}finally{$('saveConsent').disabled=false;}
}
async function toggleOptout(id) {
  const c = state.contacts.find(item=>item.id===id);
  if(!c) return;
  const next = !c.excluido;
  let changes={excluido:next};
  if(!next){
    const source=prompt('Describe la NUEVA autorización verificable del contacto, incluyendo su fecha:');
    if(!source||source.trim().length<5)return toast('Necesitas una nueva autorización para reactivarlo.',true);
    changes={excluido:false,consentimiento_fecha:new Date().toISOString(),consentimiento_fuente:source.trim()};
  }
  try {
    const {error} = await db.from('wa_contactos').update(changes).eq('id',id).eq('organizacion_id',state.org.id);
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

let excelPromise;
function loadExcelJS() {
  if(window.ExcelJS)return Promise.resolve(window.ExcelJS);
  if(!excelPromise)excelPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    script.onload=()=>window.ExcelJS?resolve(window.ExcelJS):reject(new Error('No fue posible inicializar el lector de Excel.'));
    script.onerror=()=>reject(new Error('No fue posible cargar el lector de Excel. Comprueba tu conexión.'));
    document.head.appendChild(script);
  });
  return excelPromise;
}
function excelCellText(value) {
  if(value === null || value === undefined) return '';
  if(typeof value === 'object') {
    if(value.text !== undefined)return String(value.text);
    if(value.result !== undefined)return String(value.result);
    if(Array.isArray(value.richText))return value.richText.map(x=>x.text||'').join('');
    if(value instanceof Date)return value.toISOString().slice(0,10);
  }
  return String(value);
}
async function readContactRows(file) {
  if(/\.xlsx$/i.test(file.name)) {
    const ExcelJS=await loadExcelJS();
    const book=new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    if(!book.worksheets.length)throw new Error('El archivo Excel está vacío.');
    for(const sheet of book.worksheets) {
      const rows=[];
      sheet.eachRow({includeEmpty:false},row=>{
        const vals=[];
        for(let col=1;col<=Math.min(row.cellCount+4,100);col++) vals.push(excelCellText(row.getCell(col).value).trim());
        if(vals.some(Boolean)) rows.push(vals);
      });
      if(detectCSVHeaders(rows))return rows;
    }
    throw new Error('No encuentro columnas con nombre y teléfono en las primeras 20 filas de ninguna hoja.');
  }
  return parseCSV((await file.text()).replace(/^\uFEFF/,''));
}
async function importCSV(event) {
  const file=event.target.files?.[0]; if(!file || !state.org)return;
  if(!licenseEnabled()){event.target.value='';return toast('Activa tu plan para importar.',true);}
  const consent=$('importConsent').checked,source=$('importSource').value.trim();
  event.target.value='';
  if(consent && !source) return toast('Indica primero la fuente de autorización de los contactos.',true);
  if(file.size>5*1024*1024)return toast('El CSV debe pesar menos de 5 MB. Divide el archivo.',true);
  try {
    const rows=await readContactRows(file);
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

const CAMPAIGN_MESSAGE_EXAMPLES = {
  personalizado: '',
  software: '¡Hola, {nombre}! 👋\n\n💻 *SOFTWARE PARA TU NEGOCIO*\n\nEn *{empresa}* tenemos soluciones digitales para tu actividad.\n\n✅ Conoce las funciones disponibles\n✅ Consulta planes y precios\n✅ Solicita una demostración\n\n📲 ¿Quieres conocer cómo funciona?',
  datafono: '¡Hola, {nombre}! 👋\n\n💳 *SOLUCIONES DE COBRO PARA NEGOCIOS*\n\nEn *{empresa}* te presentamos opciones de datáfonos y equipos para recibir pagos.\n\n✅ Consulta equipos y modelos disponibles\n✅ Conoce las funciones y métodos de pago admitidos\n✅ Pregunta por precio y condiciones\n\n📲 ¿Te comparto información para tu negocio?',
  internet: '¡Hola, {nombre}! 👋\n\n🌐 *INTERNET PARA TU HOGAR O NEGOCIO*\n\nEn *{empresa}* te asesoramos para encontrar el plan que necesitas.\n\n✅ Internet según disponibilidad y cobertura\n✅ Opciones de entretenimiento\n✅ Consulta precios, instalación y promociones\n\n📍 ¿En qué municipio y barrio necesitas el servicio?',
  streaming: '¡Hola, {nombre}! 👋\n\n🎬 *STREAMING Y ENTRETENIMIENTO*\n\nEn *{empresa}* puedes consultar las opciones de entretenimiento disponibles.\n\n✅ Conoce aplicaciones y planes\n✅ Consulta precios y condiciones\n✅ Elige según tus preferencias\n\n📲 ¿Quieres conocer las ofertas vigentes?'
};
function personalizeCampaignText(message,name) {
  return String(message||'').replace(/\{nombre\}/gi,name||'Cliente')
    .replace(/\{empresa\}/gi,state.org?.nombre||'Tu empresa');
}
function renderCampaignMessagePreview(){
  const content=$('campaignText').value;
  $('campaignMessageCounter').textContent=content.length.toLocaleString('es-CO')+' de 4.000 caracteres';
  $('campaignMessagePreview').textContent=content.trim()
    ?personalizeCampaignText(content,'Cliente'):'Escribe tu mensaje y aparecerá aquí.';
  $('campaignMessageWarning').hidden=!/\[[^\]\n]{2,70}\]/.test(content);
}
function resetCampaignComposer(){
  state.editingCampaignId=null;
  $('campaignForm').reset();
  $('campaignMessagePreset').value='personalizado';
  $('campaignSaveButton').textContent='Guardar campaña';
  $('campaignCancelEdit').hidden=true;
  $('campaignMessagePresetNotice').hidden=true;
  renderCampaignMessagePreview();
}
function applyCampaignMessagePreset(event){
  const value=event.target.value;
  const proposal=CAMPAIGN_MESSAGE_EXAMPLES[value];
  if(proposal===undefined)return;
  if($('campaignText').value.trim() && $('campaignText').value!==proposal &&
      !confirm('¿Reemplazar el mensaje actual con este ejemplo editable?')){
    event.target.value='personalizado';
    return;
  }
  $('campaignText').value=proposal;
  $('campaignMessagePresetNotice').hidden=value==='personalizado';
  renderCampaignMessagePreview();
}
function insertCampaignVariable(value){
  const field=$('campaignText'),start=field.selectionStart??field.value.length,end=field.selectionEnd??start;
  if(field.value.length-(end-start)+value.length>4000)return toast('Límite de 4.000 caracteres.',true);
  field.value=field.value.slice(0,start)+value+field.value.slice(end);
  field.focus();field.setSelectionRange(start+value.length,start+value.length);
  renderCampaignMessagePreview();
}
function beginCampaignEdit(){
  const campaign=state.campaigns.find(c=>c.id===state.selectedCampaign);
  if(!campaign)return toast('Elige una campaña para editar.',true);
  const queue=queueController.getQueue();
  if(queue && queue.estado!=='completada')
    return toast('Detén la tanda activa antes de cambiar el mensaje.',true);
  state.editingCampaignId=campaign.id;
  $('campaignName').value=campaign.nombre||'';
  $('campaignText').value=campaign.mensaje||'';
  $('campaignMessagePreset').value='personalizado';
  $('campaignSaveButton').textContent='Guardar cambios';
  $('campaignCancelEdit').hidden=false;
  $('campaignMessagePresetNotice').hidden=true;
  $('campaignFormPanel').hidden=false;
  renderCampaignMessagePreview();
  $('campaignFormPanel').scrollIntoView({behavior:'smooth',block:'start'});
}

async function addCampaign(event) {
  event.preventDefault();
  if(!state.org)return;
  if(!licenseEnabled())return toast('Activa tu plan para crear campañas.',true);
  const nombre=$('campaignName').value.trim(),mensaje=$('campaignText').value.trim();
  if(nombre.length<2||mensaje.length<3)return toast('Completa el nombre y el mensaje.',true);
  if(/\[[^\]\n]{2,70}\]/.test(mensaje)&&
      !confirm('El mensaje contiene textos entre corchetes. ¿Seguro que deseas guardarlo así?'))return;
  const editId=state.editingCampaignId;
  try {
    let data,error;
    if(editId){
      const q=queueController.getQueue();
      if(q&&q.estado!=='completada')return toast('Detén la tanda antes de modificar el mensaje.',true);
      ({data,error}=await db.from('wa_campanas').update({nombre,mensaje})
        .eq('id',editId).eq('organizacion_id',state.org.id).select('id').single());
    }else{
      ({data,error}=await db.from('wa_campanas').insert({
        organizacion_id:state.org.id,creado_por:state.user.id,nombre,mensaje,
        canal:'asistido',estado:'activa'
      }).select('id').single());
    }
    if(error)throw error;
    resetCampaignComposer();
    $('campaignFormPanel').hidden=true;
    toast(editId?'Mensaje de campaña actualizado.':'Campaña creada. Ahora selecciona los contactos.');
    await loadData();
    openCampaign(data.id);
  }catch(error){reportError(error);}
}

function assignmentsForCampaign(campaignId) {
  return state.recipientAssignments.filter(a=>a.campana_id===campaignId);
}
function selectedCampaignContacts() {
  const byId=new Map(state.contacts.map(c=>[c.id,c]));
  return assignmentsForCampaign(state.selectedCampaign)
    .map(a=>({assignment:a,contact:byId.get(a.contacto_id)}))
    .filter(x=>!!x.contact)
    .sort((a,b)=>a.contact.nombre.localeCompare(b.contact.nombre,'es'));
}
function isAuthorizedForMessages(person) {
  return Boolean(person?.consentimiento_fecha && !person?.excluido);
}
function assignedRecipientIsAuthorized(contactId) {
  return Boolean(state.selectedCampaign
    && assignmentsForCampaign(state.selectedCampaign).some(a=>a.contacto_id===contactId)
    && eligibleContacts().some(c=>c.id===contactId));
}
function openCampaign(id) {
  if(!state.campaigns.some(c=>c.id===id))return toast('Campaña no encontrada.',true);
  state.selectedCampaign=id;
  state.campaignTargetLimit=150;
  state.campaignPick=new Set();
  state.campaignPickLimit=150;
  $('campaignAssignPanel').hidden=assignmentsForCampaign(id).length>0;
  navigate('campanas');
  renderCampaignDetail();
  $('campaignDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderCampaigns() {
  $('campaignsEmpty').hidden=!!state.campaigns.length;
  $('campaignCards').innerHTML=state.campaigns.map(c=>{
    const assigned=assignmentsForCampaign(c.id);
    const contactIds=new Set(assigned.map(a=>a.contacto_id));
    const authorized=state.contacts.filter(x=>contactIds.has(x.id)&&isAuthorizedForMessages(x)).length;
    return '<article class="campaign-tile"><div class="campaign-meta"><span class="tag yes">WhatsApp asistido</span><span>'+
      html(formatDate(c.creado_en))+'</span></div><h3>'+html(c.nombre)+'</h3>'+
      '<p>'+html(c.mensaje).slice(0,160)+'</p>'+
      '<div class="campaign-tile-count"><strong>'+assigned.length.toLocaleString('es-CO')+' asignados</strong><small>'+
      authorized.toLocaleString('es-CO')+' autorizados para mensajes</small></div>'+
      '<button type="button" class="btn btn-secondary" data-open-campaign="'+html(c.id)+'">Ver y gestionar contactos →</button></article>';
  }).join('');
}
function unassignedCampaignContacts() {
  const already=new Set(assignmentsForCampaign(state.selectedCampaign).map(a=>a.contacto_id));
  const q=$('campaignContactSearch').value.trim().toLocaleLowerCase();
  const filter=$('campaignContactFilter').value;
  return state.contacts.filter(c=>{
    if(already.has(c.id)||c.excluido)return false;
    if(filter==='autorizados'&&!isAuthorizedForMessages(c))return false;
    if(filter==='pendientes'&&isAuthorizedForMessages(c))return false;
    return !q || (c.nombre||'').toLocaleLowerCase().includes(q) || (c.telefono_e164||'').includes(q);
  });
}
function renderCampaignPicker() {
  if(!state.selectedCampaign || $('campaignAssignPanel').hidden)return;
  const found=unassignedCampaignContacts();
  const visible=found.slice(0,state.campaignPickLimit);
  $('campaignPickerEmpty').hidden=found.length>0;
  $('campaignPickerRows').innerHTML=visible.map(p=>{
    const ready=isAuthorizedForMessages(p);
    return '<label class="picker-person"><input type="checkbox" data-pick-contact="'+html(p.id)+'" '+
      (state.campaignPick.has(p.id)?'checked':'')+'><span class="picker-person-info"><strong>'+html(p.nombre)+'</strong>'+
      '<small>'+html(p.telefono_e164)+'</small></span><span class="tag '+(ready?'yes':'no')+'">'+
      (ready?'Con autorización':'Sin autorización')+'</span></label>';
  }).join('');
  $('campaignSelectedCount').textContent=state.campaignPick.size.toLocaleString('es-CO')+' seleccionados';
  $('campaignPickerCount').textContent='Mostrando '+visible.length.toLocaleString('es-CO')+' de '+found.length.toLocaleString('es-CO')+' disponibles';
  $('campaignPickerMore').hidden=found.length<=visible.length;
  $('campaignSelectAll').disabled=found.length===0;
  $('campaignSaveSelected').disabled=state.campaignPick.size===0 || !licenseEnabled();
}
function showCampaignPicker() {
  if(!state.selectedCampaign)return;
  state.campaignPick=new Set();
  state.campaignPickLimit=150;
  $('campaignContactSearch').value='';
  $('campaignContactFilter').value='todos';
  $('campaignAssignPanel').hidden=false;
  renderCampaignPicker();
  $('campaignAssignPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveCampaignRecipients() {
  if(!state.selectedCampaign||!state.org)return toast('Abre una campaña antes de asignar contactos.',true);
  if(!licenseEnabled())return toast('Necesitas una suscripción activa para modificar campañas.',true);
  const knownContactIds=new Set(state.contacts.filter(c=>!c.excluido).map(c=>c.id));
  const existing=new Set(assignmentsForCampaign(state.selectedCampaign).map(a=>a.contacto_id));
  const ids=[...state.campaignPick].filter(id=>knownContactIds.has(id)&&!existing.has(id));
  if(!ids.length)return toast('Selecciona al menos un contacto nuevo.',true);
  const withoutPermission=ids.filter(id=>!isAuthorizedForMessages(state.contacts.find(c=>c.id===id))).length;
  const confirmation='¿Agregar '+ids.length+' contactos a esta campaña?\n\n'+
    (withoutPermission?withoutPermission+' quedarán pendientes de autorización y no podrán recibir mensajes.':'Todos tienen autorización registrada.')+
    '\n\nEsta operación no envía ningún mensaje.';
  if(!confirm(confirmation))return;
  const btn=$('campaignSaveSelected');btn.disabled=true;
  let added=0;
  try {
    for(let i=0;i<ids.length;i+=100) {
      const rows=ids.slice(i,i+100).map(contactId=>({
        organizacion_id:state.org.id,campana_id:state.selectedCampaign,contacto_id:contactId,agregado_por:state.user.id
      }));
      const {data,error}=await db.from('wa_campana_destinatarios')
        .upsert(rows,{onConflict:'organizacion_id,campana_id,contacto_id',ignoreDuplicates:true})
        .select('id');
      if(error)throw error;
      added+=(data||[]).length;
    }
    state.campaignPick=new Set();
    $('campaignAssignPanel').hidden=true;
    toast(added.toLocaleString('es-CO')+' contactos agregados a la campaña.');
    await loadData();
    $('campaignDetail').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) {
    reportError(error,'No fue posible asignar todos los contactos.');
    await loadData();
  } finally {btn.disabled=false;}
}
async function removeCampaignRecipient(contactId) {
  const assigned=assignmentsForCampaign(state.selectedCampaign).find(a=>a.contacto_id===contactId);
  if(!assigned)return toast('Este contacto ya no pertenece a la campaña.',true);
  if(!confirm('¿Quitar este contacto de la campaña? Se mantendrá registrado en la base de tu empresa.'))return;
  try {
    const {error}=await db.from('wa_campana_destinatarios').delete()
      .eq('id',assigned.id).eq('organizacion_id',state.org.id).eq('campana_id',state.selectedCampaign);
    if(error)throw error;
    toast('Contacto retirado únicamente de esta campaña.');
    await loadData();
  } catch(error) {reportError(error);}
}
function openContactPermissionFromCampaign(contactId) {
  const p=state.contacts.find(c=>c.id===contactId);
  if(!p || p.excluido)return toast('Este contacto no está disponible.',true);
  navigate('contactos');
  openConsentForm(contactId);
  state.returnToCampaign=true;
}
function renderCampaignDetail() {
  const c=state.campaigns.find(x=>x.id===state.selectedCampaign);
  if(!c){$('campaignDetail').hidden=true;return;}
  $('campaignDetail').hidden=false;
  $('detailTitle').textContent=c.nombre;
  const contacts=selectedCampaignContacts();
  const ready=contacts.filter(x=>isAuthorizedForMessages(x.contact)).length;
  const pending=contacts.length-ready;
  $('campaignAssignedCount').textContent=contacts.length.toLocaleString('es-CO');
  $('detailHint').textContent=contacts.length.toLocaleString('es-CO')+' contactos asignados · '+ready.toLocaleString('es-CO')+' autorizados · '+pending.toLocaleString('es-CO')+' pendientes';
  $('detailConsentNotice').hidden=pending===0;
  $('detailConsentNotice').textContent=pending+' contactos asignados no tienen permiso vigente o están excluidos. Puedes organizarlos en la campaña, pero no abrir WhatsApp hasta registrar una autorización verificable.';
  const visible=contacts.slice(0,state.campaignTargetLimit);
  const actionByContact=new Map(state.actions.filter(a=>a.campana_id===c.id).map(a=>[a.contacto_id,a]));
  $('campaignTargetCount').textContent='Mostrando '+visible.length.toLocaleString('es-CO')+' de '+contacts.length.toLocaleString('es-CO');
  $('campaignTargetLoadMore').hidden=visible.length>=contacts.length;
  $('targetRows').innerHTML=visible.map(({contact:p})=>{
    const readyToContact=isAuthorizedForMessages(p);
    const record=actionByContact.get(p.id);
    const stateLabel=record?.estado==='contactado'?'Contactado (manual)':record?.estado==='respondio'?'Respondió':record?.estado==='sin_interes'?'Sin interés':record?.estado==='preparado'?'Chat abierto':'Sin gestionar';
    return '<tr><td><strong>'+html(p.nombre)+'</strong></td><td>'+html(p.telefono_e164)+'</td>'+
      '<td><span class="tag '+(readyToContact?'yes':p.excluido?'off':'no')+'">'+
      (p.excluido?'Excluido':readyToContact?'Autorizado':'Pendiente')+'</span></td>'+
      '<td>'+html(stateLabel)+'</td><td class="campaign-actions">'+
      (readyToContact
        ?'<button type="button" class="table-action" data-whatsapp="'+html(p.id)+'">Abrir WhatsApp</button> '+
         '<button type="button" class="table-action" data-mark-contacted="'+html(p.id)+'">Contactado</button> '+
         '<button type="button" class="table-action" data-mark-responded="'+html(p.id)+'">Respondió</button> '+
         '<button type="button" class="table-action" data-mark-uninterested="'+html(p.id)+'">Sin interés</button> '
        :p.excluido?'<span class="muted">Sin envíos</span> ': '<button type="button" class="table-action" data-go-permission="'+html(p.id)+'">Registrar permiso</button> ')+
      '<button type="button" class="table-action danger" data-remove-recipient="'+html(p.id)+'">Quitar</button></td></tr>';
  }).join('') || '<tr><td colspan="5" class="empty-state">Esta campaña aún no tiene contactos. Usa el botón «Agregar contactos» de arriba para asignarlos desde la base de tu empresa.</td></tr>';
  renderCampaignPicker();
  queueController.render();
}

const queueController = createManualQueueController({
  db, state, toast, reportError, licenseEnabled, permittedCommercialHourCO,
  selectedCampaignContacts, isAuthorizedForMessages, assignedRecipientIsAuthorized, loadData
});

async function recordAction(contactId,estado) {
  const c=state.campaigns.find(x=>x.id===state.selectedCampaign);
  if(!c)return;
  if(!assignedRecipientIsAuthorized(contactId))throw new Error('Este contacto no está asignado con autorización vigente a la campaña.');
  const {error}=await db.from('wa_gestiones').upsert({
    organizacion_id:state.org.id,campana_id:c.id,contacto_id:contactId,usuario_id:state.user.id,estado,actualizado_en:new Date().toISOString()
  },{onConflict:'campana_id,contacto_id'});
  if(error)throw error;
  await loadData();
}
async function openWhatsApp(contactId) {
  const person=eligibleContacts().find(x=>x.id===contactId);
  const c=state.campaigns.find(x=>x.id===state.selectedCampaign);
  if(!person||!c||!assignedRecipientIsAuthorized(contactId))return toast('El contacto debe pertenecer a la campaña y tener permiso vigente.',true);
  if(!licenseEnabled())return toast('Suscripción vencida.',true);
  const activeQueue=queueController.getQueue();
  if(activeQueue && activeQueue.estado!=='completada' && activeQueue.posicion<activeQueue.contactos.length)
    return toast('Hay una tanda abierta. Usa sus controles para respetar el intervalo entre mensajes.',true);
  if(person.telefono_e164.startsWith('+57') && !permittedCommercialHourCO())
    return toast('Fuera del horario legal comercial de Colombia. L-V: 7 a 19 h; sábado: 8 a 15 h. Nunca domingos ni festivos.',true);
  if(person.telefono_e164.startsWith('+57') && !confirm('¿Confirmas que hoy NO es festivo en Colombia y que el destinatario autorizó mensajes comerciales?'))return;
  const msg=personalizeCampaignText(c.mensaje,person.nombre);
  window.open('https://wa.me/'+person.telefono_e164.replace('+','')+'?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
  try {await recordAction(contactId,'preparado');toast('Conversación abierta. No se ha confirmado el envío.');}
  catch(error){reportError(error);}
}
async function markContacted(contactId) {
  if(!licenseEnabled())return toast('Suscripción vencida.',true);
  if(!confirm('¿Confirmas que contactaste personalmente a esta persona?'))return;
  try{await recordAction(contactId,'contactado');toast('Gestión manual registrada.');}catch(error){reportError(error);}
}
async function markCampaignStatus(contactId,status) {
  if(!licenseEnabled())return toast('Suscripción vencida.',true);
  if(!['respondio','sin_interes'].includes(status))return;
  if(!confirm(status==='respondio'?'¿El contacto respondió personalmente?':'¿Confirmas que el contacto no está interesado?'))return;
  try{await recordAction(contactId,status);toast('Resultado comercial actualizado.');}catch(error){reportError(error);}
}
function exportCampaignReport(){
  const camp=state.campaigns.find(x=>x.id===state.selectedCampaign);
  if(!camp)return toast('Selecciona una campaña.',true);
  const quote=value=>{
    let s=String(value??'');
    if(/^\s*[=+\-@]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  const rows=[['contacto','celular','estado','fecha_gestion','autorizado','excluido'].map(quote).join(',')];
  for(const {contact:person} of selectedCampaignContacts()){
    const action=state.actions.find(a=>a.campana_id===camp.id && a.contacto_id===person.id);
    rows.push([person.nombre,person.telefono_e164,action?.estado||'sin_gestion',action?.actualizado_en||'',person.consentimiento_fecha?'si':'no',person.excluido?'si':'no'].map(quote).join(','));
  }
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='reporte-campana-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  toast('Informe comercial descargado como CSV.');
}

function renderTeam() {
  const role=state.member?.rol||'sin asignar';
  const owner=role==='propietario';
  $('memberRoleLabel').textContent={propietario:'Propietario de la empresa',admin:'Administrador',asesor:'Asesor'}[role] || 'Acceso sin rol';
  $('teamInvitePanel').hidden=!owner;
  $('invitesPanel').hidden=!owner;
  $('membersPanel').hidden=!owner;
  $('memberRows').innerHTML=owner ? state.teamMembers.map(m=>{
    const manage=m.rol==='propietario'?'Cuenta propietaria':
      '<button class="table-action danger" data-member-revoke="'+html(m.usuario_id)+'">Revocar acceso</button>';
    return '<tr><td><strong>'+html(m.email)+'</strong></td><td>'+html(m.rol)+'</td><td>'+
      html(formatDate(m.creado_en))+'</td><td>'+manage+'</td></tr>';
  }).join(''):'';
  if(owner&&!state.teamMembers.length)$('memberRows').innerHTML='<tr><td colspan="4">No hay colaboradores.</td></tr>';
  $('inviteRows').innerHTML=owner ? state.invites.sort((a,b)=>(b.creado_en||'').localeCompare(a.creado_en||'')).map(i=>{
    const status=i.aceptado_en?'Aceptada':new Date(i.expira_en)<new Date()?'Vencida':'Pendiente';
    const action=status==='Pendiente'?'<button class="table-action" data-invite-copy="'+html(i.id)+'">Copiar enlace</button> '+
      '<button class="table-action danger" data-invite-cancel="'+html(i.id)+'">Cancelar</button>':'—';
    return '<tr><td><strong>'+html(i.email)+'</strong></td><td>'+html(i.rol)+'</td><td>'+
      html(formatDate(i.creado_en))+'</td><td>'+html(status)+'</td><td>'+action+'</td></tr>';
  }).join('') : '';
  if(owner&&!state.invites.length)$('inviteRows').innerHTML='<tr><td colspan="5">Aún no hay invitaciones.</td></tr>';
}
async function revokeMember(id){
  if(state.member?.rol!=='propietario')return;
  if(!confirm('¿Revocar acceso a este colaborador? Sus contactos y campañas continuarán en la empresa.'))return;
  const {data,error}=await db.rpc('wa_equipo_revocar',{p_org:state.org.id,p_usuario:id});
  if(error)return reportError(error);
  toast(data?'Colaborador desactivado.':'No se encontró el acceso.');
  await loadData();
}
async function cancelInvitation(id){
  if(state.member?.rol!=='propietario')return;
  if(!confirm('¿Cancelar esta invitación pendiente?'))return;
  const {data,error}=await db.rpc('wa_invitacion_cancelar',{p_id:id});
  if(error)return reportError(error);
  toast(data?'Invitación cancelada.':'Invitación ya utilizada o no disponible.');
  await loadData();
}
async function copyPendingInvitation(id){
  const url=new URL(window.location.origin+window.location.pathname);
  url.searchParams.set('invite',id);
  try{await navigator.clipboard.writeText(url.toString());toast('Invitación copiada.');}
  catch{window.prompt('Copia este enlace:',url.toString());}
}
async function submitInvite(event) {
  event.preventDefault();
  if(state.member?.rol!=='propietario')return toast('Solo el propietario puede invitar colaboradores.',true);
  const email=$('inviteEmail').value.trim().toLowerCase();
  const rol=$('inviteRole').value;
  try {
    const {data,error}=await db.from('wa_invitaciones').insert({
      organizacion_id:state.org.id,creado_por:state.user.id,email,rol
    }).select('id,expira_en').single();
    if(error)throw error;
    const inviteURL=new URL(window.location.origin + window.location.pathname);
    inviteURL.searchParams.set('invite',data.id);
    $('inviteLink').value=inviteURL.toString();
    $('inviteLinkPanel').hidden=false;
    $('inviteForm').reset();
    toast('Invitación creada. Comparte el enlace con el correo indicado.');
    await loadData();
  }catch(error){reportError(error);}
}
async function copyInviteLink() {
  try {await navigator.clipboard.writeText($('inviteLink').value);toast('Enlace copiado.');}
  catch { $('inviteLink').select();toast('Selecciona el enlace y cópialo manualmente.'); }
}
async function resetPassword() {
  const email=$('authEmail').value.trim();
  if(!email)return toast('Escribe tu correo electrónico arriba antes de recuperar la clave.',true);
  try{
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
    if(error)throw error;
    toast('Si la cuenta existe, recibirás instrucciones para restablecer la contraseña.');
  }catch(error){reportError(error);}
}


function licenseEnabled(){
  if(!state.org)return false;
  const o=state.org;
  if(o.estado_suscripcion==='prueba')return !!o.prueba_hasta&&new Date(o.prueba_hasta)>new Date();
  if(o.estado_suscripcion==='activa')return !!o.vigente_hasta&&new Date(o.vigente_hasta)>new Date();
  return false;
}
function renderLicense(){
  if(!state.org)return;
  const o=state.org;
  const label=o.estado_suscripcion==='prueba'?'Prueba hasta '+formatDate(o.prueba_hasta):
    o.estado_suscripcion==='activa'?'Suscripción vigente hasta '+formatDate(o.vigente_hasta):'Suscripción suspendida';
  $('licenseInfo').innerHTML='<h2>Estado de la suscripción</h2><p><strong>'+html(o.nombre)+'</strong> · '+html(label)+'</p><p class="muted">Pago y activación asistidos; no hay cargos automáticos dentro del panel.</p>';
  $('licenseBanner').hidden=licenseEnabled();
  if(!licenseEnabled()) $('licenseBanner').textContent='Tu acceso está inactivo. Puedes revisar tus registros y solicitar activación en Suscripción.';
}
function requestStarter(){
  const company=state.org?.nombre||'mi empresa';
  const msg='Hola, deseo activar MIRED360 CAMPAIGNS para '+company+'. Plan Emprendedor de $49.900 al mes. ¿Cómo puedo pagar?';
  window.open('https://wa.me/573229432085?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
}
async function loadAdmin(){
  if(!state.isSuperAdmin)return;
  const {data,error}=await db.rpc('wa_admin_listar_empresas');
  if(error)return reportError(error);
  $('adminRows').innerHTML=(data||[]).map(o=>
    '<tr><td><strong>'+html(o.nombre)+'</strong></td><td>'+html(o.plan)+'</td><td>'+html(o.estado_suscripcion)+'</td><td>'+html(formatDate(o.estado_suscripcion==='prueba'?o.prueba_hasta:o.vigente_hasta))+'</td><td>'+
    '<select id="plan_'+html(o.id)+'" aria-label="Plan de empresa"><option value="inicial">Emprendedor</option><option value="profesional">Profesional</option><option value="empresa">Empresa</option></select> '+
    '<button class="table-action" data-admin-activate="'+html(o.id)+'">Activar 30 días</button></td></tr>'
  ).join('')||'<tr><td colspan="5">No hay empresas registradas.</td></tr>';
}
async function activatePaidPlan(id){
  if(!state.isSuperAdmin)return;
  const plan=$('plan_'+id)?.value;
  if(plan!=='inicial')return toast('Solo puede venderse Emprendedor en esta versión.',true);
  if(!confirm('¿Has verificado el pago? Se activarán 30 días y no se cobrará automáticamente.'))return;
  const {error}=await db.rpc('wa_admin_activar',{p_organizacion:id,p_plan:plan,p_dias:30});
  if(error)return reportError(error);
  toast('Suscripción activada por 30 días.');
  await loadOrgs();
  await loadAdmin();
}


function showRecovery(){
  state.recovering=true;
  $('authScreen').hidden=false;$('appScreen').hidden=true;
  $('authForm').hidden=true;
  $('resetPassword').hidden=true;
  $('recoveryForm').hidden=false;
  document.querySelector('.auth-switch').hidden=true;
  $('authTitle').textContent='Establece tu nueva contraseña';
  $('authSubtitle').textContent='Utiliza al menos 10 caracteres para proteger tu cuenta.';
}
async function finishRecovery(event){
  event.preventDefault();
  const password=$('newPassword').value;
  if(password.length<10)return toast('La contraseña requiere al menos 10 caracteres.',true);
  if(password!==$('confirmPassword').value)return toast('Las contraseñas no coinciden.',true);
  try{
    const {error}=await db.auth.updateUser({password});
    if(error)throw error;
    state.recovering=false;
    window.history.replaceState({},'',window.location.pathname);
    $('recoveryForm').hidden=true;
    $('authForm').hidden=false;
    $('resetPassword').hidden=false;
    document.querySelector('.auth-switch').hidden=false;
    const {data}=await db.auth.getUser();
    state.user=data.user;
    toast('Contraseña actualizada correctamente.');
    if(state.user)await boot();
  }catch(error){reportError(error);}
}


function exportContacts(){
  if(!state.org)return toast('Selecciona una empresa.',true);
  function quoteCSV(value){
    let content=String(value??'');
    if(/^\s*[=+\-@]/.test(content))content="'"+content;
    return '"'+content.replace(/"/g,'""')+'"';
  }
  const lines=[['nombre','celular','origen','autorizado','excluido','fuente_autorizacion'].map(quoteCSV).join(',')];
  for(const c of state.contacts){
    lines.push([c.nombre,c.telefono_e164,c.origen||'',c.consentimiento_fecha?'si':'no',c.excluido?'si':'no',c.consentimiento_fuente||''].map(quoteCSV).join(','));
  }
  const file=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');
  a.href=url;a.download='contactos-mired360-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
  toast('Exportación CSV generada. Conserva el archivo de manera segura.');
}


async function checkApiConnection() {
  if(!state.isSuperAdmin)return toast('Solo el administrador general puede comprobar esta conexión.',true);
  const btn=$('apiCheckStatus');btn.disabled=true;btn.textContent='Comprobando...';
  $('apiConnectionStatus').textContent='Consultando a Meta';
  $('apiPhoneObserved').textContent='Consultando';
  $('apiWebhookStatus').textContent='Consultando';
  $('apiStatusDescription').textContent='Verificación de identidad del administrador, credenciales y número. No se envían mensajes.';
  try {
    const {data,error}=await db.auth.getSession();
    if(error)throw error;
    const jwt=data?.session?.access_token;
    if(!jwt)throw new Error('Tu sesión caducó. Ingresa nuevamente y vuelve a comprobar.');
    const response=await fetch(API_URL+'/functions/v1/whatsapp-send',{
      method:'GET',
      headers:{'Authorization':'Bearer '+jwt,'apikey':PUBLIC_KEY},
      cache:'no-store'
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'No fue posible comprobar la configuración.');
    const status=result.status;
    const phone=String(result.observed_number||'');
    $('apiPhoneObserved').textContent=phone||'No disponible';
    const webhookConfigured=!!result.webhook_signature_configured&&!!result.webhook_verification_configured;
    const webhookReceived=webhookConfigured&&result.webhook_test_received===true;
    const testReplyObserved=!!result.test_reply_observed;
    $('apiWebhookStatus').textContent=webhookReceived
      ?'Recepción verificada con mensaje real'
      :webhookConfigured?'Credenciales listas; sin mensaje reciente de prueba'
      :result.webhook_signature_configured?'Falta token de verificación':'Falta secreto de firma de Meta';
    if(status==='connected'){
      $('apiConnectionStatus').textContent='Número reconocido por Meta';
      $('apiStatusDescription').textContent=webhookReceived
        ?(testReplyObserved
          ?'Meta reconoce el número y registramos recepción y respuesta del 3229432085. La automatización de campañas con plantillas aprobadas sigue pendiente.'
          :'Meta reconoce el número y recibimos el mensaje real del 3229432085 mediante el webhook. La respuesta automática todavía requiere una nueva prueba; acabamos de corregir una condición que bloqueaba ese número.')
        :webhookConfigured
          ?'Meta reconoce el número y el webhook tiene credenciales. Aún no encontramos mensajes recientes desde el 3229432085 para verificar el flujo.'
          :'El token permite consultar el número correcto, pero faltan secretos del webhook. La API no está lista para campañas.';
    }else if(status==='number_mismatch'){
      $('apiConnectionStatus').textContent='Número diferente';
      $('apiStatusDescription').textContent='Meta devolvió otro número. No conectaremos la API hasta verificar que corresponda al 3133938312; el 3229432085 debe seguir independiente.';
    }else if(status==='credentials_missing'){
      $('apiConnectionStatus').textContent='Faltan credenciales';
      $('apiPhoneObserved').textContent='No se pudo consultar';
      $('apiStatusDescription').textContent='Debes guardar en Supabase WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID nuevos y válidos. Los tokens anteriores fueron revocados.';
    }else if(status==='meta_rejected'){
      $('apiConnectionStatus').textContent='Meta rechazó la conexión';
      $('apiStatusDescription').textContent='Meta respondió con el código '+(result.meta_error_code??'sin identificar')+'. Comprueba token, permisos, identificador del teléfono y estado de tu cuenta empresarial.';
    }else if(status==='meta_unreachable'){
      $('apiConnectionStatus').textContent='No se pudo consultar Meta';
      $('apiStatusDescription').textContent='No hubo respuesta verificable de Meta. Revisa conexión, configuración y vuelve a intentarlo.';
    }else{
      $('apiConnectionStatus').textContent='Pendiente de revisar';
      $('apiStatusDescription').textContent='No hay todavía confirmación de que la conexión esté preparada. No se enviaron mensajes.';
    }
  }catch(error){
    $('apiConnectionStatus').textContent='Error de diagnóstico';
    $('apiPhoneObserved').textContent='Sin comprobar';
    $('apiWebhookStatus').textContent='Sin comprobar';
    $('apiStatusDescription').textContent=error?.message||'No se pudo consultar la conexión.';
  }finally{btn.disabled=false;btn.textContent='Comprobar conexión';}
}
async function copyApiWebhookUrl() {
  const input=$('apiWebhookUrl');
  try {
    await navigator.clipboard.writeText(input.value);
    toast('URL del webhook copiada. Pégala en Meta para completar la verificación.');
  }catch {
    input.focus();input.select();
    toast('Selecciona la dirección y cópiala manualmente desde tu navegador.');
  }
}


let metaTemplateBusy=false;
let metaTemplateApproved=false;

async function metaTemplateRequest(method='GET',payload=null,query=null){
  if(!state.isSuperAdmin)throw Error('Solo la administración puede utilizar la API corporativa.');
  const {data,error}=await db.auth.getSession();
  if(error)throw error;
  const token=data?.session?.access_token;
  if(!token)throw Error('La sesión ha caducado. Inicia sesión nuevamente.');
  const targetUrl=API_URL+'/functions/v1/wa-meta-templates'+
    (method==='GET'&&query?'?'+new URLSearchParams(query).toString():'');
  const response=await fetch(targetUrl,{
    method,
    headers:{
      'Authorization':'Bearer '+token,
      'apikey':PUBLIC_KEY,
      ...(payload?{'Content-Type':'application/json'}:{})
    },
    ...(payload?{body:JSON.stringify(payload)}:{}),
    cache:'no-store'
  });
  const dataResponse=await response.json().catch(()=>({}));
  if(!response.ok){
    const meta=dataResponse?.meta?.message;
    throw Error((dataResponse?.error||'Error consultando Meta')+(meta?' — '+meta:''));
  }
  return dataResponse;
}

let metaDeliveryBusy=false;
const deliveryHelp=(code)=>{
  if(code==='131026')return 'Meta no pudo entregar este mensaje. Verifica por otro canal que el número tenga WhatsApp activo y que el cliente pueda recibir mensajes. No insistas automáticamente.';
  if(code==='131049')return 'Meta limitó los mensajes de marketing a este destinatario. No reintentes inmediatamente.';
  if(code==='131050')return 'El destinatario rechazó recibir mensajes de marketing. Respeta su decisión y no reenvíes.';
  if(code==='131047')return 'Fuera de la ventana de atención. Utiliza solamente una plantilla aprobada con autorización.';
  return 'Comprueba los datos y la disponibilidad del destinatario antes de cualquier nuevo intento.';
};
function renderMetaDeliveries(report){
  const rows=Array.isArray(report?.attempts)?report.attempts:[];
  const delivered=Number(report?.delivered||0);
  const failed=Number(report?.failed||0);
  const pending=Number(report?.pending||0);
  $('apiDeliveryTotal').textContent=String(rows.length);
  $('apiDeliverySuccess').textContent=String(delivered);
  $('apiDeliveryFailed').textContent=String(failed);
  $('apiDeliveryPending').textContent=String(pending);
  $('apiDeliveryRows').innerHTML=rows.length?rows.map(item=>{
    const status=String(item.status||'pendiente');
    const failedItem=status==='failed'||item.request_status==='error_meta';
    const success=status==='delivered'||status==='read';
    const label=failedItem?'No entregado':status==='read'?'Leído':
      success?'Entregado':status==='sent'?'Enviado · sin entrega':'Pendiente';
    const className=failedItem?'failed':success?'delivered':'pending';
    const code=item.error_code?' · Error Meta '+html(item.error_code):'';
    const when=item.created_at?new Date(item.created_at).toLocaleString('es-CO',{
      timeZone:'America/Bogota',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'
    }):'';
    const detail=failedItem
      ?deliveryHelp(String(item.error_code||''))+
        (item.error_detail?' Detalle Meta: '+String(item.error_detail).slice(0,120):'')
      :status==='sent'?'Meta informó envío, pero aún no confirmó recepción.':
        status==='pendiente'?'Meta aceptó o está procesando la solicitud; entrega sin confirmar.':'';
    return '<article role="listitem" class="api-delivery-row">'+
      '<div class="api-delivery-row-details">'+
        '<strong>'+html(item.name||'Contacto')+
          (item.phone_last4?' · ***'+html(item.phone_last4):'')+'</strong>'+
        '<small>'+html(item.campaign||'Campaña')+' · '+html(when)+html(code)+'</small>'+
        (detail?'<p>'+html(detail)+'</p>':'')+
      '</div><span class="api-delivery-state '+className+'">'+html(label)+'</span>'+
      '</article>';
  }).join(''):'<p class="api-delivery-empty">No se han registrado pruebas de plantillas oficiales en esta empresa.</p>';
  $('apiDeliveryHint').textContent=failed
    ?'Hay '+failed+' entrega(s) fallida(s) entre las últimas '+rows.length+
      ' pruebas. Antes de insistir, confirma con esos clientes que su número tenga WhatsApp activo y que acepten recibir mensajes.'
    :rows.length?'Sin fallos registrados en las últimas '+rows.length+
      ' pruebas. Los pendientes todavía no cuentan como entregados.'
      :'Los resultados aparecerán después del primer envío de una plantilla aprobada.';
}
async function refreshMetaDeliveries(){
  if(!state.isSuperAdmin||metaDeliveryBusy)return;
  metaDeliveryBusy=true;
  const btn=$('apiDeliveryRefresh');
  btn.disabled=true;
  btn.textContent='Consultando entregas…';
  try{
    const report=await metaTemplateRequest('GET',null,{action:'deliveries'});
    renderMetaDeliveries(report);
  }catch(error){
    $('apiDeliveryHint').textContent=error?.message||'No fue posible consultar el estado de entregas.';
  }finally{
    metaDeliveryBusy=false;
    btn.disabled=false;
    btn.textContent='↻ Consultar entregas';
  }
}
async function copyCustomerInitiationLink(){
  const link='https://wa.me/573133938312?text='+encodeURIComponent('Hola, quiero recibir información de MIRED360SERVICIOS.');
  try{
    await navigator.clipboard.writeText(link);
    toast('Enlace copiado. Compártelo por otro canal únicamente con personas que acepten contactarte.');
  }catch(error){
    toast('El navegador no permitió copiar automáticamente. Usa el número 3133938312 para que el cliente escriba primero.',true);
  }
}

function renderMetaTemplateState(info){
  const status=String(info?.status||'UNKNOWN').toUpperCase();
  const labels={APPROVED:'Aprobada',PENDING:'En revisión',REJECTED:'Rechazada',NOT_CREATED:'Sin crear',PAUSED:'Pausada',DISABLED:'Desactivada',UNKNOWN:'Sin confirmar'};
  const approved=info?.approved===true;
  metaTemplateApproved=approved;
  $('apiTemplateStatus').textContent=labels[status]||status;
  $('apiTemplateStatus').className='template-status-pill '+(approved?'approved':status==='PENDING'?'pending':status==='REJECTED'?'rejected':'');
  $('apiTemplateCreate').hidden=info?.exists===true;
  $('apiTemplateResult').textContent=approved
    ?'Meta aprobó esta plantilla de marketing. Puedes hacer una única prueba con un contacto que haya autorizado comunicaciones comerciales.'
    :status==='PENDING'
      ?'La plantilla fue recibida por Meta y está pendiente de revisión. No puede utilizarse hasta que aparezca Aprobada.'
      :status==='REJECTED'
        ?'Meta rechazó esta plantilla. No intentes enviar mensajes con ella. Es necesario revisar el motivo y crear una versión corregida.'
        :status==='NOT_CREATED'
          ?'Todavía no existe en Meta. Pulsa Solicitar aprobación para enviar esta propuesta a revisión.'
          :'El estado actual no permite enviar. Consulta nuevamente la aprobación de Meta.';
  if(Object.prototype.hasOwnProperty.call(info||{},'last_test')){
    const last=info.last_test;
    let description='Todavía no hay envíos individuales registrados para esta plantilla.';
    if(last){
      const delivery=String(last.status||'');
      const when=last.created_at?new Date(last.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      const code=last.error_code?(' — Meta '+last.error_code):'';
      if(delivery==='failed'||delivery==='error_meta'){
        description='Última prueba: NO ENTREGADA'+code+'. Meta aceptó la solicitud, pero después rechazó la entrega. Comprueba que el cliente tenga WhatsApp activo y acepte recibir mensajes. No repitas el envío hasta verificar la causa.';
      }else if(delivery==='delivered'||delivery==='read'){
        description='Última prueba: '+(delivery==='read'?'LEÍDA':'ENTREGADA')+'. '+when;
      }else if(delivery==='sent'||delivery==='aceptado_meta'){
        description='Última prueba: aceptada por Meta, pero todavía sin entrega confirmada. '+when;
      }else{
        description='Última prueba: '+delivery+'. '+when;
      }
    }
    $('apiTemplateTestResult').textContent=description;
  }
  updateMetaTestButton();
}
async function refreshMetaTemplate(){
  if(metaTemplateBusy)return;
  metaTemplateBusy=true;
  $('apiTemplateRefresh').disabled=true;
  $('apiTemplateCreate').disabled=true;
  $('apiTemplateStatus').textContent='Consultando…';
  try{
    const info=await metaTemplateRequest();
    renderMetaTemplateState(info);
  }catch(error){
    metaTemplateApproved=false;
    $('apiTemplateStatus').textContent='No se pudo comprobar';
    $('apiTemplateStatus').className='template-status-pill';
    $('apiTemplateResult').textContent=error?.message||'No fue posible consultar Meta.';
    updateMetaTestButton();
  }finally{
    metaTemplateBusy=false;
    $('apiTemplateRefresh').disabled=false;
    $('apiTemplateCreate').disabled=false;
  }
}
async function submitMetaTemplate(){
  if(metaTemplateBusy||!state.isSuperAdmin)return;
  if(!confirm('Vas a enviar a Meta una plantilla comercial de Claro Hogar para revisión. Esta operación NO envía mensajes a tus clientes. ¿Continuar?'))return;
  metaTemplateBusy=true;
  $('apiTemplateCreate').disabled=true;
  $('apiTemplateRefresh').disabled=true;
  $('apiTemplateStatus').textContent='Solicitando aprobación…';
  try{
    const info=await metaTemplateRequest('POST',{action:'create'});
    renderMetaTemplateState(info);
    toast('Solicitud enviada a Meta. Revisa el estado antes de probar un envío.');
  }catch(error){
    metaTemplateApproved=false;
    $('apiTemplateStatus').textContent='Solicitud no completada';
    $('apiTemplateStatus').className='template-status-pill';
    $('apiTemplateResult').textContent=error?.message||'Meta no pudo recibir la plantilla.';
  }finally{
    metaTemplateBusy=false;
    $('apiTemplateCreate').disabled=false;
    $('apiTemplateRefresh').disabled=false;
  }
}
function authorizedMetaTestContacts(){
  return state.contacts.filter(p=>!p.excluido &&
    Boolean(p.consentimiento_fecha) &&
    Boolean(String(p.consentimiento_fuente||'').trim()))
    .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
}
function isMetaTestAssigned(campaignId,contactId){
  return !!campaignId && !!contactId && state.recipientAssignments
    .some(a=>a.campana_id===campaignId && a.contacto_id===contactId);
}
function renderMetaTestCampaigns(){
  const campaign=$('apiTestCampaign');
  const selected=campaign.value;
  const options=state.campaigns||[];
  campaign.innerHTML='<option value="">Selecciona una campaña</option>'+
    options.map(c=>{
      const count=authorizedMetaTestContacts().filter(p=>isMetaTestAssigned(c.id,p.id)).length;
      return '<option value="'+html(c.id)+'">'+html(c.nombre)+
        ' ('+count+' autorizados asignados)</option>';
    }).join('');
  if(options.some(c=>c.id===selected))campaign.value=selected;
  else{
    // Primera visita: elegir automáticamente la campaña que sí tiene
    // autorizados, en lugar de presentar un selector aparentemente vacío.
    const withAuthorized=options.find(c=>authorizedMetaTestContacts()
      .some(p=>isMetaTestAssigned(c.id,p.id)));
    if(withAuthorized)campaign.value=withAuthorized.id;
    else if(options.length)campaign.value=options[0].id;
  }
  renderMetaTestContacts();
}
function renderMetaTestContacts(){
  const campaignId=$('apiTestCampaign').value;
  const selected=$('apiTestContact').value;
  const authorized=authorizedMetaTestContacts();
  const assigned=authorized.filter(p=>isMetaTestAssigned(campaignId,p.id));
  const unassigned=authorized.filter(p=>!isMetaTestAssigned(campaignId,p.id));
  const ordered=[...assigned,...unassigned];
  const select=$('apiTestContact');
  select.innerHTML='<option value="">Selecciona un contacto autorizado</option>'+
    ordered.map(p=>'<option value="'+html(p.id)+'">'+
      html(p.nombre)+' — '+html(p.telefono_e164)+
      (isMetaTestAssigned(campaignId,p.id)?' · Ya está en esta campaña':' · Falta vincular a campaña')+
      '</option>').join('');
  if(ordered.some(p=>p.id===selected))select.value=selected;
  const total=authorized.length;
  const info=$('apiContactAvailability');
  if(!campaignId){
    info.textContent='Selecciona una campaña para continuar. Tu empresa tiene '+
      total+' contactos con autorización comercial registrada.';
  }else if(!total){
    info.textContent='No hay contactos con autorización comercial registrada en esta empresa. Primero registra un contacto y su evidencia de autorización.';
  }else{
    info.textContent=total+' contactos autorizados en tu empresa · '+
      assigned.length+' vinculados a esta campaña · '+
      unassigned.length+' disponibles para vincular.';
  }
  updateMetaTestButton();
}
function updateMetaTestButton(){
  const campaignId=$('apiTestCampaign').value,contactId=$('apiTestContact').value;
  const contact=authorizedMetaTestContacts().find(p=>p.id===contactId);
  const assigned=!!contact&&isMetaTestAssigned(campaignId,contactId);
  const canManage=!!state.isSuperAdmin&&!!state.org &&
    state.member?.rol==='propietario';
  const assign=$('apiAssignTestContact');
  assign.hidden=!(canManage&&contact&&!assigned);
  assign.disabled=metaTestAssignBusy||!licenseEnabled();
  $('apiTemplateTestSend').disabled=metaTemplateBusy || metaTestAssignBusy ||
    !canManage || !metaTemplateApproved || !assigned ||
    !$('apiTestConsentConfirm').checked;
  if(contact&&!assigned) {
    $('apiContactAvailability').textContent='El contacto seleccionado tiene autorización registrada, pero todavía NO está vinculado a la campaña. Pulsa «Vincular a esta campaña». Esto no envía mensajes.';
  }
}
let metaTestAssignBusy=false;
async function assignMetaTestContact(){
  if(metaTestAssignBusy||!state.isSuperAdmin||!state.org)return;
  const campaignId=$('apiTestCampaign').value,contactId=$('apiTestContact').value;
  const authorized=authorizedMetaTestContacts().find(c=>c.id===contactId);
  const campaign=state.campaigns.find(c=>c.id===campaignId);
  if(!authorized||!campaign || state.member?.rol!=='propietario')
    return toast('Selecciona una campaña y un contacto autorizado de tu empresa.',true);
  if(isMetaTestAssigned(campaignId,contactId))return toast('Este contacto ya está vinculado.',true);
  if(!licenseEnabled())return toast('Activa tu suscripción para modificar campañas.',true);
  if(!confirm('¿Vincular a '+authorized.nombre+' con la campaña '+campaign.nombre+'? Esto NO envía mensajes de WhatsApp.'))return;
  metaTestAssignBusy=true;
  updateMetaTestButton();
  try{
    const {error}=await db.from('wa_campana_destinatarios').upsert({
      organizacion_id:state.org.id,campana_id:campaignId,contacto_id:contactId,
      agregado_por:state.user.id
    },{onConflict:'organizacion_id,campana_id,contacto_id',ignoreDuplicates:true});
    if(error)throw error;
    await loadData();
    $('apiTestCampaign').value=campaignId;
    $('apiTestContact').value=contactId;
    toast('Contacto vinculado. Ya puedes seleccionarlo para una prueba individual.');
  }catch(error){reportError(error,'No se pudo vincular el contacto.');}
  finally{metaTestAssignBusy=false;renderMetaTestCampaigns();}
}
function openAuthorizedMetaContactForm(){
  // No marcar autorización por defecto: la persona debe haberla otorgado
  // y el origen/evidencia deben ser aportados por el usuario.
  navigate('contactos');
  $('contactFormPanel').hidden=false;
  $('contactForm').reset();
  $('contactFormPanel').scrollIntoView({behavior:'smooth',block:'start'});
  toast('Registra el contacto y marca autorización únicamente si tienes su evidencia.');
}
async function sendMetaTemplateTest(){
  if(metaTemplateBusy||!metaTemplateApproved||!state.isSuperAdmin)return;
  const contact=state.contacts.find(p=>p.id===$('apiTestContact').value);
  const campaign=state.campaigns.find(c=>c.id===$('apiTestCampaign').value);
  if(!contact||!campaign||!state.org||!$('apiTestConsentConfirm').checked ||
     !isMetaTestAssigned(campaign.id,contact.id) ||
     !authorizedMetaTestContacts().some(p=>p.id===contact.id))
    return toast('Selecciona un contacto autorizado, vinculado a esta campaña, y confirma su consentimiento.',true);
  if(!confirm('¿Enviar UNA plantilla comercial aprobada desde el número 3133938312 a '+contact.nombre+' ('+contact.telefono_e164+')? Meta puede generar cargos. Esta acción no es una simulación.'))return;
  metaTemplateBusy=true;
  $('apiTemplateTestSend').disabled=true;
  $('apiTemplateTestResult').textContent='Solicitando el envío individual a Meta…';
  try{
    const result=await metaTemplateRequest('POST',{
      action:'send_test',org_id:state.org.id,campaign_id:campaign.id,contact_id:contact.id
    });
    $('apiTemplateTestResult').textContent=result?.message||'Meta aceptó la operación. Revisa el teléfono antes de repetir.';
    toast('Meta aceptó la solicitud. Comprueba el reporte: solo «Entregado» confirma la recepción.');
    $('apiTestConsentConfirm').checked=false;
    refreshMetaDeliveries();
  }catch(error){
    $('apiTemplateTestResult').textContent=error?.message||'No fue posible completar el envío de prueba.';
    toast('Error en la prueba. No repitas sin revisar el registro.',true);
  }finally{
    metaTemplateBusy=false;
    updateMetaTestButton();
  }
}


/* ── BANDEJA WHATSAPP CORPORATIVA ──
   Solo superadministrador y propietario: mensajes de la línea 3133938312.
   Toda acción consulta el servidor; no se exponen credenciales de Meta. */
const inboxState={
  conversations:[],current:null,messages:[],mode:'ia',canReply:false,
  filter:'todos',listBusy:false,threadBusy:false,sendBusy:false,
  modeBusy:false,searchTimer:null,pollTimer:null,badgePoll:null,searchPending:false,requestSerial:0,
  lastThreadId:null,lastMessageCount:0,lastThreadFingerprint:'',threadRequestId:0,moreMayExist:false
};
const inboxTime=(value)=>value?new Date(value).toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'}):'';
const inboxDate=(value)=>value?new Date(value).toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric'}):'';
const inboxSummaryTime=(value)=>{
  if(!value)return '';
  const coDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return coDay===today?inboxTime(value):inboxDate(value);
};
const inboxAvatar=(name)=>String(name||'?').trim().slice(0,1).toLocaleUpperCase('es-CO');
async function inboxRequest(method='GET',params={}){
  if(!state.isSuperAdmin)throw new Error('La bandeja es exclusiva de MIRED360.');
  const {data,error}=await db.auth.getSession();
  if(error)throw error;
  const token=data?.session?.access_token;
  if(!token)throw new Error('Inicia sesión nuevamente para acceder a la bandeja.');
  const url=new URL(API_URL+'/functions/v1/wa-inbox');
  if(method==='GET'){
    for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));
  }
  const res=await fetch(url,{
    method,headers:{
      'Authorization':'Bearer '+token,'apikey':PUBLIC_KEY,
      ...(method==='POST'?{'Content-Type':'application/json'}:{})
    },...(method==='POST'?{body:JSON.stringify(params)}:{}),cache:'no-store'
  });
  const payload=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(payload?.error||
    'El servidor no pudo completar la operación.');
  return payload;
}
function inboxUpdateCounters(){
  const rows=inboxState.conversations;
  const unread=rows.reduce((a,x)=>a+Number(x.no_leidos||0),0);
  const humans=rows.filter(x=>x.modo==='humano').length;
  $('inboxConversationCount').textContent=rows.length.toLocaleString('es-CO')+
    (inboxState.moreMayExist?'+':'');
  $('inboxUnreadCount').textContent=unread.toLocaleString('es-CO');
  $('inboxHumanCount').textContent=humans.toLocaleString('es-CO');
  $('inboxNavCount').hidden=unread===0;
  $('inboxNavCount').textContent=unread>99?'99+':String(unread);
}
function inboxRenderList(){
  const rows=inboxState.conversations.filter(x=>
    inboxState.filter==='todos' ||
    (inboxState.filter==='nuevos'&&Number(x.no_leidos||0)>0) ||
    (inboxState.filter==='humano'&&x.modo==='humano')
  );
  $('inboxList').innerHTML=rows.length?rows.map(c=>{
    const active=c.telefono===inboxState.current;
    const name=String(c.nombre||c.telefono);
    const last=String(c.preview||'');
    const preview=last||('Mensaje '+(c.tipo||'recibido'));
    const unread=Number(c.no_leidos||0);
    const human=c.modo==='humano';
    return '<button type="button" role="listitem" class="wa-inbox-row'+(active?' active':'')+'" data-inbox-phone="'+html(c.telefono)+'">'+
      '<span class="wa-inbox-avatar">'+html(inboxAvatar(name))+'</span>'+
      '<span class="wa-inbox-row-main">'+
        '<span class="wa-inbox-row-top"><strong title="'+html(name)+'">'+html(name)+'</strong>'+
           '<time>'+html(inboxSummaryTime(c.ultimo_en))+'</time></span>'+
        '<span class="wa-inbox-row-excerpt">'+(c.direccion==='saliente'?'✓ ':'')+html(preview)+'</span>'+
        '<span class="wa-inbox-row-sub"><span class="wa-inbox-tag'+(human?' humano':'')+'">'+(human?'● En atención':'◉ IA disponible')+'</span>'+
           (unread?'<span class="wa-inbox-unread">'+(unread>99?'99+':unread)+'</span>':'')+
        '</span>'+
      '</span></button>';
  }).join(''):'<div class="wa-inbox-list-empty">'+
    (inboxState.filter==='nuevos'?'¡Todo al día! No hay mensajes pendientes de leer.':
     inboxState.filter==='humano'?'No hay conversaciones en atención humana.':
     'No encontramos conversaciones para esta búsqueda.')+
    '</div>';
  $('inboxLastSync').textContent='Actualizado '+inboxTime(new Date().toISOString());
  inboxUpdateCounters();
}
async function inboxLoadList({quiet=false}={}){
  if(!state.isSuperAdmin||state.page!=='bandeja')return;
  if(inboxState.listBusy){inboxState.searchPending=true;return;}
  inboxState.listBusy=true;
  const serial=++inboxState.requestSerial;
  if(!quiet)$('inboxLastSync').textContent='Sincronizando…';
  try{
    const result=await inboxRequest('GET',{action:'list',search:$('inboxSearch').value.trim()});
    if(serial!==inboxState.requestSerial)return;
    inboxState.conversations=result.conversations||[];
    inboxState.moreMayExist=Boolean(result.more_may_exist);
    inboxRenderList();
  }catch(error){
    $('inboxLastSync').textContent='Sin conexión';
    if(!quiet)toast(error?.message||'No fue posible obtener las conversaciones.',true);
  }finally{
    inboxState.listBusy=false;
    if(inboxState.searchPending&&state.page==='bandeja'){
      inboxState.searchPending=false;
      inboxLoadList({quiet:true});
    }
  }
}
function inboxRenderThread(){
  const messages=inboxState.messages;
  const scroll=$('inboxThread');
  const oldNearBottom=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100;
  const last=messages[messages.length-1];
  const fingerprint=messages.map(m=>(m.id||'')+':'+(m.estado||'')).join('|');
  if(fingerprint===inboxState.lastThreadFingerprint)return;
  let lastDay='';
  scroll.innerHTML=messages.length?messages.map(m=>{
    const msgDate=inboxDate(m.creado_en);
    let divider='';
    if(msgDate!==lastDay){lastDay=msgDate;divider='<div class="wa-inbox-date">'+html(msgDate)+'</div>';}
    const outgoing=m.direccion==='saliente';
    const label=outgoing?(m.estado==='read'?'✓✓ Leído':m.estado==='delivered'?'✓✓ Entregado':m.estado==='failed'?'Error de entrega':'✓ Enviado'):'Recibido';
    const messageText=String(m.texto||'').trim()||('[Archivo o mensaje '+(m.tipo||'multimedia')+']');
    return divider+'<div class="wa-inbox-message'+(outgoing?' out':'')+'">'+
      '<div class="wa-inbox-bubble">'+html(messageText)+'</div>'+
      '<div class="wa-inbox-meta"><time>'+html(inboxTime(m.creado_en))+'</time>'+
      '<span>'+html(label)+'</span></div></div>';
  }).join(''):'<div class="wa-inbox-thread-empty">Todavía no hay mensajes en esta conversación.</div>';
  if(oldNearBottom||!inboxState.lastThreadId){
    scroll.scrollTop=scroll.scrollHeight;
  }
  // Abrir el chat mostrando los mensajes más recientes, incluso tras un repintado.
  if(!inboxState.lastThreadId){
    requestAnimationFrame(()=>{scroll.scrollTop=scroll.scrollHeight;});
  }
  inboxState.lastThreadId=last?.id||null;
  inboxState.lastMessageCount=messages.length;
  inboxState.lastThreadFingerprint=fingerprint;
}
function inboxUpdateComposer(){
  const human=inboxState.mode==='humano';
  $('inboxChatMode').textContent=human?'Atención humana':'MIRED360 IA';
  $('inboxChatMode').className='wa-inbox-mode-chip'+(human?' humano':'');
  $('inboxAttentionLabel').textContent=human?'Conversación tomada por ti':'Atención automática activa';
  $('inboxAttentionHint').textContent=human
    ?'MIRED360 IA está pausada en este chat. Tú decides cuándo responder.'
    :'MIRED360 IA puede responder automáticamente. Para escribir, toma la conversación.';
  $('inboxToggleHuman').textContent=human?'Devolver a MIRED360 IA':'Atender personalmente';
  $('inboxToggleHuman').disabled=inboxState.modeBusy;
  const canSend=human&&inboxState.canReply;
  $('inboxReply').disabled=!canSend||inboxState.sendBusy;
  $('inboxSend').disabled=!canSend||inboxState.sendBusy||
    !$('inboxReply').value.trim();
  $('inboxWindowNotice').classList.toggle('expired',!inboxState.canReply);
  $('inboxWindowNotice').textContent=!inboxState.canReply
    ?'La ventana de atención de 24 horas terminó. Solo podrás iniciar otra conversación con una plantilla aprobada y la autorización correspondiente.'
    :human?'Ventana activa: puedes responder al cliente por la API oficial de Meta.'
      :'Ventana activa: pulsa «Atender personalmente» para pausar la IA y responder.';
  $('inboxReplyCount').textContent=$('inboxReply').value.length.toLocaleString('es-CO')+' / 4.000';
}
async function inboxLoadThread(phone,{quiet=false}={}){
  if((inboxState.threadBusy&&quiet)||!phone)return;
  const requestId=++inboxState.threadRequestId;
  inboxState.threadBusy=true;
  try{
    const result=await inboxRequest('GET',{action:'thread',phone});
    if(inboxState.current!==phone||requestId!==inboxState.threadRequestId)return;
    inboxState.messages=result.messages||[];
    inboxState.mode=result.mode||'ia';
    inboxState.canReply=Boolean(result.can_reply);
    const listItem=inboxState.conversations.find(x=>x.telefono===phone);
    const displayName=listItem?.nombre||result.name||phone;
    $('inboxChatName').textContent=displayName;
    $('inboxChatPhone').textContent='+'+phone;
    $('inboxChatAvatar').textContent=inboxAvatar(displayName);
    inboxRenderThread();
    inboxUpdateComposer();
    if(!quiet){
      const read=await inboxRequest('POST',{action:'read',phone});
      if(inboxState.current===phone){
        await inboxLoadList({quiet:true});
      }
    }
  }catch(error){
    if(!quiet)toast(error?.message||'No se pudo leer la conversación.',true);
  }finally{if(requestId===inboxState.threadRequestId)inboxState.threadBusy=false;}
}
async function inboxOpen(phone){
  if(!phone||inboxState.sendBusy)return;
  inboxState.current=phone;
  inboxState.lastThreadId=null;
  inboxState.lastThreadFingerprint='';
  inboxState.lastMessageCount=0;
  inboxState.messages=[];
  $('inboxReply').value='';
  $('inboxWelcome').hidden=true;
  $('inboxConversation').hidden=false;
  $('inboxShell').classList.add('show-chat');
  $('inboxThread').innerHTML='<div class="wa-inbox-thread-empty">Cargando mensajes…</div>';
  inboxRenderList();
  await inboxLoadThread(phone);
}
function inboxCloseMobile(){
  $('inboxShell').classList.remove('show-chat');
  inboxState.current=null;
  $('inboxConversation').hidden=true;
  $('inboxWelcome').hidden=false;
  inboxRenderList();
}
async function inboxChangeMode(){
  const phone=inboxState.current;
  if(!phone||inboxState.modeBusy)return;
  const next=inboxState.mode==='humano'?'ia':'humano';
  if(next==='ia'&&!confirm('¿Devolver esta conversación a MIRED360 IA? El asistente podrá volver a contestar automáticamente.'))return;
  inboxState.modeBusy=true;
  inboxUpdateComposer();
  try{
    await inboxRequest('POST',{action:'set_mode',phone,mode:next});
    inboxState.mode=next;
    const row=inboxState.conversations.find(x=>x.telefono===phone);
    if(row)row.modo=next;
    toast(next==='humano'?'Atención humana activada. IA pausada para este chat.':
      'MIRED360 IA puede volver a responder.');
    inboxRenderList();
  }catch(error){
    toast(error?.message||'No se pudo cambiar el modo de atención.',true);
  }finally{inboxState.modeBusy=false;inboxUpdateComposer();}
}
async function inboxReplyToClient(event){
  event.preventDefault();
  if(inboxState.sendBusy||!inboxState.current)return;
  const phone=inboxState.current;
  const text=$('inboxReply').value.trim();
  if(!text||text.length>4000)return toast('Escribe una respuesta de hasta 4.000 caracteres.',true);
  if(inboxState.mode!=='humano'||!inboxState.canReply)return toast('Toma primero la conversación y verifica la ventana de atención.',true);
  inboxState.sendBusy=true;
  inboxUpdateComposer();
  try{
    const result=await inboxRequest('POST',{action:'reply',phone,message:text});
    if(result.submitted){
      $('inboxReply').value='';
      inboxState.lastThreadId=null;
      inboxState.lastThreadFingerprint='';
      await inboxLoadThread(phone);
      await inboxLoadList({quiet:true});
      toast(result.history_recorded?'Respuesta aceptada por Meta.':'Meta aceptó la respuesta. Comprueba el historial antes de repetir.');
    }
  }catch(error){
    toast((error?.message||'No se pudo completar el envío.')+' Revisa el chat antes de reenviar.',true);
  }finally{inboxState.sendBusy=false;inboxUpdateComposer();}
}
function inboxStart(){
  if(inboxState.pollTimer)clearInterval(inboxState.pollTimer);
  inboxLoadList();
  inboxState.pollTimer=setInterval(async()=>{
    if(document.visibilityState!=='visible'||state.page!=='bandeja')return;
    await inboxLoadList({quiet:true});
    if(inboxState.current&&!inboxState.threadBusy){
      await inboxLoadThread(inboxState.current,{quiet:true});
      // El operador tiene este chat abierto: marcar como leídos los
      // mensajes nuevos que ya estén visibles.
      if(inboxState.current) {
        try{await inboxRequest('POST',{action:'read',phone:inboxState.current});}
        catch(_error){}
      }
    }
  },20000);
}
function inboxStop(){
  if(inboxState.pollTimer){clearInterval(inboxState.pollTimer);inboxState.pollTimer=null;}
}
async function inboxRefreshBadge(){
  if(!state.isSuperAdmin||state.page==='bandeja'||document.visibilityState!=='visible')return;
  try{
    const response=await inboxRequest('GET',{action:'list'});
    if(state.page==='bandeja')return; // evitar que un refresco del menú sobrescriba la búsqueda del chat
    inboxState.conversations=response.conversations||[];
    inboxState.moreMayExist=Boolean(response.more_may_exist);
    inboxUpdateCounters();
  }catch(_error){
    // La bandeja podrá consultarse manualmente; no interrumpir otras secciones.
  }
}
function inboxStartBadge(){
  if(inboxState.badgePoll)clearInterval(inboxState.badgePoll);
  inboxRefreshBadge();
  inboxState.badgePoll=setInterval(inboxRefreshBadge,60000);
}
function inboxStopBadge(){
  if(inboxState.badgePoll){clearInterval(inboxState.badgePoll);inboxState.badgePoll=null;}
}
function inboxBindEvents(){
  $('inboxRefresh').addEventListener('click',async()=>{
    await inboxLoadList();
    if(inboxState.current)await inboxLoadThread(inboxState.current);
  });
  $('inboxList').addEventListener('click',event=>{
    const target=event.target.closest('[data-inbox-phone]');
    if(target)inboxOpen(target.dataset.inboxPhone);
  });
  $('inboxSearch').addEventListener('input',()=>{
    if(inboxState.searchTimer)clearTimeout(inboxState.searchTimer);
    inboxState.searchTimer=setTimeout(()=>inboxLoadList(),320);
  });
  document.querySelectorAll('[data-inbox-filter]').forEach(btn=>btn.addEventListener('click',()=>{
    inboxState.filter=btn.dataset.inboxFilter;
    document.querySelectorAll('[data-inbox-filter]').forEach(b=>b.classList.toggle('active',b===btn));
    inboxRenderList();
  }));
  $('inboxBack').addEventListener('click',inboxCloseMobile);
  $('inboxToggleHuman').addEventListener('click',inboxChangeMode);
  $('inboxReply').addEventListener('input',inboxUpdateComposer);
  $('inboxReplyForm').addEventListener('submit',inboxReplyToClient);
}

function bindEvents() {
  $('loginTab').addEventListener('click',()=>switchAuth('login'));
  $('registerTab').addEventListener('click',()=>switchAuth('register'));
  $('authToggle').addEventListener('click',()=>switchAuth(state.authMode==='register'?'login':'register'));
  $('authForm').addEventListener('submit',submitAuth);
  $('resetPassword').addEventListener('click',resetPassword);
  $('recoveryForm').addEventListener('submit',finishRecovery);
  $('requestStarter').addEventListener('click',requestStarter);
  $('refreshAdmin').addEventListener('click',loadAdmin);
  $('apiCheckStatus').addEventListener('click',checkApiConnection);
  $('apiCopyWebhook').addEventListener('click',copyApiWebhookUrl);
  inboxBindEvents();
  $('apiTemplateRefresh').addEventListener('click',refreshMetaTemplate);
  $('apiDeliveryRefresh').addEventListener('click',refreshMetaDeliveries);
  $('apiCopyCustomerLink').addEventListener('click',copyCustomerInitiationLink);
  $('apiTemplateCreate').addEventListener('click',submitMetaTemplate);
  $('apiTemplateTestSend').addEventListener('click',sendMetaTemplateTest);
  $('apiTestCampaign').addEventListener('change',()=>{
    $('apiTestConsentConfirm').checked=false;
    renderMetaTestContacts();
  });
  $('apiTestContact').addEventListener('change',()=>{
    $('apiTestConsentConfirm').checked=false;
    renderMetaTestContacts();
  });
  $('apiAssignTestContact').addEventListener('click',assignMetaTestContact);
  $('apiOpenContactForm').addEventListener('click',openAuthorizedMetaContactForm);
  $('apiTestConsentConfirm').addEventListener('change',updateMetaTestButton);
  $('adminRows').addEventListener('click',event=>{const btn=event.target.closest('[data-admin-activate]');if(btn)activatePaidPlan(btn.dataset.adminActivate);});
  $('inviteForm').addEventListener('submit',submitInvite);
  $('copyInvite').addEventListener('click',copyInviteLink);
  $('memberRows').addEventListener('click',e=>{const b=e.target.closest('[data-member-revoke]');if(b)revokeMember(b.dataset.memberRevoke);});
  $('inviteRows').addEventListener('click',e=>{
    const c=e.target.closest('[data-invite-cancel]'),p=e.target.closest('[data-invite-copy]');
    if(c)cancelInvitation(c.dataset.inviteCancel);
    if(p)copyPendingInvitation(p.dataset.inviteCopy);
  });
  $('orgForm').addEventListener('submit',createOrg);
  $('newOrgButton').addEventListener('click',()=>createOrg());
  $('orgSelect').addEventListener('change',event=>selectOrg(event.target.value));
  $('signOut').addEventListener('click',async()=>{
    await db.auth.signOut();
    inboxStop();
    inboxStopBadge();
    state.user=null;state.org=null;state.contacts=[];state.campaigns=[];state.actions=[];state.recipientAssignments=[];state.manualQueues=[];state.campaignPick=new Set();state.invites=[];state.member=null;
    $('authScreen').hidden=false;$('appScreen').hidden=true;
  });
  $('menuToggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
  document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.go)));
  document.querySelectorAll('[data-hide]').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.hide==='consentFormPanel')state.returnToCampaign=false;$(el.dataset.hide).hidden=true;}));
  $('contactFormToggle').addEventListener('click',()=>$('contactFormPanel').hidden=!$('contactFormPanel').hidden);
  $('campaignFormToggle').addEventListener('click',()=>{
    const show=$('campaignFormPanel').hidden;
    if(show)resetCampaignComposer();
    $('campaignFormPanel').hidden=!show;
    if(show)$('campaignFormPanel').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('campaignMessagePreset').addEventListener('change',applyCampaignMessagePreset);
  $('campaignText').addEventListener('input',renderCampaignMessagePreview);
  document.querySelectorAll('[data-insert-variable]').forEach(button=>
    button.addEventListener('click',()=>insertCampaignVariable(button.dataset.insertVariable)));
  $('campaignCancelEdit').addEventListener('click',()=>{
    resetCampaignComposer();$('campaignFormPanel').hidden=true;
  });
  $('campaignEditMessage').addEventListener('click',beginCampaignEdit);
  $('contactForm').addEventListener('submit',addContact);
  $('contactSearch').addEventListener('input',()=>{state.contactLimit=250;renderContacts();});
  $('contactFilter').addEventListener('change',()=>{state.contactLimit=250;renderContacts();});
  $('contactLoadMore').addEventListener('click',()=>{state.contactLimit+=250;renderContacts();});
  $('showPendingContacts').addEventListener('click',()=>{$('contactFilter').value='pending';$('contactSearch').value='';renderContacts();$('contactRows').scrollIntoView({behavior:'smooth',block:'start'});});
  $('consentForm').addEventListener('submit',saveContactConsent);
  $('exportContacts').addEventListener('click',exportContacts);
  $('csvFile').addEventListener('change',importCSV);
  $('campaignForm').addEventListener('submit',addCampaign);
  $('contactRows').addEventListener('click',event=>{
    const button=event.target.closest('[data-optout]'), verified=event.target.closest('[data-verify-consent]');
    if(button)toggleOptout(button.dataset.optout);
    if(verified)openConsentForm(verified.dataset.verifyConsent);
  });
  $('campaignCards').addEventListener('click',event=>{
    const button=event.target.closest('[data-open-campaign]');
    if(button)openCampaign(button.dataset.openCampaign);
  });
  $('campaignAddContacts').addEventListener('click',showCampaignPicker);
  $('cancelCampaignAssign').addEventListener('click',()=>{$('campaignAssignPanel').hidden=true;});
  $('campaignContactSearch').addEventListener('input',()=>{state.campaignPickLimit=150;renderCampaignPicker();});
  $('campaignContactFilter').addEventListener('change',()=>{state.campaignPickLimit=150;renderCampaignPicker();});
  $('campaignPickerMore').addEventListener('click',()=>{state.campaignPickLimit+=150;renderCampaignPicker();});
  $('campaignSelectAll').addEventListener('click',()=>{for(const c of unassignedCampaignContacts())state.campaignPick.add(c.id);renderCampaignPicker();});
  $('campaignClearSelection').addEventListener('click',()=>{state.campaignPick.clear();renderCampaignPicker();});
  $('campaignPickerRows').addEventListener('change',event=>{const checkbox=event.target.closest('[data-pick-contact]');if(!checkbox)return;if(checkbox.checked)state.campaignPick.add(checkbox.dataset.pickContact);else state.campaignPick.delete(checkbox.dataset.pickContact);renderCampaignPicker();});
  $('campaignSaveSelected').addEventListener('click',saveCampaignRecipients);
  $('campaignTargetLoadMore').addEventListener('click',()=>{state.campaignTargetLimit+=150;renderCampaignDetail();});
  queueController.bindEvents();
  $('closeDetail').addEventListener('click',()=>{state.selectedCampaign=null;$('campaignDetail').hidden=true;});
  $('exportCampaignReport').addEventListener('click',exportCampaignReport);
  $('targetRows').addEventListener('click',event=>{
    const open=event.target.closest('[data-whatsapp]'),done=event.target.closest('[data-mark-contacted]');
    const answered=event.target.closest('[data-mark-responded]'),uninterested=event.target.closest('[data-mark-uninterested]');
    const remove=event.target.closest('[data-remove-recipient]'),permit=event.target.closest('[data-go-permission]');
    if(remove)removeCampaignRecipient(remove.dataset.removeRecipient);
    if(permit)openContactPermissionFromCampaign(permit.dataset.goPermission);
    if(open)openWhatsApp(open.dataset.whatsapp);
    if(done)markContacted(done.dataset.markContacted);
    if(answered)markCampaignStatus(answered.dataset.markResponded,'respondio');
    if(uninterested)markCampaignStatus(uninterested.dataset.markUninterested,'sin_interes');
  });
}
async function init() {
  bindEvents();
  renderCampaignMessagePreview();
  queueController.startClock();
  const recoveryHash=new URLSearchParams(window.location.hash.replace(/^#/,''));
  if(recoveryHash.get('type')==='recovery')showRecovery();
  db.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')showRecovery();});
  try {
    const {data,error}=await db.auth.getUser();
    if(error && !/session missing/i.test(error.message)) console.warn(error.message);
    if(data?.user&&!state.recovering){state.user=data.user;await boot();}
  } catch(error){reportError(error,'No fue posible iniciar la sesión.');}
}
init();
