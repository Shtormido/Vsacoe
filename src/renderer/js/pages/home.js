import { html, useState, useEffect, S, curVersion, allBats, activeProfile, patchCfg, fmtDur, STATE_TEXT, GF_LABEL, IPSET_LABEL, api, update, scoreColor } from '../lib.js';
import { Icon } from '../icons.js';
import { Orb, Select, Progress, InfoBar, ScoreBar, Warnings } from '../ui.js';
import { startZapret, stopZapret, selectVersion, selectBat, activateProfile, installService, removeService, serviceControl, runOptimal } from '../actions.js';

export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

export function batOptions(ver) {
  const c = S.cfg;
  return allBats(ver).map(b => {
    const sc = c.scores[`${ver ? ver.id : ''}|${b.key}`];
    return {
      value: b.key, label: b.name, group: b.source === 'custom' ? 'Свои стратегии' : `Версия ${ver ? ver.version : ''}`,
      badge: sc ? html`<span class="badge" style=${`color:${scoreColor(sc.score)}`}>${sc.score}%</span>` : (b.source === 'custom' ? html`<span class="badge accent">своя</span>` : ''),
    };
  });
}

export function StatusDetails({ st, compact }) {
  useTick(1000);
  const r = st.run;
  if (!r || st.state === 'off') return html`<div class="detail-line">winws.exe не запущен</div>`;
  const prof = r.profileId && S.cfg.profiles.find(p => p.id === r.profileId);
  const chips = [];
  if (r.batName) chips.push(['layers', r.batName + (r.custom ? ' (своя)' : '')]);
  if (r.version) chips.push(['box', 'v' + r.version]);
  if (prof) chips.push(['user', prof.name]);
  if (r.gameFilter && r.gameFilter !== 'n/a') chips.push(['game', 'Game: ' + (GF_LABEL[r.gameFilter] || r.gameFilter)]);
  if (r.ipset && r.ipset !== 'n/a') chips.push(['globe', 'IPSet: ' + (IPSET_LABEL[r.ipset] || r.ipset)]);
  if (r.startedAt && !r.service) chips.push(['pulse', fmtDur(Date.now() - r.startedAt)]);
  if (r.service) chips.push(['shield', 'Сервис Windows']);
  if (r.external) chips.push(['warning', 'Запущен не из программы']);
  const fakes = (r.fakes || []);
  return html`<div>
    <div class="status-line">${chips.map(([i, t]) => html`<span class="chip"><${Icon} name=${i} size=${13} />${t}</span>`)}</div>
    ${!compact && html`<div class="detail-line ellipsis" title=${fakes.join(', ')}>фейки: ${fakes.length ? fakes.join(' · ') : '—'}${st.pids && st.pids.length ? `  ·  PID ${st.pids.join(', ')}` : ''}</div>`}
  </div>`;
}

