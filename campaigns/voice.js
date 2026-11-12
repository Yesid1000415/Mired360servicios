export function bindVoice(request, currentPhone, report) {
  const dial = document.getElementById('voiceDial');
  if (!dial) return;
  const panel = document.getElementById('voicePanel');
  const label = document.getElementById('voiceState');
  const audio = document.getElementById('voiceAudio');
  const end = document.getElementById('voiceEnd');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let active;
  function stopTone(call) {
    if (call.tone) { call.tone.stop(); call.tone = null; }
  }
  function ring(call) {
    if (call.closed || call.audioReady || !call.sound || call.tone || call.sound.state !== 'running') return;
    const tone = call.sound.createOscillator();
    const gain = call.sound.createGain();
    gain.gain.value = 0;
    tone.frequency.value = 425;
    tone.connect(gain).connect(call.sound.destination);
    const start = call.sound.currentTime;
    for (let t=start; t<start+90; t+=4) {
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(0.15,t+0.02);
      gain.gain.setValueAtTime(0.15,t+0.95);
      gain.gain.linearRampToValueAtTime(0,t+1);
    }
    tone.start();
    call.tone=tone;
  }
  function release(call) {
    stopTone(call);
    call.sound?.close().catch(()=>{});
    call.stream?.getTracks().forEach(track => track.stop());
    call.peer?.close();
    if (active !== call) return;
    active = null;
    audio.srcObject = null;
    panel.hidden = true;
    dial.disabled = false;
  }
  async function finish(call, hangup) {
    if (call.closed) return;
    call.closed = true;
    release(call);
    if (hangup && call.id) {
      try { await request('POST',{action:'voice_end',phone:call.phone,id:call.id}); }
      catch (error) { report(error.message); }
    }
  }
  end.onclick = () => active && finish(active,true);
  window.addEventListener('pagehide', () => active && finish(active,true));
  dial.onclick = async () => {
    const phone = currentPhone();
    if (!phone || active) return;
    const call = {phone};
    try { call.sound = new AudioContext(); call.sound.resume().catch(()=>{}); } catch {}
    active = call;
    dial.disabled = true;
    panel.hidden = false;
    label.textContent = 'Preparando micrófono · +' + phone;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      if (call.closed) { stream.getTracks().forEach(track => track.stop()); return; }
      call.stream = stream;
      const peer = new RTCPeerConnection();
      call.peer = peer;
      stream.getAudioTracks().forEach(track => peer.addTrack(track,stream));
      peer.ontrack = event => {
        audio.srcObject = new MediaStream([event.track]);
        audio.play().catch(() => {audio.controls = true;});
      };
      await peer.setLocalDescription(await peer.createOffer());
      const iceDeadline = Date.now()+8000;
      while (!call.closed && peer.iceGatheringState !== 'complete' && Date.now()<iceDeadline) await pause(80);
      if (call.closed) return;
      label.textContent = 'Llamando a +' + phone;
      const result = await request('POST',{action:'voice_start',phone,sdp:peer.localDescription.sdp});
      call.id = result.id;
      if (!call.closed) {
        label.textContent = 'Marcando · esperando confirmación de WhatsApp · +' + phone;
        ring(call);
        call.sound?.resume().then(()=>ring(call)).catch(()=>{});
      }
      if (call.closed) { await request('POST',{action:'voice_end',phone,id:call.id}); return; }
      const deadline = Date.now()+90000;
      while (!call.closed) {
        const state = await request('POST',{action:'voice_status',phone,id:call.id});
        if (call.closed) return;
        if (state.estado_remoto === 'REJECTED') {await finish(call,false); report('El contacto rechazó la llamada.'); return;}
        if (state.estado === 'terminate') {await finish(call,false); report('Llamada finalizada.'); return;}
        if (state.sdp_answer && !peer.remoteDescription) await peer.setRemoteDescription({type:'answer',sdp:state.sdp_answer});
        if (state.estado_remoto === 'RINGING') {
          label.textContent = 'Timbrando · +' + phone;
          ring(call);
        } else if (state.estado_remoto === 'ACCEPTED') {
          call.audioReady = true;
          stopTone(call);
          label.textContent = (peer.connectionState === 'connected' ? 'En llamada' : 'Contestaron. Conectando audio') + ' · +' + phone;
        }
        if (!state.estado_remoto && peer.connectionState === 'connected') {
          call.audioReady = true;
          stopTone(call);
          label.textContent = 'Audio conectado · +' + phone;
        }
        if (peer.connectionState === 'failed' || (Date.now()>deadline && peer.connectionState !== 'connected')) throw new Error('No se pudo establecer el audio con el contacto.');
        await pause(state.estado_remoto === 'ACCEPTED' ? 2500 : 900);
      }
    } catch(error) {
      if (!call.closed) { await finish(call,true); report(error.name === 'NotAllowedError' ? 'Permite el micrófono en tu navegador para llamar.' : error.message); }
    }
  };
}
