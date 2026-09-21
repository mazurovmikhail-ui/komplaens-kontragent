/* Страница поиска ФССП. Скрипт подставляет ИНН, запускает поиск и ждёт результата.
   Капчу вводит человек: расширение её не распознаёт и не обходит. */
(function(){
  chrome.storage.local.get('fsspPending', ({fsspPending})=>{
    if(!fsspPending || Date.now() - fsspPending.at > 15*60*1000) return;
    start(fsspPending.inn);
  });

  function start(inn){
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;background:#1a1d26;color:#fff;'
      + 'font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;padding:14px 16px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    const title = document.createElement('div'); title.style.cssText = 'font-weight:700;margin-bottom:6px'; title.textContent = 'Комплаенс-проверка';
    const msg = document.createElement('div');
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';
    const mk = t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
      b.style.cssText = 'font:inherit;font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid #6b7384;background:#2a2f3b;color:#fff;cursor:pointer'; return b; };
    const send = mk('Передать результаты'), none = mk('Ничего не найдено');
    row.append(send, none); panel.append(title, msg, row); document.body.appendChild(panel);
    const say = t => { msg.textContent = t; };

    let done = false;
    function finish(data){
      if(done) return; done = true;
      chrome.runtime.sendMessage({kpk:'fssp-parsed', data});
      say('Результат передан в приложение. Вкладку можно закрыть.'); row.remove();
    }
    send.onclick = ()=>{ const d = parse(); if(d.rows.length || d.empty) finish(d); else say('Таблицы с результатами на странице пока нет. Дождитесь её и нажмите ещё раз.'); };
    none.onclick = ()=>finish({n:0, rows:[], more:false, empty:true, manual:true});

    fill(inn, say);

    /* как только сайт покажет таблицу или сообщение о пустом результате — забрать */
    const obs = new MutationObserver(()=>{
      if(done) return;
      const d = parse();
      if(d.rows.length || d.empty){ obs.disconnect(); finish(d); }
    });
    obs.observe(document.body, {childList:true, subtree:true});
  }

  function fill(inn, say){
    const form = document.getElementById('ip_form');
    if(!form){ say('Форма поиска на странице не найдена. Выполните поиск по ИНН ' + inn + ' вручную, затем нажмите «Передать результаты».'); return; }
    const legal = inn.length === 10;
    const radio = form.querySelector('input[type=radio][value="' + (legal ? '5' : '1') + '"]');
    if(radio){ radio.click(); radio.dispatchEvent(new Event('change', {bubbles:true})); }
    if(!legal){ say('ИНН ' + inn + ' принадлежит предпринимателю: ФССП ищет таких должников по фамилии, имени и дате рождения. Заполните форму и пройдите капчу — результат заберу сам.'); return; }
    setTimeout(()=>{
      const field = form.querySelector('[name="is[inn]"]');
      if(!field){ say('Поле ИНН не найдено. Выберите «Поиск по ИНН юридического лица», введите ' + inn + ' и нажмите «Найти».'); return; }
      field.focus(); field.value = inn;
      ['input','change','keyup'].forEach(n=>field.dispatchEvent(new Event(n, {bubbles:true})));
      say('ИНН ' + inn + ' подставлен. Нажмите «Найти» и введите код с картинки — результат заберу сам.');
    }, 800);
  }

  function parse(){
    const clean = el => el ? el.textContent.replace(/\s+/g,' ').trim() : '';
    const box = document.querySelector('.results') || document;
    const rows = [...box.querySelectorAll('table tr')].map(tr=>{
      const td = [...tr.children].filter(c=>c.tagName === 'TD');
      if(td.length < 7) return null;
      const subject = clean(td[5]);
      const sums = [...subject.matchAll(/(\d[\d\s]*[.,]\d{2})\s*руб/g)].map(m=>Number(m[1].replace(/\s/g,'').replace(',','.'))||0);
      return { debtor:clean(td[0]), ip:clean(td[1]), doc:clean(td[2]), ended:clean(td[3]), subject, dept:clean(td[6]),
               sum:sums.reduce((a,b)=>a+b,0) };
    }).filter(Boolean);
    const emptyText = /ничего не найдено|по вашему запросу ничего/i.test(clean(document.querySelector('.results')) || '');
    const more = !!box.querySelector('.pagination a, .paging a');
    return {n:rows.length, rows:rows.slice(0,30), more, empty:!rows.length && emptyText,
            open:rows.filter(r=>!r.ended).length, debt:rows.filter(r=>!r.ended).reduce((a,r)=>a+r.sum,0)};
  }
})();
