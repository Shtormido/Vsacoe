// Вкладка service.bat: родной service.bat выбранной версии во встроенной консоли.
// Меню и подменю разбираются из вывода батника и превращаются в кнопки — поэтому работают любые версии.
import { html, useState, useEffect, useRef, S, api, call, toast, update, cls, curVersion } from '../lib.js';
import { Icon } from '../icons.js';
import { Select, Empty, InfoBar } from '../ui.js';
import { selectVersion } from '../actions.js';

const PAUSE_RE = /press any key|нажмите любую клавишу|для продолжения/i;
const YN_RE = /\(Y\/N\)/i;

function sb(id) {
  if (!S.sb) S.sb = {};
  if (!S.sb[id]) S.sb[id] = { log: '', running: false, main: null, pending: null, steps: 0, idleAt: 0, actions: 0 };
  return S.sb[id];
}

/** Текущий экран — всё после последнего cls (form feed). */
function screenOf(log, st) {
  // начало экрана: последний cls (form feed), последний ввод или заголовок главного меню — что позже
  let start = Math.max(log.lastIndexOf('\f') + 1, (st && st.lastEcho) || 0);
  const t = log.lastIndexOf('SERVICE MANAGER');
  if (t >= start) start = Math.max(start, log.lastIndexOf('\n', t) + 1);
  const s = log.slice(start);
  return s.length > 12000 ? s.slice(-12000) : s;
}

export function parseScreen(screen) {
  const lines = screen.replace(/\r/g, '').split('\n');
  const items = [];
  let section = null;
  for (const line of lines) {
    const h = line.match(/^\s*::\s*(.+?)\s*$/);
    if (h) { section = h[1]; continue; }
    const m = line.match(/^\s*(\d{1,2})\.\s+(\*\s+)?(.+?)\s*$/);
    if (m) {
      let label = m[3];
      const st = label.match(/\s*\[([^\]]+)\]\s*$/);
      if (st) label = label.slice(0, st.index).trim();
      items.push({ num: m[1], label, status: st ? st[1] : null, selected: !!m[2], section });
    }
  }
  const nonEmpty = lines.filter(l => l.trim());
  const prompt = (nonEmpty[nonEmpty.length - 1] || '').trim();
  const kind = YN_RE.test(prompt) ? 'yn' : PAUSE_RE.test(prompt) ? 'pause' : /[:?]\s*$|\)\s*$/.test(prompt) ? 'input' : 'busy';
  const isMain = /SERVICE MANAGER/i.test(screen) && items.length >= 4;
  const titleLine = lines.find(l => /SERVICE MANAGER/i.test(l));
  const strategy = (lines.find(l => /Strategy:/i.test(l)) || '').trim();
  return { items, prompt, kind, isMain, title: titleLine ? titleLine.trim() : null, strategy };
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { S.scan = await api.call('sb:refresh'); S.cfg = await api.call('config:get'); update(); } catch {}
  }, 700);
}

const idleTimers = {};
/** Обработка вывода: автопереход к главному меню для отложенного пункта. */
function onIdle(id) {
  const st = sb(id);
  const scr = parseScreen(screenOf(st.log, st));
  if (scr.isMain) {
    st.main = scr;
    if (st.actions > 0) scheduleRefresh();
  }
  if (st.pending !== null) {
    if (st.steps++ > 6) { st.pending = null; toast('Не удалось вернуться в главное меню — завершите текущий шаг вручную', 'warn'); }
    else if (scr.isMain && scr.kind === 'input') { const n = st.pending; st.pending = null; send(id, n); }
    else if (scr.kind === 'pause') send(id, '');
    else if (scr.kind === 'input') send(id, '0');
    else if (scr.kind === 'yn') { st.pending = null; toast('service.bat ждёт ответа Y/N', 'info'); }
  }
  update();
}

export function onSbEvent(ev) {
  const st = sb(ev.versionId);
  if (ev.type === 'start') { st.log = ''; st.lastEcho = 0; st.running = true; st.actions = 0; }
  else if (ev.type === 'exit') { st.running = false; st.log += `\n[service.bat завершён${ev.code ? ', код ' + ev.code : ''}]\n`; st.pending = null; }
  else if (ev.type === 'data') {
    const before = st.log.length;
    st.log = (st.log + ev.text).slice(-200000);
    const cut = before + ev.text.length - st.log.length;
    if (st.lastEcho) st.lastEcho = Math.max(0, st.lastEcho - cut);
    if (ev.echo) st.lastEcho = st.log.length;
  }
  clearTimeout(idleTimers[ev.versionId]);
  idleTimers[ev.versionId] = setTimeout(() => onIdle(ev.versionId), 250);
  update();
}

