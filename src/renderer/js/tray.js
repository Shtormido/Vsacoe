// Панель трея в стиле флайаутов Windows 11: состояние, запуск/остановка, стратегия, профили, сервис.
import { html, render, useEffect, useRef, useState, S, api, update, useStore, toast, cls, patchCfg, curVersion, STATE_TEXT, GF_LABEL, IPSET_LABEL, fmtDur } from './lib.js';
import { Icon } from './icons.js';
import { Orb, Select, ModalHost, Toasts, Progress } from './ui.js';
import { applyTheme } from './themes.js';
import { startZapret, stopZapret, activateProfile, installService, removeService, serviceControl, runOptimal, selectVersion, selectBat, onTestEvent } from './actions.js';
import { batOptions } from './pages/home.js';

const open = (page) => api.call('win:show', page);

function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, []);
}

function Tray() {
  const s = useStore();
  const rootRef = useRef();
  useTick(1000);
  // высота окна подстраивается под содержимое
  useEffect(() => {
    if (!rootRef.current) return;
    const ro = new ResizeObserver(() => api.call('tray:resize', rootRef.current.offsetHeight + 2).catch(() => {}));
    ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, [s.ready, s.trayKey]);
  if (!s.ready) return null;
  const c = s.cfg;
  const st = s.status;
  const r = st.run || {};
  const svc = st.service;
  const ver = curVersion();
  const running = st.state === 'running';
  const isSvc = st.state === 'service';
  const busy = st.state === 'testing' || st.state === 'starting';
  const t = s.tests;
  const done = Object.values(t.results).filter(x => !x.running).length;
  const prof = c.profiles.find(p => p.id === c.activeProfileId) || c.profiles[0];

  const chips = [];
  if (st.state !== 'off') {
    if (r.batName) chips.push(['layers', r.batName]);
    if (r.version) chips.push(['box', 'v' + r.version]);
    if (r.gameFilter && r.gameFilter !== 'n/a') chips.push(['game', GF_LABEL[r.gameFilter] || r.gameFilter]);
    if (r.ipset && r.ipset !== 'n/a') chips.push(['globe', IPSET_LABEL[r.ipset] || r.ipset]);
    if (r.startedAt && !r.service) chips.push(['pulse', fmtDur(Date.now() - r.startedAt)]);
  }

  return html`<div class=${cls('tray', 'st-' + st.state, s.trayAnim && 'tray-in')} ref=${rootRef} key=${s.trayKey}>
    <div class="tray-head">
      <span class="logo"></span><b class="grow">Zapret UE</b>
      <button class="btn ghost sm icon" title="Открыть программу" onClick=${() => open('home')}><${Icon} name="eye" size=${15} /></button>
      <button class="btn ghost sm icon" title="Параметры" onClick=${() => open('app')}><${Icon} name="gear" size=${15} /></button>
    </div>

    <div class="tray-hero">
      <${Orb} state=${st.state} size=${74} />
      <div class="grow" style="min-width:0">
        <div class="tray-state">${STATE_TEXT[st.state] || st.state}</div>
        <div class="tiny muted ellipsis">${st.state === 'off' ? (ver ? `Готов: ${(s.scan.versions.find(v => v.id === c.selectedVersion) || {}).version ? 'v' + ver.version + ' · ' : ''}${(batOptions(ver).find(o => o.value === c.selectedBat) || {}).label || '—'}` : 'Версия не выбрана') : (r.fakes && r.fakes.length ? 'фейки: ' + r.fakes.join(' · ') : r.external ? 'запущен не из программы' : '')}</div>
        ${chips.length > 0 && html`<div class="tray-chips">${chips.map(([i, x]) => html`<span class="chip"><${Icon} name=${i} size=${12} />${x}</span>`)}</div>`}
      </div>
    </div>

    ${t.running && html`<div class="tray-card">
      <div class="row small"><${Icon} name="flask" size=${15} /><span class="grow ellipsis">${t.optimal ? 'Подбор стратегии' : 'Проверка'} · ${done}/${t.total || '…'}</span>
        <button class="btn sm ghost" onClick=${() => api.call('tests:cancel')}>Отмена</button></div>
      <div style="margin-top:8px"><${Progress} value=${t.total ? done / t.total * 100 : 0} indet=${!t.total} /></div>
    </div>`}

    <div class="tray-actions">
      ${isSvc
        ? html`<button class="tray-tile on" onClick=${() => serviceControl('stop')}><${Icon} name="stop" fill size=${20} /><span>Стоп сервиса</span></button>`
        : running
          ? html`<button class="tray-tile on" onClick=${stopZapret}><${Icon} name="stop" fill size=${20} /><span>Выключить</span></button>`
          : html`<button class="tray-tile" disabled=${busy || !c.selectedBat} onClick=${() => startZapret()}><${Icon} name="play" fill size=${20} /><span>Включить</span></button>`}
      <button class="tray-tile" disabled=${!running} onClick=${() => startZapret()}><${Icon} name="refresh" size=${20} /><span>Перезапуск</span></button>
      <button class="tray-tile" disabled=${t.running || isSvc} onClick=${runOptimal}><${Icon} name="wand" size=${20} /><span>Подобрать</span></button>
    </div>

    <div class="tray-card">
      <div class="tray-label">Стратегия</div>
      <div class="row" style="gap:6px">
        <div style="width:96px;flex:0 0 96px"><${Select} value=${c.selectedVersion} onChange=${selectVersion} options=${s.scan.versions.map(v => ({ value: v.id, label: 'v' + v.version }))} /></div>
        <div class="grow" style="min-width:0"><${Select} value=${c.selectedBat} search onChange=${selectBat} options=${batOptions(ver)} /></div>
      </div>
    </div>

    <div class="tray-card">
      <div class="tray-label">Профиль</div>
      <div class="tray-profiles">${c.profiles.map(p => html`<button class=${cls('tray-prof', p.id === c.activeProfileId && 'on')} style=${`--pc:${p.color}`} onClick=${() => p.id !== c.activeProfileId && activateProfile(p.id)} title=${p.name}>
        <${Icon} name=${p.icon || 'star'} size=${16} /><span class="ellipsis">${p.name}</span></button>`)}</div>
    </div>

    <div class=${'tray-card st-' + (svc.state === 'RUNNING' ? 'service' : 'off')}>
      <div class="row">
        <span class=${cls('dot', svc.state === 'RUNNING' && 'live')}></span>
        <div class="grow" style="min-width:0"><div class="small">Сервис ${svc.installed ? (svc.state === 'RUNNING' ? 'работает' : 'остановлен') : 'не установлен'}</div>
          ${svc.installed && html`<div class="tiny muted ellipsis">${svc.bat || '—'}${svc.version ? ' · v' + svc.version : ''}</div>`}</div>
        ${svc.installed
          ? html`${svc.state === 'RUNNING'
              ? html`<button class="btn sm icon" title="Остановить сервис" onClick=${() => serviceControl('stop')}><${Icon} name="stop" fill size=${13} /></button>`
              : html`<button class="btn sm icon" title="Запустить сервис" onClick=${() => serviceControl('start')}><${Icon} name="play" fill size=${13} /></button>`}
              <button class="btn sm icon" title="Сменить на выбранную стратегию" onClick=${() => installService()}><${Icon} name="refresh" size=${14} /></button>
              <button class="btn sm icon danger" title="Удалить сервис (как п.2 service.bat)" onClick=${removeService}><${Icon} name="trash" size=${14} /></button>`
          : html`<button class="btn sm" disabled=${!c.selectedBat} onClick=${() => installService()}><${Icon} name="shield" size=${13} />Установить</button>`}
      </div>
    </div>

    <div class="tray-foot">
      <button class="btn ghost sm" onClick=${() => open('tests')}><${Icon} name="flask" size=${14} />Проверка</button>
      <button class="btn ghost sm" onClick=${() => open('lists')}><${Icon} name="list" size=${14} />Списки</button>
      <button class="btn ghost sm" onClick=${() => open('servicebat')}><${Icon} name="terminal" size=${14} />service.bat</button>
      <span class="spacer"></span>
      <button class="btn ghost sm icon danger" title="Выход из программы" onClick=${() => api.call('app:quit')}><${Icon} name="x" size=${15} /></button>
    </div>
  </div>
  <${ModalHost} /><${Toasts} />`;
}

async function refreshAll() {
  const [info, cfg, scan, status] = await Promise.all([api.call('app:info'), api.call('config:get'), api.call('versions:scan'), api.call('status:get')]);
  S.info = info; S.cfg = cfg; S.scan = scan; S.status = status;
  applyTheme(undefined, { local: true });
  // панель всегда полупрозрачная (акрил), если Windows это умеет
  if (info.platform === 'win32') document.documentElement.style.setProperty('--bg-alpha', '0.72');
  S.ready = true;
}

async function boot() {
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !S.modal) api.call('tray:hide'); });
  render(html`<${Tray} />`, document.getElementById('app'));
  await refreshAll(); update();
  api.on('status', (st) => update(s => { s.status = st; }));
  api.on('tests:event', onTestEvent);
  api.on('config:changed', async () => { await refreshAll(); update(); });
  api.on('tray:shown', async () => {
    await refreshAll();
    update(s => { s.trayAnim = true; s.trayKey = (s.trayKey || 0) + 1; }); // перезапуск анимации появления
  });
}
boot();
