export function bindVoice(request, currentPhone, report) {
  const dial = document.getElementById('voiceDial');
  if (!dial) return;
  const panel = document.getElementById('voicePanel');
  const label = document.getElementById('voiceState');
  const audio = document.getElementById('voiceAudio');
  const end = document.getElementById('voiceEnd');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let active;
  function release(call) {
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
      if (call.closed) { await request('POST',{action:'voice_end',phone,id:call.id}); return; }
      const deadline = Date.now()+90000;
      while (!call.closed) {
        const state = await request('POST',{action:'voice_status',phone,id:call.id});
        if (call.closed) return;
        if (state.estado === 'terminate') {await finish(call,false); report('Llamada finalizada.'); return;}
        if (state.sdp_answer && !peer.remoteDescription) await peer.setRemoteDescription({type:'answer',sdp:state.sdp_answer});
        if (peer.connectionState === 'connected') label.textContent = 'Audio conectado · +' + phone;
        if (peer.connectionState === 'failed' || (Date.now()>deadline && peer.connectionState !== 'connected')) throw new Error('No se pudo establecer el audio con el contacto.');
        await pause(peer.connectionState === 'connected' ? 3000 : 1000);
      }
    } catch(error) {
      if (!call.closed) { await finish(call,true); report(error.name === 'NotAllowedError' ? 'Permite el micrófono en tu navegador para llamar.' : error.message); }
    }
  };
}
