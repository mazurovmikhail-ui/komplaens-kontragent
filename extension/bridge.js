/* Мост между страницей приложения и расширением.
   Страница не может обращаться к расширению напрямую, поэтому общается с этим скриптом
   через window.postMessage, а он пересылает запросы фоновому скрипту. */
(function(){
  const VERSION = chrome.runtime.getManifest().version;
  const CMDS = ['check', 'fssp'];

  function mark(){ document.documentElement.setAttribute('data-kpk-ext', VERSION); }
  mark();
  document.addEventListener('DOMContentLoaded', ()=>{ mark(); window.postMessage({kpk:'ready', version:VERSION}, location.origin); });

  window.addEventListener('message', e=>{
    if(e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if(!m || m.kpk !== 'req' || !CMDS.includes(m.cmd)) return;
    const inn = String(m.inn||'').replace(/\D/g,'');
    chrome.runtime.sendMessage({cmd:m.cmd, inn}, res=>{
      const err = chrome.runtime.lastError;
      window.postMessage({kpk:'res', id:m.id, ok:!err && !!res && !res.error, data:res||null,
                          error: err ? 'расширение не ответило — обновите страницу' : (res && res.error) || ''}, location.origin);
    });
  });

  /* результаты ФССП приходят позже, когда человек пройдёт капчу на сайте приставов */
  chrome.runtime.onMessage.addListener(msg=>{
    if(msg && msg.kpk === 'fssp-result') window.postMessage({kpk:'fssp', data:msg.data}, location.origin);
  });
})();
