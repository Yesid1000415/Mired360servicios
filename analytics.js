
(function(){
  const cfg = window.MIRED360_ANALYTICS || {};
  const qs = new URLSearchParams(location.search);

  const attribution = {
    source: qs.get('utm_source') || qs.get('source') || '',
    medium: qs.get('utm_medium') || '',
    campaign: qs.get('utm_campaign') || qs.get('campaign') || '',
    content: qs.get('utm_content') || '',
    advisor: qs.get('asesor') || qs.get('advisor') || ''
  };

  try {
    sessionStorage.setItem('m360_attribution', JSON.stringify(attribution));
  } catch(e){}

  function getAttr(){
    try {
      const saved = JSON.parse(sessionStorage.getItem('m360_attribution') || '{}');
      return Object.assign({}, attribution, saved);
    } catch(e) {
      return attribution;
    }
  }

  function attrLabel(){
    const a = getAttr();
    const parts = [];
    if(a.source) parts.push('Fuente: ' + a.source);
    if(a.medium) parts.push('Medio: ' + a.medium);
    if(a.campaign) parts.push('Campaña: ' + a.campaign);
    if(a.advisor) parts.push('Asesor: ' + a.advisor);
    return parts.join(' | ');
  }

  // GA4 optional loader
  if(cfg.ga4MeasurementId && /^G-[A-Z0-9]+$/i.test(cfg.ga4MeasurementId)){
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4MeasurementId);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', cfg.ga4MeasurementId, {
      send_page_view: true,
      campaign_source: getAttr().source || undefined,
      campaign_medium: getAttr().medium || undefined,
      campaign_name: getAttr().campaign || undefined
    });
  }

  function event(name, params){
    const payload = Object.assign({
      page_location: location.href,
      page_title: document.title
    }, getAttr(), params || {});

    if(typeof window.gtag === 'function'){
      gtag('event', name, payload);
    }

    // Lightweight local debugging/QA log for the owner device.
    try {
      const key = 'm360_event_log';
      const log = JSON.parse(localStorage.getItem(key) || '[]');
      log.push({name:name, ts:new Date().toISOString(), data:payload});
      if(log.length > 200) log.splice(0, log.length - 200);
      localStorage.setItem(key, JSON.stringify(log));
    } catch(e){}
  }

  // Track clicks and enrich WhatsApp message with attribution.
  document.addEventListener('click', function(ev){
    const link = ev.target.closest('a');
    if(!link) return;

    const trackName = link.dataset.track;
    if(trackName){
      event(trackName, {
        link_text: (link.innerText || '').trim().slice(0,100),
        link_url: link.href
      });
    }

    if(link.href && link.href.indexOf('https://wa.me/') === 0){
      const info = attrLabel();
      if(info){
        try {
          const u = new URL(link.href);
          let text = u.searchParams.get('text') || '';
          if(text.indexOf('Origen:') === -1){
            text += '\n\nOrigen: ' + info;
            u.searchParams.set('text', text);
            link.href = u.toString();
          }
        } catch(e){}
      }

      event('lead_whatsapp', {
        link_text: (link.innerText || '').trim().slice(0,100),
        destination: 'whatsapp'
      });
    }
  }, true);

  // Track section views once per session.
  const seen = new Set();
  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(!entry.isIntersecting) return;
      const id = entry.target.id;
      if(!id || seen.has(id)) return;
      seen.add(id);
      event('section_view', {section_id:id});
    });
  }, {threshold:0.45});

  document.querySelectorAll('section[id]').forEach(function(sec){
    observer.observe(sec);
  });

  // Expose a small helper for owner testing in browser console.
  window.MIRED360 = {
    attribution: getAttr,
    events: function(){
      try { return JSON.parse(localStorage.getItem('m360_event_log') || '[]'); }
      catch(e){ return []; }
    },
    clearEvents: function(){ localStorage.removeItem('m360_event_log'); }
  };
})();
