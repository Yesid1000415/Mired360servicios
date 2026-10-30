// MIRED360 CAMPAIGNS — cola asistida y manual por usuario y campaña.
// Esta aplicación NO automatiza envíos a través de WhatsApp normal.
export function createManualQueueController(ctx) {
  const {db,state,toast,reportError,licenseEnabled,permittedCommercialHourCO,
    selectedCampaignContacts,isAuthorizedForMessages,assignedRecipientIsAuthorized,loadData} = ctx;
  const $ = id => document.getElementById(id);
  const INTERVAL_SECONDS = 120;
  let busy = false;
  let timer = null;

  function getQueue() {
    return state.manualQueues.find(q => q.campana_id === state.selectedCampaign && q.usuario_id === state.user?.id) || null;
  }
  function currentContact(q=getQueue()) {
    if(!q || q.posicion >= q.contactos.length)return null;
    return state.contacts.find(c=>c.id === q.contactos[q.posicion]) || null;
  }
  function remainingSeconds(q=getQueue()) {
    if(!q?.siguiente_habilitado_en)return 0;
    const when=new Date(q.siguiente_habilitado_en).getTime();
    return Number.isFinite(when)?Math.max(0,Math.ceil((when-Date.now())/1000)):0;
  }
  function candidates() {
    const statuses=new Map(state.actions.filter(a=>a.campana_id===state.selectedCampaign).map(a=>[a.contacto_id,a.estado]));
    return selectedCampaignContacts().map(x=>x.contact).filter(p=>
      isAuthorizedForMessages(p) && !['contactado','respondio','sin_interes','preparado'].includes(statuses.get(p.id))
    );
  }
  function remember(row) {
    const n=state.manualQueues.findIndex(x=>x.id===row.id);
    if(n<0)state.manualQueues.push(row);
    else state.manualQueues[n]=row;
  }
  async function update(changes,expectedPosition=null,expectedStatus=null,expectedWaiting=null) {
    const q=getQueue();
    if(!q || !state.org || !state.user)throw Error('La tanda no está disponible.');
    let query=db.from('wa_campana_colas').update({...changes,actualizado_en:new Date().toISOString()})
      .eq('id',q.id).eq('organizacion_id',state.org.id).eq('usuario_id',state.user.id);
    if(expectedPosition!==null)query=query.eq('posicion',expectedPosition);
    if(expectedStatus!==null)query=query.eq('estado',expectedStatus);
    if(expectedWaiting!==null)query=query.eq('esperando_confirmacion',expectedWaiting);
    const {data,error}=await query.select('*').maybeSingle();
    if(error)throw error;
    if(!data)throw Error('La tanda cambió en otra sesión. Recarga la página para recuperar su estado.');
    remember(data);
    return data;
  }
  function statusLabel(q) {
    if(!q)return 'Sin tanda';
    if(q.estado==='completada')return 'Finalizada';
    if(q.estado==='pausada')return 'En pausa';
    return q.esperando_confirmacion?'Por confirmar':'En curso';
  }
  function render() {
    const q=getQueue();
    const eligible=candidates();
    const started=!!q && q.estado!=='completada' && q.posicion<q.contactos.length;
    $('queueStartPanel').hidden=!!q;
    $('queueRunPanel').hidden=!started;
    $('queueDonePanel').hidden=!q || started;
    $('queueStatus').textContent=statusLabel(q);
    $('queueStatus').className='queue-badge'+(!q?'':q.estado==='completada'?' done':q.estado==='pausada'?' paused':' active');
    $('queueAvailable').textContent=eligible.length
      ?eligible.length.toLocaleString('es-CO')+' contactos con autorización, asignados y sin gestión previa. Selecciona cuántos incluir en esta tanda.'
      :'No hay contactos autorizados pendientes de gestión. Agrégalos a la campaña y registra únicamente permisos verificables.';
    $('queueStart').disabled=busy || !licenseEnabled() || eligible.length===0;
    $('queueNextBatch').disabled=busy || !licenseEnabled() || eligible.length===0;
    if(q){
      const total=q.contactos.length;
      const processed=Math.min(total,Math.max(0,q.posicion));
      $('queueCounter').textContent=processed+' de '+total+' gestionados u omitidos';
      $('queueProgressFill').style.width=(100*processed/total)+'%';
      $('queueProgress').setAttribute('aria-valuenow',String(Math.round(100*processed/total)));
      if(!started){
        $('queueDoneDescription').textContent='Se procesaron u omitieron '+processed+' de '+total+' contactos. Quedan '+eligible.length+' contactos elegibles para otra tanda.';
      }else{
        const person=currentContact(q);
        $('queueCurrentName').textContent=person?.nombre || 'Contacto retirado';
        $('queueCurrentPhone').textContent=person?.telefono_e164 || '';
        $('queueStepInfo').textContent=q.esperando_confirmacion
          ?'Regresa después de enviar el mensaje en WhatsApp. Confirma solo si efectivamente lo enviaste; si no, puedes omitir este contacto.'
          :'Abre la conversación, envía personalmente el mensaje y regresa para confirmar el envío.';
        $('queueOpenNext').hidden=!!q.esperando_confirmacion;
        $('queueConfirmSent').hidden=!q.esperando_confirmacion;
        $('queuePause').hidden=q.estado==='pausada';
        $('queueResume').hidden=q.estado!=='pausada';
        $('queueSkip').textContent=q.esperando_confirmacion?'No envié / Omitir':'Omitir contacto';
      }
    }
    clock();
  }
  function clock(){
    const q=getQueue();
    if(!q || q.estado==='completada' || $('queueRunPanel').hidden)return;
    const person=currentContact(q);
    const waiting=remainingSeconds(q);
    const valid=person && isAuthorizedForMessages(person) && assignedRecipientIsAuthorized(person.id);
    const hours=person && (!person.telefono_e164.startsWith('+57') || permittedCommercialHourCO());
    let message;
    if(q.esperando_confirmacion)message='Esperando confirmación manual';
    else if(q.estado==='pausada')message='En pausa';
    else if(!valid)message='Contacto no autorizado: omitir';
    else if(waiting>0)message='Siguiente chat en '+String(Math.floor(waiting/60)).padStart(2,'0')+':'+String(waiting%60).padStart(2,'0');
    else if(!hours)message='Fuera del horario comercial';
    else message='Listo para abrir el chat';
    $('queueTime').textContent=message;
    $('queueOpenNext').disabled=busy || q.estado!=='activa' || q.esperando_confirmacion || waiting>0 || !valid || !hours || !licenseEnabled();
    // La pausa no impide registrar un mensaje enviado antes de pausar.
    $('queueConfirmSent').disabled=busy || !q.esperando_confirmacion || !licenseEnabled();
    $('queueSkip').disabled=busy || q.estado!=='activa' || !licenseEnabled();
    $('queuePause').disabled=busy;
    $('queueResume').disabled=busy;
    $('queueStop').disabled=busy;
  }
  async function start() {
    if(busy)return;
    const previous=getQueue();
    if(previous && previous.estado!=='completada')return toast('Hay una tanda abierta. Puedes pausarla, continuarla o detenerla.',true);
    if(!state.org || !state.selectedCampaign || !licenseEnabled())return toast('Abre una campaña activa.',true);
    const available=candidates();
    if(!available.length)return toast('No hay destinatarios con permiso vigente pendientes de gestionar.',true);
    const n=Math.min(50,Math.max(1,Number($('queueBatchSize').value)||50));
    const contactos=available.slice(0,n).map(c=>c.id);
    if(!confirm('¿Preparar '+contactos.length+' contactos en una tanda asistida? Cada mensaje se enviará manualmente, con 120 segundos de espera tras la confirmación.'))return;
    busy=true;render();
    try{
      // Conserva el enfriamiento entre tandas. No modifica los envíos previos.
      const cooldown=previous?.siguiente_habilitado_en && new Date(previous.siguiente_habilitado_en)>new Date()
        ?previous.siguiente_habilitado_en:null;
      const {data,error}=await db.from('wa_campana_colas').upsert({
        organizacion_id:state.org.id,campana_id:state.selectedCampaign,usuario_id:state.user.id,
        contactos,posicion:0,intervalo_segundos:INTERVAL_SECONDS,estado:'activa',
        esperando_confirmacion:false,chat_abierto_en:null,siguiente_habilitado_en:cooldown,
        actualizado_en:new Date().toISOString()
      },{onConflict:'organizacion_id,campana_id,usuario_id'}).select('*').single();
      if(error)throw error;
      remember(data);
      toast('Tanda de '+contactos.length+' contactos lista. Aún no se ha enviado ningún mensaje.');
    }catch(error){reportError(error,'No se pudo preparar la tanda.');}
    finally{busy=false;render();}
  }
  async function pause(){
    if(busy)return;
    const q=getQueue();
    if(!q || q.estado!=='activa')return;
    busy=true;clock();
    try{await update({estado:'pausada'},q.posicion,'activa');toast('Tanda pausada; el progreso quedó guardado.');}
    catch(error){reportError(error);}finally{busy=false;render();}
  }
  async function resume(){
    if(busy)return;
    const q=getQueue();
    if(!q || q.estado!=='pausada')return;
    busy=true;clock();
    try{await update({estado:'activa'},q.posicion,'pausada');toast('Tanda reanudada. Se mantiene la espera de 120 segundos.');}
    catch(error){reportError(error);}finally{busy=false;render();}
  }
  async function stop(){
    if(busy)return;
    const q=getQueue();
    if(!q || q.estado==='completada')return;
    if(!confirm('¿Detener esta tanda? Se conservarán las gestiones confirmadas. Los contactos sin mensaje confirmado podrán incluirse de nuevo.'))return;
    busy=true;clock();
    try{
      await update({estado:'completada',posicion:q.contactos.length,esperando_confirmacion:false,chat_abierto_en:null},q.posicion,q.estado);
      toast('Tanda detenida. No se realizó ningún envío automático.');
      await loadData();
    }catch(error){reportError(error);}finally{busy=false;render();}
  }
  async function skip(){
    if(busy)return;
    const q=getQueue();
    if(!q || q.estado!=='activa' || q.posicion>=q.contactos.length)return;
    if(q.esperando_confirmacion && !confirm('Confirma que NO enviaste el mensaje. El contacto se omitirá sin registrarlo como enviado.'))return;
    busy=true;clock();
    try{
      const next=q.posicion+1;
      await update({
        posicion:next,estado:next>=q.contactos.length?'completada':'activa',
        esperando_confirmacion:false,chat_abierto_en:null
      },q.posicion,'activa',q.esperando_confirmacion);
      toast('Contacto omitido. No se registró un mensaje enviado.');
    }catch(error){reportError(error);}finally{busy=false;render();}
  }
  async function openCurrent(){
    if(busy)return;
    const q=getQueue();
    if(!q || q.estado!=='activa' || q.esperando_confirmacion || q.posicion>=q.contactos.length)return;
    if(remainingSeconds(q)>0)return toast('Aún no se cumplen los 120 segundos desde la última confirmación.',true);
    const person=currentContact(q), campaign=state.campaigns.find(c=>c.id===state.selectedCampaign);
    if(!person || !campaign || !assignedRecipientIsAuthorized(person.id) || !isAuthorizedForMessages(person))
      return toast('El destinatario fue retirado o no tiene autorización vigente. Puedes omitirlo.',true);
    if(!licenseEnabled())return toast('La suscripción no está activa.',true);
    if(person.telefono_e164.startsWith('+57') && !permittedCommercialHourCO())
      return toast('Estás fuera del horario comercial para Colombia.',true);
    if(person.telefono_e164.startsWith('+57') &&
      !confirm('¿Confirmas que hoy NO es festivo en Colombia y que este cliente autorizó mensajes comerciales?'))return;
    const text=campaign.mensaje.replace(/\{nombre\}/gi,person.nombre).replace(/\{empresa\}/gi,state.org?.nombre||'Tu empresa');
    const url='https://wa.me/'+person.telefono_e164.replace('+','')+'?text='+encodeURIComponent(text);
    // Esta llamada solo ocurre tras pulsar el botón: jamás hay apertura automática.
    const tab=window.open(url,'_blank');
    if(!tab)return toast('No pudimos confirmar la apertura de WhatsApp. Permite ventanas emergentes y vuelve a pulsar.',true);
    try{tab.opener=null;}catch{}
    busy=true;clock();
    try{
      await update({esperando_confirmacion:true,chat_abierto_en:new Date().toISOString()},q.posicion,'activa',false);
      toast('Chat abierto. Regresa y confirma solo si enviaste el mensaje personalmente.');
    }catch(error){
      reportError(error,'El chat se abrió pero el avance no se guardó. Revisa antes de repetir el envío.');
    }finally{busy=false;render();}
  }
  async function confirmSent(){
    if(busy)return;
    const q=getQueue();
    if(!q || !q.esperando_confirmacion || q.posicion>=q.contactos.length)return;
    const person=currentContact(q);
    if(!person || !assignedRecipientIsAuthorized(person.id))
      return toast('Este contacto perdió la autorización. Revisa la gestión.',true);
    if(!confirm('¿Ya enviaste personalmente el mensaje a '+person.nombre+' por WhatsApp? Comenzarán 120 segundos antes del siguiente chat.'))return;
    busy=true;clock();
    try{
      const now=new Date();
      const {error}=await db.from('wa_gestiones').upsert({
        organizacion_id:state.org.id,campana_id:state.selectedCampaign,contacto_id:person.id,
        usuario_id:state.user.id,estado:'contactado',actualizado_en:now.toISOString()
      },{onConflict:'campana_id,contacto_id'});
      if(error)throw error;
      const next=q.posicion+1;
      await update({
        posicion:next,estado:next>=q.contactos.length?'completada':q.estado,
        esperando_confirmacion:false,chat_abierto_en:null,
        siguiente_habilitado_en:new Date(now.getTime()+INTERVAL_SECONDS*1000).toISOString()
      },q.posicion,q.estado,true);
      toast(next>=q.contactos.length?'Tanda terminada. Envío confirmado.':'Envío confirmado. Inició la espera de 120 segundos.');
      await loadData();
    }catch(error){
      reportError(error,'No se pudo guardar la confirmación. Comprueba el estado antes de repetir mensajes.');
      await loadData();
    }finally{busy=false;render();}
  }
  function bindEvents(){
    $('queueStart').addEventListener('click',start);
    $('queueNextBatch').addEventListener('click',start);
    $('queueOpenNext').addEventListener('click',openCurrent);
    $('queueConfirmSent').addEventListener('click',confirmSent);
    $('queuePause').addEventListener('click',pause);
    $('queueResume').addEventListener('click',resume);
    $('queueSkip').addEventListener('click',skip);
    $('queueStop').addEventListener('click',stop);
  }
  function startClock(){
    if(timer===null)timer=setInterval(clock,1000);
  }
  return {getQueue,render,bindEvents,startClock};
}
