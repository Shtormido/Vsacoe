import { html, useState, useEffect, S, api, call, toast, patchCfg, curVersion, allBats, setSetting, scoreColor, fmtTime, fmtDur, cls, update, confirmDialog } from '../lib.js';
import { Icon } from '../icons.js';
import { Seg, Check, Progress, ScoreBar, InfoBar, Expander, Empty, Select } from '../ui.js';
import { runTests, startZapret } from '../actions.js';
import { useTick } from './home.js';

function ResultTable({ combos, targets, testType, best }) {
  const [sort, setSort] = useState('score');
  const [open, setOpen] = useState(null);
  const rows = [...combos].sort((a, b) => sort === 'score' ? ((b.score ?? -1) - (a.score ?? -1)) || ((a.avgPing ?? 1e9) - (b.avgPing ?? 1e9)) : sort === 'name' ? a.batName.localeCompare(b.batName, undefined, { numeric: true }) : (a.id - b.id));
  return html`<div class="card" style="padding:0;overflow:auto;max-height:560px">
    <table class="table"><thead><tr>
      <th onClick=${() => setSort('order')}>#</th><th onClick=${() => setSort('name')}>Стратегия</th><th>Фейк</th><th onClick=${() => setSort('score')}>Результат ▾</th><th>OK</th><th>Пинг</th><th></th>
    </tr></thead><tbody>
      ${rows.map(r => html`<tr key=${r.id} class=${cls('enter', best && !r.error && r.batKey === best.batKey && r.fake === best.fake && 'best')}>
        <td class="muted tiny">${r.id + 1}</td>
        <td><div class="row" style="gap:6px">${r.running && html`<span class="st-testing"><span class="dot live"></span></span>`}<span class="ellipsis" style="max-width:260px">${r.batName}</span></div>
          ${r.error && html`<div class="tiny" style="color:var(--danger);white-space:pre-wrap">${r.error}</div>`}</td>
        <td class="small dim">${r.fake ? r.fake.replace(/\.bin$/, '') : html`<span class="muted">как в батнике</span>`}</td>
        <td>${r.score !== null && r.score !== undefined ? html`<${ScoreBar} score=${r.score} />` : html`<span class="muted">—</span>`}</td>
        <td class="small mono">${r.ok}/${r.total}</td>
        <td class="small mono">${r.avgPing !== null && r.avgPing !== undefined ? r.avgPing + ' мс' : '—'}</td>
        <td><button class="btn sm ghost icon" onClick=${() => setOpen(open === r.id ? null : r.id)}><${Icon} name=${open === r.id ? 'chevdown' : 'eye'} size=${14} /></button></td>
      </tr>
      ${open === r.id && html`<tr><td colspan="7" style="background:var(--surface-active)">
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px">
          ${(r.targets || []).map(t => html`<div class="row small" style="gap:6px"><span class="ellipsis grow" title=${t.group}>${t.name}</span>
            ${Object.entries(t.checks).map(([k, v]) => html`<span class=${'cell-st ' + v} title=${k}>${v === 'OK' ? '✓' : v}</span>`)}
            ${testType !== 'dpi' && html`<span class="tiny muted mono" style="min-width:42px;text-align:right">${t.ping !== null ? t.ping + 'мс' : '×'}</span>`}</div>`)}
        </div></td></tr>`}`)}
    </tbody></table></div>`;
}

function Matrix({ combos }) {
  const bats = [...new Set(combos.map(c => c.batName))];
  const variants = [...new Set(combos.map(c => c.variant))];
  const get = (b, v) => combos.find(c => c.batName === b && c.variant === v);
  return html`<div class="card" style="padding:0;overflow:auto;max-height:520px"><table class="table"><thead><tr><th>Стратегия \\ фейк</th>${variants.map(v => html`<th class="tiny" style="writing-mode:vertical-rl;transform:rotate(180deg);height:120px">${v}</th>`)}</tr></thead>
    <tbody>${bats.map(b => html`<tr><td class="small ellipsis" style="max-width:240px">${b}</td>${variants.map(v => { const c = get(b, v); return html`<td style="padding:3px">${c ? (c.error ? html`<span class="heat" style="background:var(--surface);color:var(--danger)">×</span>` : c.score !== null && c.score !== undefined ? html`<span class="heat" style=${`background:${scoreColor(c.score)};opacity:${c.running ? .5 : 1}`} title=${`${b} + ${v}: ${c.score}%`}>${Math.round(c.score)}</span>` : html`<span class="heat" style="background:var(--surface)">…</span>`) : ''}</td>`; })}</tr>`)}</tbody></table></div>`;
}