function send(id, text) {
  sb(id).actions++;
  return call('sb:input', id, text).catch(() => {});
}

function goMain(id, num) {
  const st = sb(id);
  const scr = parseScreen(screenOf(st.log, st));
  if (scr.isMain && scr.kind === 'input') return send(id, num);
  st.pending = num; st.steps = 0;
  onIdle(id);
}

function lineClass(l) {
  if (/\[X\]|ERROR|NOT found|NOT running|Failed|не найден|ошибка/i.test(l)) return 'error';
  if (/\[\?\]|Warning|STOP_PENDING/i.test(l)) return 'warn';
  if (/passed|success|RUNNING|Latest version|enabled|Started with admin/i.test(l)) return 'ok';
  return '';
}

export function ServiceBatPage() {
  const ver = curVersion();
  const [input, setInput] = useState('');
  const [full, setFull] = useState(false);
  const boxRef = useRef();
  const inRef = useRef();
  const id = ver && ver.id;
  const st = id ? sb(id) : null;

  useEffect(() => {
    if (!id) return;
    api.call('sb:status', id).then(r => { const s = sb(id); s.running = r.running; if (r.log && !s.log) s.log = r.log; if (r.log) onIdle(id); update(); }).catch(() => {});
  }, [id]);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; });

  if (!ver) return html`<div class="page"><${Empty} icon="terminal" title="Нет версий">Укажите папку запрета на вкладке «Версии».<//></div>`;
  const hasBat = ver.caps.serviceBat;
  const scr = parseScreen(screenOf(st.log, st));
  const main = st.main;
  const sections = [];
  if (main) for (const it of main.items) {
    let sec = sections.find(s => s.name === (it.section || ''));
    if (!sec) { sec = { name: it.section || '', items: [] }; sections.push(sec); }
    sec.items.push(it);
  }
  const shown = full ? st.log.replace(/\f/g, '\n────────────────────────────────────────\n') : screenOf(st.log, st);
  const sub = !scr.isMain && scr.kind === 'input' ? scr.items : [];
  const start = () => call('sb:start', id);
  const submit = () => { if (!st.running) return; send(id, input); setInput(''); inRef.current && inRef.current.focus(); };

  return html`<div class="page" style="max-width:1300px">
    <h1 class="page-title">service.bat</h1>
    <p class="page-sub">Родной service.bat выбранной версии во встроенной консоли. Пункты меню берутся прямо из батника, поэтому работают и старые, и новые версии: сервис, Game Filter, IPSet, фейки, обновления, диагностика, тесты.</p>
    <div class="row wrap" style="margin-bottom:12px">
      <div style="width:180px"><${Select} value=${S.cfg.selectedVersion} onChange=${selectVersion} options=${S.scan.versions.map(v => ({ value: v.id, label: 'v' + v.version }))} /></div>
      <span class=${'badge ' + (st.running ? 'ok' : '')}><span class=${'st-' + (st.running ? 'running' : 'off')}><span class=${cls('dot', st.running && 'live')}></span></span>${st.running ? 'запущен' : 'не запущен'}</span>
      <span class="spacer"></span>
      ${st.running
        ? html`<button class="btn" onClick=${start}><${Icon} name="refresh" size=${15} />Перезапустить</button>
               <button class="btn" onClick=${() => call('sb:stop', id).then(() => { st.running = false; update(); })}><${Icon} name="stop" size=${14} fill />Закрыть</button>`
        : html`<button class="btn primary" disabled=${!hasBat} onClick=${start}><${Icon} name="play" size=${14} fill />Запустить service.bat</button>`}
      <button class="btn ghost icon tooltip" data-tip="Открыть в отдельном окне" disabled=${!hasBat} onClick=${() => call('sb:window', id)}><${Icon} name="terminal" size=${16} /></button>
      <button class="btn ghost icon tooltip" data-tip="Папка версии" onClick=${() => api.call('shell:open', ver.dir)}><${Icon} name="folder" size=${16} /></button>
    </div>
    ${!hasBat && html`<${InfoBar} type="warn">В версии ${ver.version} нет service.bat.<//>`}

    <div class="split" style="grid-template-columns:300px minmax(0,1fr)">
      <div class="card sticky" style="padding:10px">
        ${main ? html`
          <div style="padding:2px 6px 8px"><div style="font-weight:600" class="small">${main.title || 'Меню'}</div>${main.strategy && html`<div class="tiny muted">${main.strategy}</div>`}</div>
          ${sections.map(sec => html`${sec.name && html`<div class="opt-group">${sec.name}</div>`}
            ${sec.items.filter(it => it.num !== '0').map(it => html`<button class="file-item" style="width:100%;border:0;background:transparent;color:inherit;text-align:left" disabled=${!st.running} onClick=${() => goMain(id, it.num)}>
              <span class="badge" style="min-width:28px;justify-content:center">${it.num}</span>
              <div class="grow" style="min-width:0"><div class="small ellipsis">${it.label}</div>${it.status && html`<div class="tiny ellipsis" style=${`color:${/disabled|none|off/i.test(it.status) ? 'var(--text-3)' : 'var(--success)'}`}>${it.status}</div>`}</div>
            </button>`)}`)}
          <div class="hr"></div>
          <div class="tiny muted" style="padding:0 6px">Нажмите пункт — программа сама вернётся в главное меню и выберет его.</div>`
        : html`<div class="small muted" style="padding:10px">${st.running ? 'Ожидание меню…' : 'Запустите service.bat — здесь появятся пункты его меню.'}</div>`}
      </div>

      <div class="col" style="gap:8px;min-width:0">
        <div class="card" style="padding:0;overflow:hidden">
          <div class="row" style="padding:8px 12px;border-bottom:1px solid var(--stroke)">
            <${Icon} name="terminal" size=${15} /><span class="small grow">${full ? 'Весь журнал' : 'Текущий экран'}</span>
            <button class="btn sm ghost" onClick=${() => setFull(!full)}>${full ? 'Текущий экран' : 'Весь журнал'}</button>
            <button class="btn sm ghost icon tooltip" data-tip="Копировать" onClick=${() => { navigator.clipboard.writeText(st.log.replace(/\f/g, '\n')); toast('Скопировано', 'ok', 1200); }}><${Icon} name="copy" size=${14} /></button>
          </div>
          <div ref=${boxRef} class="log" style="max-height:calc(100vh - 380px);min-height:320px;padding:10px 14px;background:color-mix(in srgb, var(--bg) 70%, #000);white-space:pre-wrap">
            ${shown ? shown.replace(/\r/g, '').split('\n').map(l => html`<div class=${lineClass(l)}>${l || ' '}</div>`) : html`<div class="muted">Консоль пуста</div>`}
          </div>
        </div>

        ${st.running && html`<div class="card" style="padding:10px 12px">
          <div class="row wrap" style="gap:6px;margin-bottom:${sub.length || scr.kind !== 'busy' ? '10px' : '0'}">
            ${scr.kind === 'yn' && html`<button class="btn sm primary" onClick=${() => send(id, 'Y')}>Да (Y)</button><button class="btn sm" onClick=${() => send(id, 'N')}>Нет (N)</button>`}
            ${scr.kind === 'pause' && html`<button class="btn sm primary" onClick=${() => send(id, '')}><${Icon} name="check" size=${13} />Продолжить</button>`}
            ${sub.map(it => html`<button class=${cls('chip', it.selected && 'on')} onClick=${() => send(id, it.num)}><b>${it.num}</b> ${it.label}${it.status ? ` [${it.status}]` : ''}</button>`)}
            ${scr.kind === 'input' && !scr.isMain && !sub.length && html`<span class="small muted">service.bat ждёт ввода: ${scr.prompt}</span>`}
            ${scr.kind === 'busy' && html`<span class="small muted">Выполняется…</span>`}
          </div>
          <div class="row">
            <input ref=${inRef} class="input mono" placeholder="Ввод для service.bat (Enter — отправить, пусто — просто Enter)" value=${input}
              onInput=${e => setInput(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') submit(); }} />
            <button class="btn primary" onClick=${submit}><${Icon} name="chevron" size=${14} />Отправить</button>
          </div>
        </div>`}
        <div class="tiny muted">Изменения, сделанные через service.bat (Game Filter, IPSet, активные фейки), сохраняются в файлах версии и действуют для её батников и сервиса, установленного через service.bat. «Тесты» откроются в отдельном окне PowerShell.</div>
      </div>
    </div>
  </div>`;
}
