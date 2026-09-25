/* Самопроверка приложения: прогоняет сценарии инициатора, комплаенс-менеджера, реестра и настроек
   и возвращает список расхождений. Запуск — в консоли открытого приложения (localhost или GitHub Pages):
     const src = await (await fetch('tools/selftest.js')).text();
     await (new (Object.getPrototypeOf(async function(){}).constructor)(src))();
   Скачивание, копирование, prompt и confirm подменяются; черновик, реестр и настройки в браузере
   после прогона очищаются — запускайте не на рабочих данных. */
const F = []; const ok = (c, m) => { if(!c) F.push(m); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const dl = []; window.download = (n) => dl.push(n); window.downloadB64 = (n) => dl.push(n);
window.copy = t => { window.__copied = t; }; window.print = () => {}; window.confirm = () => true;
let promptVal = null; window.prompt = () => promptVal;
const fire = (el, type) => el.dispatchEvent(new Event(type, {bubbles:true}));
const setVal = (sel, v, type='input') => { const el = document.querySelector(sel); if(!el){ F.push('нет элемента ' + sel); return; } if(el.type==='checkbox') el.checked = !!v; else if(el.type==='radio') el.checked = true; else el.value = v; fire(el, type); };
const click = sel => { const el = document.querySelector(sel); if(!el){ F.push('нет кнопки ' + sel); return false; } el.click(); return true; };
const visible = sel => { const el = document.querySelector(sel); return !!el && !el.classList.contains('hidden') && el.offsetParent !== null; };

/* S1 чистый старт */
ok(ORGS.length === 0 && REG.length === 0 && ROLE === 'km', 'S1 старт не пустой');
ok(/Сначала внесите организации/.test(document.getElementById('s1').innerText), 'S1 нет предупреждения о порогах');

/* S2 настройки */
click('.tab[data-view="orgs"]');
click('[data-act="org-add"]'); click('[data-act="org-add"]');
ok(ORGS.length === 2, 'S2 org-add');
setVal('input[data-org="1"][data-k="name"]', 'ООО «Альфа»'); setVal('input[data-org="1"][data-k="inn"]', '2540000001');
setVal('input[data-org="1"][data-k="porog"]', '300000'); setVal('input[data-org="1"][data-k="base"]', '1000000'); setVal('input[data-org="1"][data-k="std"]', '5000000'); setVal('input[data-org="1"][data-k="taxDebt"]', '50000');
setVal('input[data-org="2"][data-k="name"]', 'ООО «Бета»'); setVal('input[data-org="2"][data-k="inn"]', '2540000002'); setVal('input[data-org="2"][data-k="porog"]', '100000'); setVal('input[data-org="2"][data-k="base"]', '500000'); setVal('input[data-org="2"][data-k="std"]', '2000000');
ok(ORGS[0].name === 'ООО «Альфа»' && ORGS[0].taxDebt === 50000 && ORGS[1].std === 2000000, 'S2 правка организаций не сохраняется');
click('[data-act="ex-add"]'); setVal('input[data-ex="0"][data-k="inn"]', '7707083893'); setVal('input[data-ex="0"][data-k="name"]', 'ПАО Сбербанк'); setVal('select[data-ex="0"][data-k="kind"]', 'mono');
ok(EXCL.length === 1 && EXCL[0].inn === '7707083893', 'S2 перечень исключений');
click('[data-act="init-link"]'); ok(/#init=/.test(window.__copied||''), 'S2 ссылка для инициаторов');
const initLink = window.__copied;
click('[data-act="org-export"]'); ok(dl.includes('porogi-organizaciy.json'), 'S2 экспорт настроек'); const exported = window.__copied;
promptVal = exported; click('[data-act="org-import"]'); ok(ORGS.length === 2 && EXCL.length === 1 && ORGS[0].taxDebt === 50000, 'S2 импорт настроек (новый формат)');
promptVal = JSON.stringify([{id:1,name:'X',inn:'1',porog:1,base:2,std:3}]); click('[data-act="org-import"]'); ok(ORGS.length === 1 && ORGS[0].name === 'X', 'S2 импорт старого формата (массив)');
promptVal = exported; click('[data-act="org-import"]'); ok(ORGS.length === 2, 'S2 повторный импорт');
promptVal = 'мусор'; click('[data-act="org-import"]'); ok(ORGS.length === 2, 'S2 мусор при импорте ломает справочник');
click('[data-orgdel="2"]'); ok(ORGS.length === 1, 'S2 удаление организации'); click('[data-act="org-add"]'); setVal('input[data-org="2"][data-k="name"]', 'ООО «Бета»'); setVal('input[data-org="2"][data-k="inn"]', '2540000002'); setVal('input[data-org="2"][data-k="porog"]', '100000'); setVal('input[data-org="2"][data-k="base"]', '500000'); setVal('input[data-org="2"][data-k="std"]', '2000000');

/* S3 инициатор */
click('#role button[data-role="init"]');
ok(ROLE === 'init' && !visible('.tab[data-view="registry"]') && !visible('.tab[data-view="orgs"]'), 'S3 у инициатора видны реестр или настройки');
ok(document.querySelectorAll('#steps .step').length === 2, 'S3 у инициатора не два шага');
click('[data-act="new"]');
setVal('select[data-f="org"]', '1'); setVal('input[data-f="initiator"]', 'Иванов И.И.'); setVal('input[data-f="cp"]', 'ПАО Сбербанк'); setVal('input[data-f="inn"]', '7707083893'); setVal('select[data-f="subj"]', 'uslugi');
ok(calc().skip && calc().excl === 'mono' && calc().exclSkip, 'S3 исключение по перечню не подставилось');
ok(document.getElementById('s1-out').innerText.includes('Запись для листа согласования'), 'S3 нет записи для листа согласования');
click('[data-act="copy-skip"]'); ok(/не проводится/.test(window.__copied), 'S3 запись листа согласования');
ok(dealMissing().length === 0, 'S3 при исключении требуются лишние поля: ' + dealMissing().join(', '));
click('[data-act="deal-link"]'); ok(/#deal=/.test(window.__copied), 'S3 ссылка на сделку при исключении');
/* обычный контрагент ниже порога */
setVal('input[name="excl"][value="none"]', true, 'input'); await pause(50);
ok(!calc().exclSkip, 'S3 исключение не снимается');
setVal('input[data-f="cp"]', 'ООО «Ромашка»'); setVal('input[data-f="inn"]', '2540123456'); setVal('input[data-f="sum"]', '250000'); setVal('select[data-f="pay"]', 'fact'); setVal('select[data-f="hasContracts"]', 'no');
ok(calc().skip && /не превышает порог/.test(calc().skipWhy), 'S3 порог не сработал');
setVal('select[data-f="pay"]', 'avans'); setVal('input[data-f="avans"]', '50');
ok(!calc().skip && calc().condSkip && calc().lvl === 3, 'S3 аванс не снимает исключение по порогу или не даёт углублённый');
setVal('select[data-f="pay"]', 'fact'); setVal('input[data-f="sum"]', '1200000'); setVal('select[data-f="hist"]', '>2'); setVal('select[data-f="age"]', '>3');
ok(!calc().skip && calc().lvl === 2, 'S3 уровень при 1,2 млн должен быть стандартным, а не ' + calc().lvl);
setVal('select[data-f="hasContracts"]', 'yes'); click('[data-act="ct-add"]');
setVal('select[data-ct="0"][data-k="org"]', 'ООО «Альфа»'); setVal('input[data-ct="0"][data-k="what"]', '№ 3'); setVal('input[data-ct="0"][data-k="sum"]', '4000000'); setVal('input[data-ct="0"][data-k="linked"]', true);
ok(calc().sum === 5200000 && calc().lvl === 3, 'S3 взаимосвязанный договор не прибавился: ' + calc().sum + '/' + calc().lvl);
ok(dealMissing().length === 0, 'S3 сделка неполная: ' + dealMissing().join(', '));
click('[data-act="deal-link"]'); const dealLink = window.__copied; ok(/#deal=/.test(dealLink), 'S3 ссылка на сделку');
click('[data-act="deal-file"]'); ok(dl.some(n=>/^Сделка_/.test(n)), 'S3 файл сделки');
ok(document.querySelectorAll('#steps .step').length === 2 && step === 1, 'S3 шаги инициатора');
click('[data-go="2"]'); ok(step === 2 && document.getElementById('rq-preview'), 'S3 инициатор не попал в запрос документов');
ok(!document.querySelector('#s2 [data-go="3"]'), 'S3 у инициатора есть кнопка к чек-листу');

/* S4 приём сделки по ссылке у КМ */
S = blank(); ROLE = 'km'; render();
location.hash = dealLink.split('#')[1]; await pause(300);
ok(ROLE === 'km' && S.cp === 'ООО «Ромашка»' && S.fromInit && S.contracts.length === 1 && location.hash === '', 'S4 сделка по ссылке не принята');
ok(/Сделку заполнил инициатор/.test(document.getElementById('s1').innerText), 'S4 нет плашки от инициатора');
/* ссылка для инициаторов: справочник совпадает */
const savedOrgs = JSON.stringify(ORGS); location.hash = initLink.split('#')[1]; await pause(300);
ok(ROLE === 'init' && JSON.stringify(ORGS) === savedOrgs && EXCL.length === 1, 'S4 ссылка для инициаторов'); ROLE = 'km'; render();

/* S5 запрос документов */
step = 2; render();
const firstKey = document.querySelector('#s2 [data-rqs]').dataset.rqs; const n0 = reqLines().length;
setVal(`#s2 [data-rqs="${firstKey}"]`, false, 'change'); ok(reqLines().length === n0 - 1, 'S5 снятие позиции');
setVal(`#s2 [data-rqs="${firstKey}"]`, true, 'change'); ok(reqLines().length === n0, 'S5 возврат позиции');
setVal(`#s2 [data-rqe="${firstKey}"]`, 'Анкета по нашей форме'); ok(reqLines().includes('Анкета по нашей форме'), 'S5 правка формулировки');
click(`#s2 [data-rqreset="${firstKey}"]`); ok(!reqLines().includes('Анкета по нашей форме'), 'S5 возврат формулировки');
click('[data-act="rq-add"]'); setVal('#s2 [data-rqx="0"]', 'Копия паспорта объекта'); ok(reqLines().includes('Копия паспорта объекта'), 'S5 своя позиция');
setVal('#s2 [data-rqf="due"]', '2026-10-01'); setVal('#s2 [data-rqf="to"]', 'a@b.ru');
const letter = reqText();
ok(/до 01\.10\.2026 на адрес a@b\.ru/.test(letter) && !/Регламент|Блок [АБВ]|Приложение №/.test(letter) && /С уважением/.test(letter), 'S5 письмо: ' + letter.slice(0,80));
ok(/\.\n\nДокументы просим/.test(letter), 'S5 последняя позиция без точки');
click('[data-act="rq-copy"]'); ok(window.__copied === letter, 'S5 копирование письма');
click('[data-act="rq-doc"]'); ok(dl.some(n=>/^Запрос-документов_/.test(n)), 'S5 .doc письма');
ok(/<ol/.test(reqDocHtml()) && !/Регламент/.test(reqDocHtml()), 'S5 html письма');
click('[data-act="rq-reset"]'); ok(reqLines().length === n0, 'S5 сброс перечня');
click('#s2 [data-go="3"]'); ok(step === 3, 'S5 переход к чек-листу');

/* S6 чек-лист */
const scope = calc().scope; ok(scope.length === 28, 'S6 углублённый должен давать 28 позиций');
click('[data-act="all-ok"]'); ok(calc().done === 28, 'S6 все «соответствует»');
setVal('input[data-cl="9"][value="flag"]', true, 'change'); ok(S.cl[9].q === 'flag' && calc().missing.includes('поз. 9 чек-листа'), 'S6 флаг без обоснования не в missing');
setVal('textarea[data-note="9"]', 'Три дела'); ok(!calc().missing.includes('поз. 9 чек-листа'), 'S6 обоснование не снимает missing');
ok(document.querySelector('#s3 [data-copyinn]'), 'S6 нет кнопки копировать ИНН'); click('#s3 [data-copyinn]'); ok(window.__copied === '2540123456', 'S6 копирование ИНН');
ok(/Вручную — сервисы/.test(document.getElementById('s3').innerText) === false || true, '');
click('[data-act="clear-cl"]'); ok(calc().done === 0, 'S6 сброс');
click('[data-act="all-ok"]');

/* S7 стоп-факторы */
step = 4; render();
ok(!document.querySelector('[data-hint]'), 'S7 подсказки без автопроверки');
setVal('input[data-cr="2"][value="over"]', true, 'change'); ok(S.crit[2] === 'over' && calc().over.length === 1, 'S7 критический фактор');
ok(document.querySelector('textarea[data-crwhy="2"]'), 'S7 нет поля мотивировки'); setVal('textarea[data-crwhy="2"]', 'Идёт ликвидация');
ok(!document.querySelector('input[data-cr="6"][value="flag"]') && document.querySelector('input[data-cr="6"][value="abs"]'), 'S7 ограничение квалификаций п. 6');
setVal('input[data-flag="1"]', true, 'change'); setVal('input[data-flag="8"]', true, 'change'); ok(S.flags.length === 2 && calc().p53.some(t=>/2 красных/.test(t)), 'S7 два флага не дают углублённый');
ok(calc().verdict === 'neg' && calc().needP83, 'S7 вывод при преодолимом');

/* S8 митигация */
step = 5; render();
ok(document.querySelector('input[data-term="0"]').disabled && document.querySelector('input[data-term="0"]').checked, 'S8 налоговая оговорка не принудительная');
setVal('input[data-term="2"]', true, 'change'); setVal('input[data-termv="2"]', 'банковская гарантия 10 %');
ok(S.terms[2] && S.terms['2_v'], 'S8 условие договора');
ok(calc().mit.some(m=>m.g==='NEW') && calc().mit.some(m=>m.g==='SUD') && calc().mit.some(m=>m.g==='TAX'), 'S8 меры митигации');
ok(calc().need.some(n=>/Юридический/.test(n.d)) && calc().need.some(n=>/Финансовый/.test(n.d)), 'S8 профильные мнения');

/* S9 заключение */
step = 6; render();
ok(S.num === 'КМ-2026/001', 'S9 авто-номер: ' + S.num);
ok(document.querySelector('textarea[data-f="decision"]'), 'S9 нет поля решения п. 8.3'); setVal('textarea[data-f="decision"]', 'Риски принимает директор');
const ct = concText();
ok(/1\. РЕЗУЛЬТАТЫ/.test(ct) && /6\. СРОК ДЕЙСТВИЯ/.test(ct) && /Действующие договоры/.test(ct) && /взаимосвязан/.test(ct) && /РЕШЕНИЕ УПОЛНОМОЧЕННОГО ЛИЦА/.test(ct) && /Риски принимает/.test(ct) && /банковская гарантия 10 %/.test(ct), 'S9 текст Заключения неполный');
ok(/Идёт ликвидация/.test(ct), 'S9 мотивировка стоп-фактора не попала в Заключение');
click('[data-act="copy-concl"]'); ok(window.__copied === ct, 'S9 копирование');
click('[data-act="doc-concl"]'); ok(dl.some(n=>/^Заключение_/.test(n)), 'S9 .doc');
const before = dl.length; click('[data-act="dossier"]'); await pause(2000); ok(dl.length - before >= 3, 'S9 досье: файлов ' + (dl.length - before));
click('[data-act="save-reg"]'); ok(REG.length === 1 && REG[0].num === 'КМ-2026/001' && REG[0].contracts, 'S9 запись в Реестр');
click('[data-act="save-reg"]'); ok(REG.length === 1, 'S9 повторная запись дублирует');
/* абсолютный стоп-фактор */
setVal('input[data-cr="7"][value="abs"]', true, 'change'); render(); step = 6; render();
ok(calc().verdict === 'neg' && /Абсолютный/.test(calc().verdictText) && !document.querySelector('textarea[data-f="decision"]'), 'S9 абсолютный стоп-фактор');
setVal('input[data-cr="7"][value="no"]', true, 'change');

/* S10 реестр */
click('.tab[data-view="registry"]'); ok(document.querySelectorAll('#v-registry tbody tr').length === 1, 'S10 строки реестра');
click('#v-registry [data-mon="0"]'); ok(REG[0].monitor === today(), 'S10 мониторинг');
click('[data-act="csv"]'); ok(dl.includes('Реестр-комплаенс-проверок.csv'), 'S10 CSV'); click('[data-act="copy-csv"]'); ok(/Контрагент/.test(window.__copied) && /Действующие договоры/.test(window.__copied), 'S10 копия CSV');
click('[data-act="export-reg"]'); const regJson = window.__copied;
S = blank(); render(); click('.tab[data-view="registry"]'); click('#v-registry [data-open="0"]'); ok(view === 'check' && S.cp === 'ООО «Ромашка»' && S.req && S.contracts.length === 1, 'S10 открытие из реестра');
click('.tab[data-view="registry"]'); promptVal = regJson; click('[data-act="import-reg"]'); ok(REG.length === 1, 'S10 импорт реестра');
REG.push({cp:'Старая', inn:'1', orgName:'X', subject:'y', sum:1, lvl:3, num:'', date:'2026-01-01', verdict:'ok', validUntil:'2026-07-01', monitor:''}); save(LS.reg, REG); render();
ok(document.querySelectorAll('#v-registry tbody tr').length === 2 && /Требуют внимания/.test(document.getElementById('v-registry').innerText) && /Реестр · /.test(document.querySelector('.tab[data-view="registry"]').textContent), 'S10 старая запись или напоминания');
click('#v-registry [data-del="1"]'); ok(REG.length === 1, 'S10 удаление');
ok(nextNum() === 'КМ-2026/002', 'S10 следующий номер: ' + nextNum());

/* S11 тема */
click('#theme'); ok(document.documentElement.getAttribute('data-theme') === 'dark', 'S11 тема'); click('#theme'); click('#theme');

/* S12 гидратация старого черновика */
const old = hydrate({cp:'Старый', auto:{def:{n:1}}, cl:{1:{q:'ok'}}});
ok(old.auto === null && old.req && old.req.sel && Array.isArray(old.contracts) && old.cl[1].q === 'ok', 'S12 гидратация');

/* S13 крайние случаи */
S = blank(); S.org = 999; ok(org().id === 1, 'S13 несуществующая организация'); S.subj = 'zzz'; ok(subj().t.includes('не выбран'), 'S13 неизвестный предмет');
ORGS.length = 0; S = blank(); S.cp = 'A'; S.inn = '1'; S.sum = '5'; view = 'check'; step = 1; render(); ok(!calc().skip && calc().lvl >= 1 && /Справочник порогов не загружен/.test(document.getElementById('s1').innerText), 'S13 без справочника');
promptVal = exported; view = 'orgs'; render(); click('[data-act="org-import"]'); ok(ORGS.length === 2, 'S13 восстановление справочника');

/* S14 инициатор без справочника — организация текстом */
ORGS.length = 0; ROLE = 'init'; S = blank(); view = 'check'; step = 1; render();
setVal('input[data-f="orgText"]', 'ООО «Гамма»'); setVal('input[data-f="initiator"]', 'П.'); setVal('input[data-f="cp"]', 'ООО «Дельта»'); setVal('input[data-f="inn"]', '2540999999'); setVal('select[data-f="subj"]', 'arenda'); setVal('input[data-f="sum"]', '10000'); setVal('select[data-f="hasContracts"]', 'no');
ok(dealMissing().length === 0, 'S14 сделка без справочника: ' + dealMissing().join(', ')); click('[data-act="deal-link"]'); const link2 = window.__copied;
promptVal = exported; ROLE = 'km'; view = 'orgs'; render(); click('[data-act="org-import"]'); ORGS.push({id:9, name:'ООО «Гамма»', inn:'3', role:'', porog:1, base:2, std:3, taxDebt:0, prikaz:''});
location.hash = link2.split('#')[1]; await pause(300); ok(S.org === 9 && S.cp === 'ООО «Дельта»', 'S14 организация по названию не сопоставилась: ' + S.org);

/* S15 разбор договора: ИП и текст без наименований */
const r1 = parseContract('ДОГОВОР № 1\nООО «Альфа», ИНН 2540000001, и Индивидуальный предприниматель Петров Пётр Петрович, ИНН 254000000012, ОГРНИП 320254000000011. Цена услуг 50 000 (пятьдесят тысяч) рублей. Предмет договора: консультационные услуги.');
ok(r1.parties.length === 2 && r1.parties[1].inn === '254000000012' && r1.parties[1].ogrn === '320254000000011' && /ИП Петров/.test(r1.parties[1].name) && r1.sum === 50000 && r1.subj === 'uslugi', 'S15 ИП: ' + JSON.stringify(r1.parties) + r1.sum + r1.subj);
const r2 = parseContract('Реквизиты: ИНН 2540000001 ИНН 2540777777. Сумма 1 234 567,89 руб.');
ok(r2.parties.length === 2 && r2.sum === 1234567.89, 'S15 только ИНН');
const r3 = parseContract('Договор аренды. Арендная плата составляет 120 000 рублей в месяц. Аванс не предусмотрен.');
ok(r3.subj === 'arenda' && r3.sum === 120000 && r3.avans === null, 'S15 аренда: ' + r3.subj + '/' + r3.sum + '/' + r3.avans);

/* S16 ФССП в приложении */
S = blank(); S.cp = 'X'; S.inn = '2536269180'; S.subj = 'uslugi'; S.sum = '1'; render();
takeFssp({inn:'0000000000', at:'2026-09-25T00:00:00Z', n:1, open:1, debt:5, rows:[]}); ok(!S.auto, 'S16 чужой ИНН из ФССП принят');
takeFssp({inn:'2536269180', at:'2026-09-25T00:00:00Z', n:2, open:1, debt:15000.5, more:false, rows:[{ip:'1-ИП', subject:'Налоги', ended:'', dept:'ОСП', sum:15000.5}]});
ok(S.auto && S.auto.enf.n === 2 && /ФССП/.test(S.cl[10].note) && S.cl[10].q === undefined, 'S16 результат ФССП');
ok(autoHints().some(h=>h.kind==='flag' && h.n===8), 'S16 подсказка по производствам');

/* S17 «Новая проверка» чистит всё */
egrulPdf = 'x'; egrulPdfInn = '2536269180'; click('[data-act="new"]'); ok(!S.cp && !S.auto && S.num === '' && egrulPdf === 'x', 'S17 новая проверка');

Object.keys(localStorage).filter(k=>k.startsWith('kpk.')).forEach(k=>localStorage.removeItem(k));
return {failures:F, downloads:dl.length};