export function TestsPage() {
  useTick(1000);
  const c = S.cfg;
  const ver = curVersion();
  const t = S.tests;
  const [mode, setMode] = useState('quick');
  const [selBats, setSelBats] = useState(null);
  const [slots, setSlots] = useState(['discord', 'unknownUdp']);
  const [fakes, setFakes] = useState(null);
  const [baseline, setBaseline] = useState(true);
  const [targetInfo, setTargetInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [autoApply, setAutoApply] = useState(false);
  const [view, setView] = useState('table');

  useEffect(() => { api.call('tests:targets', c.selectedVersion).then(setTargetInfo).catch(() => {}); api.call('tests:history').then(setHistory).catch(() => {}); }, [c.selectedVersion, t.done]);
  if (!ver) return html`<div class="page"><${Empty} icon="flask" title="Нет версий">Укажите папку запрета на вкладке «Версии».<//></div>`;

  const bats = allBats(ver);
  const batSel = selBats || bats.map(b => b.key);
  const fakeList = [...ver.fakes.filter(f => !/^ACTIVE_/i.test(f)), ...S.scan.custom.fakes];
  const fakeSel = fakes || fakeList.filter(f => /\.bin$/i.test(f) && /stun|discord|quic|tls/i.test(f));
  const groups = targetInfo ? [...new Set(targetInfo.targets.map(x => x.group))] : [];
  const selGroups = c.tests.groups || groups;
  const tcfg = c.tests;
  const setT = (k, v) => patchCfg({ tests: { ...c.tests, [k]: v } });
  const variants = mode === 'full' ? (baseline ? 1 : 0) + fakeSel.length : 1;
  const total = batSel.length * Math.max(1, variants);
  const nTargets = targetInfo ? targetInfo.targets.filter(x => selGroups.includes(x.group)).length : 0;
  const eta = total * ((tcfg.warmup || 1500) / 1000 + Math.ceil(nTargets / (tcfg.parallel || 12)) * (tcfg.timeout || 4) * 0.6 + 1.2);

  const start = () => {
    if (!batSel.length) return toast('Выберите хотя бы одну стратегию', 'warn');
    if (mode === 'full' && !slots.length) return toast('Выберите, какие фейки менять', 'warn');
    runTests({ mode, bats: batSel, fakeSlots: slots, fakes: fakeSel, includeBaseline: baseline, groups: c.tests.groups, autoApply });
    setViewing(null);
  };
  const applyBest = async (r) => {
    const b = r.best; if (!b) return;
    await patchCfg({ selectedVersion: r.versionId, selectedBat: b.batKey });
    if (b.fake) for (const s of b.slots || []) await setSetting('profile', 'fakes.' + s, b.fake);
    toast(`Применено к профилю: ${b.batName}${b.fake ? ' + ' + b.fake : ''}`, 'ok');
  };

  const shown = viewing || (t.done && !t.running ? t.done : null);
  const liveCombos = Object.values(t.results);
  const done = liveCombos.filter(r => !r.running).length;
  const doneCount = t.total ? done : 0;

  return html`<div class="page" style="max-width:1300px">
    <h1 class="page-title">Проверка стратегий</h1>
    <p class="page-sub">Запускает каждую стратегию с текущими настройками и проверяет цели из targets.txt (HTTP / TLS 1.2 / TLS 1.3 + ping) или DPI-набор «16–20 КБ». Сервис на время проверки останавливается.</p>

    <div class="row wrap" style="margin-bottom:12px">
      <${Seg} value=${mode} onChange=${setMode} options=${[{ value: 'quick', label: 'Все стратегии', icon: 'layers' }, { value: 'full', label: 'Полная: стратегии × фейки', icon: 'grid' }]} />
      <span class="spacer"></span>
      ${t.running ? html`<button class="btn lg" onClick=${() => api.call('tests:cancel')}><${Icon} name="stop" fill />Остановить</button>`
        : html`<button class="btn lg primary" disabled=${S.status.state === 'testing'} onClick=${start}><${Icon} name="play" fill />Начать · ${total} ${total === 1 ? 'проверка' : 'проверок'}</button>`}
    </div>

    ${!t.running && html`<div class="grid g2">
      <div class="card">
        <div class="row"><b class="grow">Стратегии <span class="badge">${batSel.length}/${bats.length}</span></b>
          <button class="btn sm ghost" onClick=${() => setSelBats(bats.map(b => b.key))}>Все</button><button class="btn sm ghost" onClick=${() => setSelBats([])}>Ничего</button>
          <button class="btn sm ghost" onClick=${() => setSelBats(bats.filter(b => b.source === 'custom').map(b => b.key))}>Свои</button></div>
        <div class="col" style="max-height:240px;overflow:auto;margin-top:8px;gap:4px">
          ${bats.map(b => html`<${Check} on=${batSel.includes(b.key)} onChange=${v => setSelBats(v ? [...batSel, b.key] : batSel.filter(x => x !== b.key))}
            label=${html`<span class="small grow">${b.name}${b.source === 'custom' ? html` <span class="badge accent">своя</span>` : ''}</span>`} />`)}
        </div>
      </div>
      <div class="card">
        <b>Параметры</b>
        <div class="col" style="gap:10px;margin-top:10px">
          <div class="row"><span class="small grow">Тип проверки</span><${Seg} value=${tcfg.type} onChange=${v => setT('type', v)} options=${[{ value: 'standard', label: 'Стандартная' }, { value: 'dpi', label: 'DPI 16–20 КБ' }]} /></div>
          <div class="row"><span class="small grow">Таймаут запроса, с</span><input class="input mono" style="width:80px" type="number" min="1" max="20" value=${tcfg.timeout} onChange=${e => setT('timeout', +e.target.value)} /></div>
          <div class="row"><span class="small grow">Параллельно</span><input class="input mono" style="width:80px" type="number" min="1" max="64" value=${tcfg.parallel} onChange=${e => setT('parallel', +e.target.value)} /></div>
          <div class="row"><span class="small grow">Прогрев после запуска, мс</span><input class="input mono" style="width:80px" type="number" min="500" step="100" value=${tcfg.warmup} onChange=${e => setT('warmup', +e.target.value)} /></div>
          <${Check} on=${autoApply} onChange=${setAutoApply} label=${html`<span class="small">Запустить лучшую после проверки</span>`} />
          <div class="tiny muted">Примерное время: ~${fmtDur(eta * 1000)}</div>
        </div>
      </div>
    </div>
    ${tcfg.type === 'standard' && targetInfo && html`<div class="card"><div class="row"><b class="grow">Группы целей</b><span class="tiny muted">${nTargets} целей · ${targetInfo.file || 'встроенный набор'}</span>
      <button class="btn sm ghost" onClick=${() => setT('groups', null)}>Все</button></div>
      <div class="row wrap" style="gap:6px;margin-top:8px">${groups.map(g => html`<span class=${cls('chip', selGroups.includes(g) && 'on')} onClick=${() => { const cur = selGroups.includes(g) ? selGroups.filter(x => x !== g) : [...selGroups, g]; setT('groups', cur.length === groups.length ? null : cur); }}>${selGroups.includes(g) ? html`<${Icon} name="check" size=${12} />` : ''}${g}</span>`)}</div></div>`}
    ${mode === 'full' && html`<div class="card">
      <div class="row"><b class="grow">Какие фейки подставлять</b><${Check} on=${baseline} onChange=${setBaseline} label=${html`<span class="small">+ проверка «как в батнике»</span>`} /></div>
      <div class="row wrap" style="gap:6px;margin:8px 0 12px">${S.info.fakeSlots.map(s => html`<span class=${cls('chip', slots.includes(s.key) && 'on')} title=${s.hint} onClick=${() => setSlots(slots.includes(s.key) ? slots.filter(x => x !== s.key) : [...slots, s.key])}>${slots.includes(s.key) ? html`<${Icon} name="check" size=${12} />` : ''}${s.label}${!ver.caps.slots.includes(s.key) ? ' ⚠' : ''}</span>`)}</div>
      <div class="row"><b class="grow small">Файлы фейков <span class="badge">${fakeSel.length}/${fakeList.length}</span></b><button class="btn sm ghost" onClick=${() => setFakes(fakeList)}>Все</button><button class="btn sm ghost" onClick=${() => setFakes([])}>Ничего</button></div>
      <div class="row wrap" style="gap:6px;margin-top:8px">${fakeList.map(f => html`<span class=${cls('chip', fakeSel.includes(f) && 'on')} onClick=${() => setFakes(fakeSel.includes(f) ? fakeSel.filter(x => x !== f) : [...fakeSel, f])}>${f.replace(/\.bin$/, '')}</span>`)}</div>
      <div class="tiny muted" style="margin-top:10px">Порядок как вы описали: все стратегии с фейком №1, затем все с фейком №2 и т.д. Один и тот же фейк подставляется во все выбранные слоты.</div>
      ${tcfg.type === 'standard' && slots.some(s => s === 'discord' || s === 'unknownUdp') && html`<div style="margin-top:10px"><${InfoBar} type="warn">Фейки Discord/Game UDP влияют на голос и игры — HTTP-проверки их почти не замечают. Для них используйте результаты как ориентир.<//></div>`}
    </div>`}`}

    ${t.running && html`<div class="card">
      <div class="row"><span class="st-testing"><span class="dot live"></span></span><b class="grow">${t.optimal ? 'Подбор оптимальной стратегии' : 'Идёт проверка'} · ${doneCount}/${t.total || '…'}</b><span class="small muted mono">${fmtDur(Date.now() - t.startedAt)}</span></div>
      <div style="margin:10px 0"><${Progress} value=${t.total ? (doneCount / t.total) * 100 : 0} indet=${!t.total} /></div>
      ${t.current !== null && t.results[t.current] && html`<div class="small dim">Сейчас: <b>${t.results[t.current].batName}</b>${t.results[t.current].fake ? ' + ' + t.results[t.current].fake : ''} — ${t.results[t.current].targets.length}/${t.targets.length} целей</div>`}
    </div>`}

    ${t.log.length > 0 && html`<${Expander} title="Журнал" open=${false}><div class="log">${t.log.map(l => html`<div class=${l.level}>${new Date(l.at).toLocaleTimeString('ru-RU')} ${l.text}</div>`)}</div><//>`}

    ${(t.running || shown) && html`
      <div class="row" style="margin:18px 0 8px">
        <b class="grow">${shown && !t.running ? (viewing ? 'Результат от ' + fmtTime(shown.at) : 'Результат') : 'Результаты'}</b>
        ${(mode === 'full' || (shown && shown.mode === 'full') || (t.opts && t.opts.mode === 'full')) && html`<${Seg} value=${view} onChange=${setView} options=${[{ value: 'table', label: 'Таблица' }, { value: 'matrix', label: 'Матрица' }]} />`}
        ${shown && shown.best && !t.running && html`
          <button class="btn sm" onClick=${() => applyBest(shown)}><${Icon} name="check" size=${14} />Применить лучшую</button>
          <button class="btn sm primary" onClick=${async () => { await applyBest(shown); await startZapret({ versionId: shown.versionId, batKey: shown.best.batKey }); }}><${Icon} name="play" size=${13} fill />Применить и запустить</button>`}
      </div>
      ${shown && shown.best && !t.running && html`<div style="margin-bottom:8px"><${InfoBar} type="ok" title="Лучшая:">${shown.best.batName}${shown.best.fake ? ' + ' + shown.best.fake : ''} — ${shown.best.score}%<//></div>`}
      ${view === 'matrix' ? html`<${Matrix} combos=${t.running ? liveCombos : shown.combos} />` : html`<${ResultTable} combos=${t.running ? liveCombos : shown.combos} testType=${t.running ? t.testType : shown.type} best=${shown && shown.best} />`}
    `}

    ${history.length > 0 && html`<div class="section-title"><${Icon} name="refresh" />История</div>
      ${history.map(h => html`<div class="list-row">
        <${Icon} name=${h.mode === 'full' ? 'grid' : 'layers'} />
        <div class="grow" style="min-width:0"><div class="small">${fmtTime(h.at)} · ${h.mode === 'full' ? 'полная' : 'стратегии'} · ${h.type === 'dpi' ? 'DPI' : 'стандарт'} · ${h.count} проверок ${h.cancelled ? html`<span class="badge warn">прервана</span>` : ''}</div>
          <div class="tiny muted ellipsis">${h.versionId}${h.best ? ` · лучшая: ${h.best.batName}${h.best.fake ? ' + ' + h.best.fake : ''} (${h.best.score}%)` : ''}</div></div>
        <button class="btn sm" onClick=${async () => setViewing(await call('tests:read', h.id))}>Открыть</button>
        <button class="btn sm ghost icon" onClick=${async () => setHistory(await call('tests:remove', h.id))}><${Icon} name="trash" size=${14} /></button>
      </div>`)}`}
  </div>`;
}