export function HomePage() {
  const c = S.cfg;
  const st = S.status;
  const ver = curVersion();
  const prof = activeProfile();
  const t = S.tests;
  const [build, setBuild] = useState(null);
  useEffect(() => {
    if (!ver || !c.selectedBat) { setBuild(null); return; }
    api.call('cmd:build', { versionId: c.selectedVersion, batKey: c.selectedBat }).then(setBuild).catch(() => setBuild(null));
  }, [c.selectedVersion, c.selectedBat, c.activeProfileId, JSON.stringify(c.base), JSON.stringify(c.profiles), JSON.stringify(c.versionOverrides), JSON.stringify(c.batOverrides)]);

  if (!S.scan.versions.length) return html`<${Welcome} />`;
  const svc = st.service;
  const running = st.state === 'running';
  const isSvc = st.state === 'service';
  const busy = st.state === 'testing' || st.state === 'starting';
  const done = Object.values(t.results).filter(r => !r.running).length;
  const best = (S.tests.done && S.tests.done.combos || []).filter(x => !x.error).sort((a, b) => b.score - a.score).slice(0, 3);

  return html`<div class="page stagger">
    <div class=${'card hero st-' + st.state} style="--i:0">
      <${Orb} state=${st.state} />
      <div class="grow" style="position:relative;z-index:1;min-width:0">
        <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em">Состояние</div>
        <h2>${STATE_TEXT[st.state] || st.state}</h2>
        <${StatusDetails} st=${st} />
        <div class="row wrap" style="margin-top:16px">
          ${isSvc
            ? html`<button class="btn lg" onClick=${() => serviceControl('stop')}><${Icon} name="stop" fill />Остановить сервис</button>
                   <button class="btn lg" onClick=${removeService} title="Как пункт 2 в service.bat: остановить и удалить сервис, завершить winws, выгрузить WinDivert"><${Icon} name="trash" />Удалить сервис (как п.2)</button>`
            : running
              ? html`<button class="btn lg" onClick=${stopZapret}><${Icon} name="stop" fill />Остановить</button>
                     <button class="btn lg" onClick=${() => startZapret()} title="Перезапустить с выбранной стратегией"><${Icon} name="refresh" />Перезапустить</button>`
              : html`<button class="btn lg primary" disabled=${busy || !c.selectedBat} onClick=${() => startZapret()}><${Icon} name="play" fill />Запустить</button>`}
          <button class="btn lg" disabled=${t.running || isSvc} onClick=${runOptimal} title="Проверить все стратегии и запустить лучшую"><${Icon} name="wand" />Подобрать оптимальный</button>
        </div>
      </div>
    </div>

    ${t.running && html`<div class="card" style="--i:1">
      <div class="row"><${Icon} name="flask" /><b class="grow">${t.optimal ? 'Подбор оптимальной стратегии' : 'Идёт проверка'}</b>
        <span class="small muted">${done}/${t.total || '…'}</span>
        <button class="btn sm" onClick=${() => api.call('tests:cancel')}>Отмена</button></div>
      <div style="margin:10px 0 6px"><${Progress} value=${t.total ? (done / t.total) * 100 : 0} indet=${!t.total} /></div>
      <div class="small muted ellipsis">${t.current !== null && t.results[t.current] ? `Сейчас: ${t.results[t.current].batName}${t.results[t.current].fake ? ' + ' + t.results[t.current].fake : ''} · ${t.results[t.current].targets.length}/${t.targets.length} целей` : (t.log[t.log.length - 1] || {}).text || 'Подготовка…'}</div>
    </div>`}

    <div class="section-title" style="--i:2">Быстрый запуск</div>
    <div class="grid g3" style="--i:3">
      <div class="card"><div class="field"><label>Версия запрета</label>
        <${Select} value=${c.selectedVersion} onChange=${selectVersion} options=${S.scan.versions.map(v => ({ value: v.id, label: 'v' + v.version, hint: v.id !== 'v' + v.version ? v.id : '' }))} /></div></div>
      <div class="card"><div class="field"><label>Стратегия</label>
        <${Select} value=${c.selectedBat} search onChange=${selectBat} options=${batOptions(ver)} /></div></div>
      <div class="card"><div class="field"><label>Профиль</label>
        <${Select} value=${c.activeProfileId} onChange=${activateProfile} options=${c.profiles.map(p => ({ value: p.id, label: p.name, hint: p.bat ? '🔗' : '' }))}
          render=${(o) => { const p = c.profiles.find(x => x.id === o.value); return html`<span class="row" style="gap:8px"><span class="swatch" style=${`background:${p.color}`}></span>${o.label}</span>`; }} /></div></div>
    </div>
    ${build && build.warnings && build.warnings.length > 0 && html`<div style="margin-top:8px;--i:4"><${Warnings} list=${build.warnings} /></div>`}
    ${build && build.ok === false && html`<div style="margin-top:8px"><${InfoBar} type="err">${build.error}<//></div>`}

    <div class="grid g2" style="margin-top:var(--gap);--i:5">
      <div class=${'card st-' + (svc.state === 'RUNNING' ? 'service' : 'off')}>
        <div class="row"><span class=${'dot' + (svc.state === 'RUNNING' ? ' live' : '')}></span><b class="grow">Сервис Windows</b>
          <span class=${'badge ' + (svc.state === 'RUNNING' ? 'accent' : svc.installed ? 'warn' : '')}>${svc.installed ? (svc.state === 'RUNNING' ? 'работает' : svc.state.toLowerCase()) : 'не установлен'}</span></div>
        <div class="small dim" style="margin:10px 0 14px;min-height:38px">
          ${svc.installed ? html`<div><${Icon} name="layers" size=${13} /> ${svc.bat || '—'} ${svc.version ? html`<span class="muted">· v${svc.version}</span>` : ''}</div>
            ${svc.fakes && svc.fakes.length ? html`<div class="tiny muted ellipsis">фейки: ${svc.fakes.join(' · ')}</div>` : ''}`
            : html`<span class="muted">Сервис запускает выбранную стратегию автоматически при старте Windows.</span>`}
        </div>
        <div class="row wrap">
          <button class="btn primary sm" disabled=${!c.selectedBat} onClick=${() => installService()}><${Icon} name="shield" size=${14} />${svc.installed ? 'Сменить на выбранную' : 'Установить выбранную'}</button>
          ${svc.installed && (svc.state === 'RUNNING'
            ? html`<button class="btn sm" onClick=${() => serviceControl('stop')}>Остановить</button>`
            : html`<button class="btn sm" onClick=${() => serviceControl('start')}>Запустить</button>`)}
          ${svc.installed && html`<button class="btn sm danger" onClick=${removeService}><${Icon} name="trash" size=${14} />Удалить</button>`}
        </div>
      </div>
      <div class="card">
        <div class="row"><${Icon} name="user" /><b class="grow">Профиль «${prof.name}»</b><button class="btn sm ghost" onClick=${() => update(s => { s.page = 'profiles'; })}>Профили <${Icon} name="chevron" size=${12} /></button></div>
        <div class="row wrap" style="margin-top:10px;gap:6px">
          ${Object.keys(prof.overrides || {}).length ? Object.entries(prof.overrides).map(([k, v]) => html`<span class="chip">${k.replace(/^.*\./, '')}: ${String(v) || 'из батника'}</span>`) : html`<span class="small muted">Профиль не меняет настройки — используется база.</span>`}
        </div>
        ${best.length > 0 && html`<div class="hr"></div><div class="small muted" style="margin-bottom:6px">Последняя проверка — лучшие</div>
          ${best.map(b => html`<div class="row small" style="padding:3px 0"><span class="grow ellipsis">${b.batName}${b.fake ? html` <span class="muted">+ ${b.fake}</span>` : ''}</span><${ScoreBar} score=${b.score} width=${70} /></div>`)}`}
      </div>
    </div>
  </div>`;
}

function Welcome() {
  const pick = async () => {
    const p = await api.call('dialog:folder', { title: 'Папка с версиями запрета' });
    if (!p) return;
    await patchCfg({ zapretRoot: p });
    const snap = await api.call('versions:scan');
    S.scan = snap; S.cfg = await api.call('config:get'); update();
  };
  return html`<div class="page"><div class="welcome">
    <div class="logo-big"><${Icon} name="bolt" size=${42} stroke=${2} /></div>
    <h1 class="page-title">Zapret Ultimate Edition</h1>
    <p class="dim">Выберите папку, в которой лежат версии запрета — например <span class="kbd">C:\\zapret</span> с подпапками <span class="kbd">zapret-discord-youtube-1.10.3</span>, <span class="kbd">…-1.10.4</span>. Можно указать и папку одной версии.</p>
    <button class="btn lg primary" style="margin-top:18px" onClick=${pick}><${Icon} name="folder" />Выбрать папку</button>
    ${S.cfg.zapretRoot && html`<p class="small muted" style="margin-top:18px">В «${S.cfg.zapretRoot}» версии не найдены (нужна папка bin с winws.exe и батники general*.bat).</p>`}
  </div></div>`;
}
