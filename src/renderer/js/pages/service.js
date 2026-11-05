import { html, useState, useEffect, S, api, call, toast, curVersion, batByKey, patchCfg, fmtTime, update } from '../lib.js';
import { Icon } from '../icons.js';
import { Orb, Select, InfoBar, Expander } from '../ui.js';
import { installService, removeService, serviceControl } from '../actions.js';
import { batOptions, StatusDetails } from './home.js';

export function ServicePage() {
  const c = S.cfg;
  const st = S.status;
  const svc = st.service;
  const ver = curVersion();
  const [diag, setDiag] = useState(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const runDiag = async () => { setRunning(true); try { setDiag(await call('diag:run')); } finally { setRunning(false); } };
  const fix = async (id) => { const r = await call('diag:fix', id); if (r && r.message) toast(r.message, r.ok ? 'ok' : 'error'); runDiag(); };
  useEffect(() => { api.call('log:read').then(setLog).catch(() => {}); }, [st.state]);
  const meta = svc.meta;

  return html`<div class="page">
    <h1 class="page-title">Сервис</h1>
    <p class="page-sub">Установка выбранной стратегии как службы Windows «zapret» — обход запускается вместе с системой, без открытой программы.</p>
    <div class=${'card hero st-' + (svc.state === 'RUNNING' ? 'service' : svc.installed ? 'starting' : 'off')}>
      <${Orb} state=${svc.state === 'RUNNING' ? 'service' : 'off'} size=${104} icon="shield" />
      <div class="grow" style="position:relative;z-index:1;min-width:0">
        <h2 style="font-size:calc(var(--fs)*1.6)">${svc.installed ? (svc.state === 'RUNNING' ? 'Сервис работает' : 'Сервис установлен · ' + svc.state.toLowerCase()) : 'Сервис не установлен'}</h2>
        ${svc.installed && html`<div class="status-line">
          <span class="chip"><${Icon} name="layers" size=${13} />${svc.bat || '—'}</span>
          ${svc.version && html`<span class="chip"><${Icon} name="box" size=${13} />v${svc.version}</span>`}
          ${meta && meta.profileId && html`<span class="chip"><${Icon} name="user" size=${13} />${(c.profiles.find(p => p.id === meta.profileId) || {}).name || '—'}</span>`}
          ${meta && meta.gameFilter && meta.gameFilter !== 'n/a' && html`<span class="chip"><${Icon} name="game" size=${13} />Game: ${meta.gameFilter}</span>`}
          ${meta && meta.installedAt && html`<span class="chip"><${Icon} name="pulse" size=${13} />${fmtTime(meta.installedAt)}</span>`}
        </div>
        ${svc.fakes && svc.fakes.length ? html`<div class="detail-line">фейки: ${svc.fakes.join(' · ')}</div>` : ''}
        ${!meta && html`<div class="detail-line">Установлен не из этой программы (или до её обновления) — детали недоступны.</div>`}`}
        <div class="row wrap" style="margin-top:14px">
          ${svc.installed && (svc.state === 'RUNNING' ? html`<button class="btn" onClick=${() => serviceControl('stop')}><${Icon} name="stop" fill size=${14} />Остановить</button>` : html`<button class="btn" onClick=${() => serviceControl('start')}><${Icon} name="play" fill size=${14} />Запустить</button>`)}
          ${svc.installed && html`<button class="btn danger" onClick=${removeService}><${Icon} name="trash" size=${15} />Удалить сервис</button>`}
          <button class="btn ghost" onClick=${() => update(s => { s.page = 'servicebat'; })}><${Icon} name="terminal" size=${15} />Через service.bat</button>
        </div>
      </div>
    </div>

    <div class="section-title">Установить / сменить стратегию сервиса</div>
    <div class="card"><div class="row wrap">
      <div style="width:170px"><${Select} value=${c.selectedVersion} onChange=${(v) => patchCfg({ selectedVersion: v })} options=${S.scan.versions.map(v => ({ value: v.id, label: 'v' + v.version }))} /></div>
      <div class="grow" style="min-width:220px"><${Select} value=${c.selectedBat} search onChange=${(k) => patchCfg({ selectedBat: k })} options=${batOptions(ver)} /></div>
      <button class="btn primary" disabled=${!c.selectedBat} onClick=${() => installService()}><${Icon} name="shield" size=${15} />${svc.installed ? 'Сменить' : 'Установить'}</button>
    </div>
    <div class="tiny muted" style="margin-top:8px">В сервис записывается итоговая команда с настройками текущего профиля (Game Filter, IPSet, фейки, общие списки). После смены настроек переустановите сервис.</div></div>
    ${st.state === 'running' && html`<div style="margin-top:8px"><${InfoBar} type="warn">Сейчас запущен батник — при установке сервиса он будет остановлен.<//></div>`}

    <div class="section-title"><${Icon} name="shield" />Диагностика</div>
    <div class="card">
      <div class="row"><span class="grow small muted">Проверки из service.bat: BFE, прокси, TCP timestamps, конфликтующие программы (Adguard, Killer, Check Point, SmartByte, VPN), DNS, hosts, WinDivert.</span>
        <button class="btn primary" disabled=${running} onClick=${runDiag}><${Icon} name=${running ? 'refresh' : 'play'} size=${14} />${running ? 'Проверка…' : 'Запустить'}</button></div>
      ${diag && html`<div class="stagger" style="margin-top:12px">${diag.map((d, i) => html`<div class="row" style=${`--i:${i};padding:8px 2px;border-top:1px solid var(--stroke)`}>
        <span style=${`color:${d.status === 'ok' ? 'var(--success)' : d.status === 'warn' ? 'var(--warning)' : d.status === 'fail' ? 'var(--danger)' : 'var(--accent)'}`}><${Icon} name=${d.status === 'ok' ? 'check' : d.status === 'info' ? 'info' : 'warning'} /></span>
        <div class="grow"><div class="small">${d.title}</div><div class="tiny muted">${d.message}</div></div>
        ${d.fix && html`<button class="btn sm" onClick=${() => fix(d.fix)}>${d.fix === 'clearDiscordCache' ? 'Очистить' : d.fix === 'relaunchAdmin' ? 'Перезапустить' : 'Исправить'}</button>`}
      </div>`)}</div>`}
    </div>

    <div class="section-title"><${Icon} name="terminal" />Журнал winws</div>
    <${Expander} title=${html`<span class="small">Вывод последнего запуска (режим «скрытое окно»)</span>`} right=${html`<button class="btn sm ghost icon" onClick=${() => api.call('log:read').then(setLog)}><${Icon} name="refresh" size=${14} /></button>`}>
      <div class="cmd" style="margin-top:8px;max-height:300px">${log || 'Пусто'}</div>
    <//>
  </div>`;
}
