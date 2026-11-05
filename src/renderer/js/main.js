import { html, render, useEffect, S, api, update, useStore, toast, cls, patchCfg, STATE_TEXT } from './lib.js';
import { Icon } from './icons.js';
import { ModalHost, Toasts } from './ui.js';
import { applyTheme } from './themes.js';
import { onTestEvent, activateProfile } from './actions.js';
import { HomePage } from './pages/home.js';
import { StrategiesPage } from './pages/strategies.js';
import { SettingsPage } from './pages/settings.js';
import { ProfilesPage } from './pages/profiles.js';
import { ListsPage } from './pages/lists.js';
import { TestsPage } from './pages/tests.js';
import { ServicePage } from './pages/service.js';
import { VersionsPage } from './pages/versions.js';
import { AppearancePage } from './pages/appearance.js';
import { AppPage } from './pages/app.js';
import { ServiceBatPage, onSbEvent } from './pages/servicebat.js';

const PAGES = [
  { id: 'home', label: 'Главная', icon: 'home', C: HomePage },
  { id: 'strategies', label: 'Стратегии', icon: 'layers', C: StrategiesPage },
  { id: 'settings', label: 'Настройки обхода', icon: 'sliders', C: SettingsPage },
  { id: 'profiles', label: 'Профили', icon: 'users', C: ProfilesPage },
  { id: 'lists', label: 'Списки', icon: 'list', C: ListsPage },
  { id: 'tests', label: 'Проверка', icon: 'flask', C: TestsPage },
  { id: 'service', label: 'Сервис', icon: 'shield', C: ServicePage },
  { id: 'servicebat', label: 'service.bat', icon: 'terminal', C: ServiceBatPage },
  { id: 'versions', label: 'Версии', icon: 'box', C: VersionsPage },
  { sep: true },
  { id: 'appearance', label: 'Оформление', icon: 'palette', C: AppearancePage },
  { id: 'app', label: 'Параметры', icon: 'gear', C: AppPage },
];

function go(id) {
  update(s => { s.page = id; });
  const el = document.querySelector('.content'); if (el) el.scrollTop = 0;
  if (S.cfg) { S.cfg.ui.lastPage = id; api.call('config:patch', { ui: S.cfg.ui }).catch(() => {}); }
}

function App() {
  const s = useStore();
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) { const p = PAGES.filter(x => !x.sep)[+e.key - 1]; if (p) go(p.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!s.ready) return html`<div class="titlebar"><span class="logo"></span><span class="name">Zapret Ultimate Edition</span></div>`;
  const page = PAGES.find(p => p.id === s.page) || PAGES[0];
  const st = s.status.state;
  const collapsed = s.cfg.ui.sidebarCollapsed;
  const C = page.C;
  return html`
    <div class="titlebar">
      <span class="logo"></span><span class="name">Zapret Ultimate Edition</span>
      <span class=${'tb-status st-' + st}><span class=${cls('dot', (st === 'running' || st === 'service') && 'live')}></span>${STATE_TEXT[st]}${s.status.run && s.status.run.batName ? ' · ' + s.status.run.batName : ''}</span>
    </div>
    <div class="shell">
      <nav class=${cls('sidebar', collapsed && 'collapsed')}>
        <button class="nav-item" onClick=${() => { s.cfg.ui.sidebarCollapsed = !collapsed; update(); api.call('config:patch', { ui: s.cfg.ui }); }} title="Свернуть меню"><${Icon} name="menu" /></button>
        ${PAGES.map(p => p.sep ? html`<div class="nav-sep"></div>` : html`<button class=${cls('nav-item', s.page === p.id && 'active')} onClick=${() => go(p.id)} title=${p.label}>
          <${Icon} name=${p.icon} /><span>${p.label}</span>
          ${p.id === 'home' && html`<span class=${'nav-dot st-' + st}></span>`}
          ${p.id === 'tests' && s.tests.running && html`<span class="nav-dot st-testing"></span>`}
          ${p.id === 'service' && s.status.service.state === 'RUNNING' && html`<span class="nav-dot st-service"></span>`}
          ${p.id === 'servicebat' && s.sb && s.sb[s.cfg.selectedVersion] && s.sb[s.cfg.selectedVersion].running && html`<span class="nav-dot st-running"></span>`}
        </button>`)}
      </nav>
      <main class="content"><${C} key=${page.id} /></main>
    </div>
    <${ModalHost} /><${Toasts} />`;
}

// Файл, брошенный мимо зоны перетаскивания, не должен открываться вместо программы
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

async function boot() {
  render(html`<${App} />`, document.getElementById('app'));
  try {
    const [info, cfg, scan, status] = await Promise.all([api.call('app:info'), api.call('config:get'), api.call('versions:scan'), api.call('status:get')]);
    S.info = info; S.cfg = cfg; S.scan = scan; S.status = status;
    S.page = cfg.zapretRoot && scan.versions.length ? (cfg.ui.lastPage || 'home') : 'home';
    applyTheme();
    S.ready = true;
    update();
    if (!info.admin) toast('Программа запущена без прав администратора — winws и сервис не будут работать.', 'warn', 8000);
  } catch (e) {
    document.getElementById('app').innerHTML = '<pre style="padding:30px;color:#f88">' + e.message + '</pre>';
  }
  api.on('status', (st) => update(s => { s.status = st; }));
  api.on('tests:event', onTestEvent);
  api.on('sb:event', onSbEvent);
  api.on('toast', (t) => toast(t.text, t.type));
  api.on('tray:profile', (id) => activateProfile(id));
  api.on('nav', (page) => go(page));
  api.on('config:changed', async () => {
    const [cfg, scan] = await Promise.all([api.call('config:get'), api.call('versions:scan')]);
    const themeChanged = JSON.stringify(cfg.ui) !== JSON.stringify(S.cfg.ui);
    S.cfg = cfg; S.scan = scan; if (themeChanged) applyTheme(); update();
  });
}
boot();
