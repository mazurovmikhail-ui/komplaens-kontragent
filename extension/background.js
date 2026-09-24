/* Фоновый скрипт. Картотека арбитражных дел и ЕФРСБ отвечают только запросам, которые
   идут с их собственных страниц в настоящем браузере. Поэтому для каждого источника
   открывается фоновая вкладка сайта, запрос выполняется внутри неё, вкладка закрывается.
   У ФССП поиск закрыт капчей: вкладка открывается на виду, капчу вводит человек,
   результат считывает fssp.js. */

const APP_ORIGINS = ['https://mazurovmikhail-ui.github.io', 'http://localhost:8782'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Ждём, пока вкладка догрузится. Некоторые сайты (ГИР БО) держат страницу в состоянии «загружается»
   долго после того, как их API уже отвечает, поэтому после мягкого предела идём дальше и пробуем
   выполнить запрос; если страница так и не открылась, скрипт в ней не запустится и это станет ошибкой. */
function waitLoaded(tabId, soft = 12000){
  return new Promise(resolve=>{
    const done = ()=>{ clearTimeout(timer); chrome.tabs.onUpdated.removeListener(on); resolve(); };
    const timer = setTimeout(done, soft);
    function on(id, info){ if(id === tabId && info.status === 'complete') done(); }
    chrome.tabs.onUpdated.addListener(on);
    chrome.tabs.get(tabId, t=>{ if(t && t.status === 'complete') done(); });
  });
}

async function inTab(url, func, args){
  const host = new URL(url).host;
  const tab = await chrome.tabs.create({url, active:false});
  try{
    await waitLoaded(tab.id);
    await sleep(2500);                       /* сайту нужно время выставить свои защитные cookie */
    let r;
    try{ [r] = await chrome.scripting.executeScript({target:{tabId:tab.id}, world:'MAIN', func, args}); }
    catch(e){ throw new Error(host + ' не открылся — ' + String(e && e.message || e).replace(/^Error:\s*/,'') + '. Повторите проверку позже'); }
    const out = r && r.result;
    if(!out) throw new Error((r && r.error && r.error.message) || host + ' не вернул данные');
    if(out.error) throw new Error(out.error);
    return out;
  } finally {
    chrome.tabs.remove(tab.id).catch(()=>{});
  }
}

/* ---------- выполняется внутри страницы kad.arbitr.ru ---------- */
async function kadInPage(inn){
 try{
  const pause = ms => new Promise(r => setTimeout(r, ms));
  /* Картотека принимает поисковые запросы только после того, как её собственный поиск
     выставит cookie «wasm». Поэтому сначала нажимается кнопка «Найти» на пустой форме. */
  const hasToken = () => /(^|;\s*)wasm=/.test(document.cookie);
  if(!hasToken()){
    const btn = document.querySelector('#b-form-submit button');
    if(btn) btn.click();
    for(let i = 0; i < 30 && !hasToken(); i++) await pause(500);
    await pause(800);
  }
  const text = el => el ? el.textContent.replace(/\s+/g,' ').trim() : '';
  async function search(type, count, dateFrom){
    const body = {Page:1, Count:count, Courts:[], DateFrom:dateFrom||null, DateTo:null,
                  Sides:[{Name:inn, Type:type, ExactMatch:false}], Judges:[], CaseNumbers:[], WithVKSInstances:false};
    const res = await fetch('/Kad/SearchInstances', {method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json', 'Accept':'*/*', 'X-Requested-With':'XMLHttpRequest', 'x-date-format':'iso'},
      body:JSON.stringify(body)});
    if(res.status !== 200) throw new Error(res.status === 451 || res.status === 429 || res.status === 403
      ? 'картотека временно ограничила запросы с вашего адреса — откройте kad.arbitr.ru вручную, выполните любой поиск и повторите проверку'
      : 'картотека ответила кодом ' + res.status);
    const doc = new DOMParser().parseFromString('<table>' + (await res.text()) + '</table>', 'text/html');
    const total = Number((doc.querySelector('#documentsTotalCount')||{}).value) || 0;
    const names = td => [...td.querySelectorAll('.js-rolloverHtml strong')].map(text).filter(Boolean);
    const rows = [...doc.querySelectorAll('tr')].map(tr=>{
      const a = tr.querySelector('a.num_case'); if(!a) return null;
      const kind = tr.querySelector('td.num .b-container > div');
      const court = tr.querySelectorAll('td.court .b-container > div');
      return {
        num:text(a), url:a.href,
        date:text(tr.querySelector('td.num span')),
        kind:kind ? kind.className : '',
        court:text(court[court.length-1]),
        plaintiffs:names(tr.querySelector('td.plaintiff')||tr),
        respondents:names(tr.querySelector('td.respondent')||tr),
      };
    }).filter(Boolean);
    return {total, rows};
  }
  const def = await search(1, 25);          await pause(1200);
  const pl = await search(0, 1);
  /* дела за 12 месяцев считаются по датам самих дел: выдача отсортирована от новых к старым */
  const yearAgo = Date.now() - 365*864e5;
  const ts = s => { const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? new Date(+m[3], +m[2]-1, +m[1]).getTime() : 0; };
  const fresh = def.rows.filter(x => ts(x.date) >= yearAgo).length;
  return {def:{n:def.total, nYear:fresh, nYearMore:fresh === def.rows.length && def.total > def.rows.length, rows:def.rows.slice(0,15)}, pl:{n:pl.total}};
 }catch(e){ return {error:String(e && e.message || e)}; }
}

/* ---------- выполняется внутри страницы egrul.nalog.ru ---------- */
async function egrulInPage(inn){
 try{
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const r1 = await fetch('/', {method:'POST', credentials:'include', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'vyp3CaptchaToken=&page=&query=' + encodeURIComponent(inn) + '&region=&PreventChromeAutocomplete='});
  if(r1.status !== 200) throw new Error('ЕГРЮЛ ответил кодом ' + r1.status);
  const j1 = await r1.json();
  if(j1.captchaRequired) throw new Error('ЕГРЮЛ запросил код с картинки — откройте egrul.nalog.ru, выполните поиск вручную и повторите проверку');
  let rows = [];
  for(let i = 0; i < 5 && !rows.length; i++){
    await pause(1200);
    const r2 = await fetch('/search-result/' + j1.t + '?r=' + Date.now() + '&_=' + Date.now(), {credentials:'include'});
    if(r2.status !== 200) continue;
    const j2 = await r2.json(); rows = j2.rows || [];
    if(j2.status && j2.status !== 'wait') break;
  }
  const x = rows.find(r => String(r.i) === inn) || rows[0];
  if(!x) return {found:false};
  /* выписка в PDF — для досье (п. 7.3 требует сохранённую копию, а не ссылку) */
  let pdf = '';
  try{
    const v = await (await fetch('/vyp-request/' + x.t + '?r=' + Date.now() + '&_=' + Date.now(), {credentials:'include'})).json();
    if(v && v.t && !v.captchaRequired){
      for(let i = 0; i < 12; i++){
        await pause(1200);
        const s = await (await fetch('/vyp-status/' + v.t + '?r=' + Date.now() + '&_=' + Date.now(), {credentials:'include'})).json();
        if(s.status !== 'ready') continue;
        const d = await fetch('/vyp-download/' + v.t, {credentials:'include'});
        if(d.status === 200){
          const u = new Uint8Array(await d.arrayBuffer()); let bin = '';
          for(let k = 0; k < u.length; k += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
          pdf = btoa(bin);
        }
        break;
      }
    }
  }catch(e){}
  return {found:true, name:x.c || x.n || '', full:x.n || '', ogrn:x.o || '', kpp:x.p || '', reg:x.r || '', region:x.rn || '', head:x.g || '', ended:x.e || '', pdf};
 }catch(e){ return {error:String(e && e.message || e)}; }
}

/* ---------- выполняется внутри страницы pb.nalog.ru («Прозрачный бизнес») ---------- */
async function pbInPage(inn){
 try{
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const post = async (url, body)=>{
    const r = await fetch(url, {method:'POST', credentials:'include', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body});
    if(r.status !== 200) throw new Error('«Прозрачный бизнес» ответил кодом ' + r.status);
    return r.json();
  };
  const need = j => { if(j && j.captchaRequired) throw new Error('«Прозрачный бизнес» запросил код с картинки — откройте pb.nalog.ru, выполните поиск вручную и повторите проверку'); return j; };
  const a = need(await post('/search-proc.json', 'page=1&pageSize=10&pbCaptchaToken=&token=&mode=search-all&queryAll=' + encodeURIComponent(inn)
    + '&queryUl=&okvedUl=&statusUl=&regionUl=&isMassAddrUl=&isMassFounderUl=&isMassDirectorUl=&isDisqualifiedUl=&isTaxArrearsUl=&isNoReportingUl='));
  let b = null;
  for(let i = 0; i < 6 && !(b && b.ul); i++){ await pause(1300); b = await post('/search-proc.json', 'id=' + a.id + '&method=get-response'); }
  const u = b && b.ul && (b.ul.data||[]).find(x => String(x.inn) === inn);
  if(!u) return {found:false};
  const c = need(await post('/company-proc.json', 'token=' + encodeURIComponent(u.token) + '&method=get-request'));
  let d = null;
  for(let i = 0; i < 6 && !(d && d.vyp); i++){ await pause(1500); d = await post('/company-proc.json', 'token=' + encodeURIComponent(c.token) + '&id=' + c.id + '&method=get-response'); }
  if(!d || !d.vyp) throw new Error('«Прозрачный бизнес» не вернул карточку организации');
  const v = d.vyp, num = x => Number(x) || 0, live = list => (Array.isArray(list) ? list : []).filter(x => x && !x.empty);
  /* недоимка приходит помесячными снимками по видам налогов; в расчёт идёт только последний опубликованный месяц */
  const allArrears = live(d.arrear);
  const curY = num(v.arrear_yearcode), curP = num(v.arrear_periodcode);
  const arrears = allArrears.filter(x => num(x.yearcode) === curY && num(x.periodcode) === curP);
  return {
    found:true, name:v['НаимЮЛСокр'] || u.namec || '', status:v.sulst_name_ex || u.sulst_name_ex || '', liquidated:!!d.liquidated,
    invalid:num(v.invalid), debtToBailiff:num(v.pr_zd), noReports:num(v.pr_otch),
    okved:v['КодОКВЭД'] || '', okvedName:v['НаимОКВЭД'] || '', capital:num(v['СумКап']), address:v['АдресРФ'] || v['Адрес'] || '',
    massAddr:(Array.isArray(d.masaddress) ? d.masaddress : []).length,
    regimes:['usn','eshn','envd','spr','ausn'].filter(k => num(v[k]) === 1),
    staff:v.sschr === undefined || v.sschr === null ? null : num(v.sschr), staffYear:num(v.sschr_yearcode),
    taxes:num(v.taxpaysum), taxesYear:num(v.taxpay_yearcode),
    fin:live(d.form1).map(x => ({year:num(x.yearcode), revenue:num(x.revenue), expense:num(x.expense)})).sort((p,q) => q.year - p.year).slice(0,3),
    arrears:arrears.length, arrearsSum:Math.round(arrears.reduce((s,x) => s + num(x.totalsum), 0) * 100) / 100,
    arrearsBy:arrears.map(x => ({name:x.kbkname || x.kbk || '', sum:num(x.totalsum)})).slice(0,10),
    arrearsPeriod:curY ? String(curP).padStart(2,'0') + '.' + curY : '', arrearsEarlier:allArrears.length > arrears.length,
    offenses:live(d.offense).filter(x => Object.keys(x).length > 1).length,
    dataDate:v.pr_otch_zd_date || '',
    heads:(Array.isArray(v.masruk) ? v.masruk : []).map(x => ({name:x.name || '', inn:x.inn || '', cnt:num(x.cnt), position:x.position || ''})).slice(0,5),
    founders:(Array.isArray(v.masuchr) ? v.masuchr : []).map(x => ({name:x.name || '', inn:x.inn || '', cnt:num(x.cnt)})).slice(0,10),
    headInvalid:num(v.masrukinvalid), founderInvalid:num(v.masuchrinvalid),
  };
 }catch(e){ return {error:String(e && e.message || e)}; }
}

/* ---------- выполняется внутри страницы bo.nalog.gov.ru (ГИР БО) ---------- */
async function boInPage(inn){
 try{
  const get = async url => { const r = await fetch(url, {credentials:'include'}); if(r.status !== 200) throw new Error('ГИР БО ответил кодом ' + r.status); return r.json(); };
  const s = await get('/advanced-search/organizations/search?query=' + encodeURIComponent(inn) + '&page=0');
  const o = (s.content||[]).find(x => String(x.inn||'').replace(/<[^>]+>/g,'') === inn);
  if(!o) return {found:false};
  const list = (await get('/nbo/organizations/' + o.id + '/bfo/')) || [];
  list.sort((p,q) => q.period - p.period);
  if(!list.length) return {found:false};
  const det = await get('/nbo/bfo/' + list[0].id + '/details');
  const d = Array.isArray(det) ? det[0] : det;
  const b = (d && d.balance) || {}, f = (d && d.financialResult) || {};
  const rub = x => (x === null || x === undefined) ? null : Number(x) * 1000;      /* отчётность хранится в тысячах рублей */
  return {found:true, year:Number(list[0].period)||0, years:list.map(x => Number(x.period)||0).slice(0,5), filed:(d && d.datePresent || '').slice(0,10),
    assets:rub(b.current1600), assetsPrev:rub(b.previous1600), net:rub(b.current1300), netPrev:rub(b.previous1300),
    receivables:rub(b.current1230), payables:rub(b.current1520), payablesPrev:rub(b.previous1520), loansShort:rub(b.current1510), loansLong:rub(b.current1410),
    revenue:rub(f.current2110), revenuePrev:rub(f.previous2110), profit:rub(f.current2400), profitPrev:rub(f.previous2400)};
 }catch(e){ return {error:String(e && e.message || e)}; }
}

/* ---------- выполняется внутри страницы bankrot.fedresurs.ru ---------- */
async function efrsbInPage(inn){
 try{
  const path = inn.length === 12 ? 'prsnbankrupts' : 'cmpbankrupts';
  const res = await fetch('/backend/' + path + '?searchString=' + encodeURIComponent(inn) + '&isActiveLegalCase=null&limit=15&offset=0',
    {headers:{'Accept':'application/json, text/plain, */*'}, credentials:'include'});
  if(res.status !== 200) throw new Error('ЕФРСБ ответил кодом ' + res.status);
  const j = await res.json();
  const rows = (j.pageData||[]).map(x=>{
    const c = x.lastLegalCase || {}, st = c.status || {};
    return {
      name:x.name || x.fio || '', inn:x.inn || '', status:x.status || '',
      statusDate:(x.statusUpdateDate||'').slice(0,10), active:!!x.isActive,
      caseNum:c.number || '', procedure:st.description || '', procedureDate:(st.date||'').slice(0,10),
      manager:c.arbitrManagerFio || '',
    };
  });
  return {n:Number(j.total)||0, rows};
 }catch(e){ return {error:String(e && e.message || e)}; }
}


/* ---------- Росфинмониторинг: перечни на fedsfm.ru читаются прямо из фонового скрипта ---------- */
const FS_URLS = {terror:'https://www.fedsfm.ru/documents/terrorists-catalog-portal-act', fromu:'https://www.fedsfm.ru/documents/omu-or-terrorists-catalog-all'};
let fsCache = {at:0, lists:null};
const normTxt = s => String(s||'').toUpperCase().replace(/Ё/g,'Е').replace(/[^A-ZА-Я0-9]+/g,'');
function parseFsList(html){
  const items = [], re = /<li>([\s\S]*?)<\/li>/g; let m;
  while((m = re.exec(html))){
    const t = m[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    const mm = t.match(/^\d+\.\s+(.*)$/); if(!mm) continue;
    const body = mm[1];
    const inn = (body.match(/ИНН:\s*(\d{10,12})/)||[])[1] || '';
    const head = body.split(/\s*,\s*/)[0].replace(/\*/g,'').trim();
    items.push({text:body.slice(0,240), inn, key:normTxt(head)});
  }
  return items;
}
async function fsLists(){
  if(fsCache.lists && Date.now() - fsCache.at < 6*3600e3) return fsCache.lists;
  const lists = {};
  for(const k of Object.keys(FS_URLS)){
    const r = await fetch(FS_URLS[k], {cache:'no-store'});
    if(r.status !== 200) throw new Error('fedsfm.ru ответил кодом ' + r.status);
    lists[k] = parseFsList(await r.text());
    if(lists[k].length < 100) throw new Error('перечень Росфинмониторинга не разобран — изменилась разметка страницы');
  }
  fsCache = {at:Date.now(), lists};
  return lists;
}
async function fedsfmCheck(inn, names, persons){
  const lists = await fsLists();
  const nameKeys = names.map(normTxt).filter(k => k.length >= 6);
  const personKeys = persons.map(normTxt).filter(k => k.length >= 8);
  const out = {};
  Object.keys(lists).forEach(k => {
    const hits = [];
    lists[k].forEach(it => {
      if(inn && it.inn === inn) hits.push({who:'ИНН ' + inn, text:it.text});
      else if(nameKeys.some(n => it.key === n)) hits.push({who:'наименование', text:it.text});
      else if(personKeys.some(p => it.key === p)) hits.push({who:'Ф.И.О.', text:it.text});
    });
    out[k] = {n:lists[k].length, hits:hits.slice(0,10)};
  });
  return out;
}

/* ---------- единые реестры СРО: НОСТРОЙ и НОПРИЗ отвечают без вкладки ---------- */
async function sroCheck(inn){
  const regs = [['НОСТРОЙ','https://reestr.nostroy.ru/api/sro/all/member/list'], ['НОПРИЗ','https://reestr.nopriz.ru/api/sro/all/member/list']];
  const rows = [], errors = [];
  for(const [name, url] of regs){
    try{
      const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json', 'Accept':'application/json'},
        body:JSON.stringify({filters:{inn}, page:1, pageCount:10})});
      if(r.status !== 200) throw new Error(name + ' ответил кодом ' + r.status);
      const j = await r.json();
      ((j.data && j.data.data) || []).filter(x => String(x.inn) === inn).forEach(x => rows.push({
        registry:name, member:x.full_description || x.short_description || '', status:(x.member_status && x.member_status.title) || '',
        sro:(x.sro && x.sro.full_description) || '', sroNum:(x.sro && x.sro.registration_number) || '', regNum:x.registration_number || '',
        regDate:(x.registry_registration_date || '').slice(0,10), director:x.director || ''}));
    }catch(e){ errors.push(String(e && e.message || e)); }
  }
  if(errors.length === regs.length) throw new Error(errors.join('; '));
  return {n:rows.length, rows, partial:errors.join('; ')};
}

async function runCheck(inn){
  const out = {at:new Date().toISOString(), inn, egrul:null, pb:null, bo:null, kad:null, bk:null, fs:null, sro:null, errors:{}};
  try{ const e = await inTab('https://egrul.nalog.ru/index.html', egrulInPage, [inn]); if(e.found) out.egrul = e; else out.errors.egrul = 'в ЕГРЮЛ по этому ИНН ничего не найдено'; }
  catch(e){ out.errors.egrul = String(e && e.message || e); }
  if(inn.length === 10){
    try{ const p = await inTab('https://pb.nalog.ru/search.html', pbInPage, [inn]); if(p.found) out.pb = p; else out.errors.pb = 'в «Прозрачном бизнесе» по этому ИНН ничего не найдено'; }
    catch(e){ out.errors.pb = String(e && e.message || e); }
  }
  if(inn.length === 10){
    try{ const b = await inTab('https://bo.nalog.gov.ru/', boInPage, [inn]); if(b.found) out.bo = b; else out.errors.bo = 'в ГИР БО отчётности по этому ИНН нет'; }
    catch(e){ out.errors.bo = String(e && e.message || e); }
  }
  /* Росфинмониторинг и реестры СРО не требуют вкладок — идут параллельно с картотекой и ЕФРСБ */
  const names = [], persons = [];
  if(out.egrul){ names.push(out.egrul.full, out.egrul.name); const h = String(out.egrul.head||'').split(':').pop().trim(); if(h) persons.push(h); }
  if(out.pb){ names.push(out.pb.name); (out.pb.heads||[]).forEach(x => persons.push(x.name)); (out.pb.founders||[]).forEach(x => persons.push(x.name)); }
  const extra = Promise.all([
    fedsfmCheck(inn, names.filter(Boolean), persons.filter(Boolean)).catch(e => ({error:String(e && e.message || e)})),
    sroCheck(inn).catch(e => ({error:String(e && e.message || e)})),
  ]);
  try{ out.kad = await inTab('https://kad.arbitr.ru/', kadInPage, [inn]); }
  catch(e){ out.errors.kad = String(e && e.message || e); }
  try{ out.bk = await inTab('https://bankrot.fedresurs.ru/bankrupts', efrsbInPage, [inn]); }
  catch(e){ out.errors.bk = String(e && e.message || e); }
  const [fs, sro] = await extra;
  if(fs.error) out.errors.fedsfm = fs.error; else out.fs = fs;
  if(sro.error) out.errors.sro = sro.error; else out.sro = sro;
  return out;
}

function fromApp(sender){
  try{ return !!sender.tab && APP_ORIGINS.includes(new URL(sender.tab.url).origin); }catch(e){ return false; }
}

chrome.runtime.onMessage.addListener((msg, sender, reply)=>{
  if(!msg) return;

  /* результат со страницы ФССП — переслать во вкладку приложения, которая его ждёт */
  if(msg.kpk === 'fssp-parsed'){
    chrome.storage.local.get('fsspPending', ({fsspPending})=>{
      if(!fsspPending) return;
      chrome.tabs.sendMessage(fsspPending.appTab, {kpk:'fssp-result', data:Object.assign({inn:fsspPending.inn, at:new Date().toISOString()}, msg.data)}).catch(()=>{});
      chrome.tabs.update(fsspPending.appTab, {active:true}).catch(()=>{});
      chrome.storage.local.remove('fsspPending');
    });
    return;
  }

  if(!fromApp(sender)){ reply({error:'запрос пришёл не со страницы приложения'}); return; }
  const inn = String(msg.inn||'').replace(/\D/g,'');
  if(inn.length !== 10 && inn.length !== 12){ reply({error:'ИНН должен состоять из 10 или 12 цифр'}); return; }

  if(msg.cmd === 'check'){
    runCheck(inn).then(reply, e=>reply({error:String(e && e.message || e)}));
    return true;                             /* ответ придёт асинхронно */
  }
  if(msg.cmd === 'fssp'){
    chrome.storage.local.set({fsspPending:{inn, appTab:sender.tab.id, at:Date.now()}}, ()=>{
      chrome.tabs.create({url:'https://fssp.gov.ru/iss/ip', active:true});
      reply({opened:true});
    });
    return true;
  }
});
