import { html, useState, S, api, call, toast, patchCfg, cls } from '../lib.js';
import { Icon } from '../icons.js';
import { InfoBar, Setting } from '../ui.js';
import { refreshScan, selectVersion } from '../actions.js';

export function VersionsPage() {
  const c = S.cfg;
  const [upd, setUpd] = useState(null);
  const [busy, setBusy] = useState('');
  const pickRoot = async () => { const p = await api.call('dialog:folder', { title: 'Папка с версиями запрета', defaultPath: c.zapretRoot }); if (p) { await patchCfg({ zapretRoot: p }); await refreshScan(); } };
  const pickCustom = async () => { const p = await api.call('dialog:folder', { title: 'Общая папка (свои батники, списки, targets.txt)', defaultPath: c.customDir }); if (p) { await patchCfg({ customDir: p }); await refreshScan(); } };
  const check = async () => { setBusy('upd'); try { setUpd(await call('updates:check')); } finally { setBusy(''); } };
  const latestLocal = S.scan.versions[0];
  const cmp = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 4; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };

  return html`<div class="page">
    <h1 class="page-title">Версии</h1>
    <p class="page-sub">Программа портативная: ищет версии запрета в выбранной папке, а свои батники, списки и targets.txt держит в общей папке — они работают с любой версией.</p>
    <${Setting} icon="folder" title="Папка с версиями" desc=${c.zapretRoot || 'Не выбрана'}>
      <button class="btn sm" onClick=${() => c.zapretRoot && api.call('shell:open', c.zapretRoot)} disabled=${!c.zapretRoot}><${Icon} name="eye" size=${14} /></button>
      <button class="btn" onClick=${pickRoot}>Изменить</button>
    <//>
    <${Setting} icon="star" title="Общая папка" desc=${html`${c.customDir || 'Не выбрана'}<br/><span class="tiny">bats\\ — свои стратегии · lists\\ — общие списки · bin\\ — свои фейки · targets.txt</span>`}>
      <button class="btn sm" onClick=${() => c.customDir && api.call('shell:open', c.customDir)} disabled=${!c.customDir}><${Icon} name="eye" size=${14} /></button>
      <button class="btn" onClick=${pickCustom}>Изменить</button>
    <//>
    <div class="row" style="margin:20px 0 8px"><b class="grow">Найдено версий: ${S.scan.versions.length}</b>
      <button class="btn" onClick=${refreshScan}><${Icon} name="refresh" size=${15} />Пересканировать</button>
      <button class="btn" disabled=${busy === 'upd'} onClick=${check}><${Icon} name="download" size=${15} />${busy === 'upd' ? 'Проверка…' : 'Проверить обновления'}</button></div>
    ${upd && html`<div style="margin-bottom:10px"><${InfoBar} type=${latestLocal && cmp(upd.latest, latestLocal.version) <= 0 ? 'ok' : 'warn'}
      action=${html`<button class="btn sm" onClick=${() => api.call('shell:url', upd.download)}>Скачать</button>`}>
      Последняя версия на GitHub: <b>${upd.latest}</b>. ${latestLocal && cmp(upd.latest, latestLocal.version) <= 0 ? 'У вас самая свежая.' : 'Скачайте и распакуйте её в папку с версиями — программа подхватит её автоматически, а ваши настройки, профили и списки сохранятся.'}<//></div>`}
    <div class="grid gauto stagger">
      ${S.scan.versions.map((v, i) => {
        const sel = v.id === c.selectedVersion;
        return html`<div key=${v.id} class=${cls('card hoverable')} style=${`--i:${i};${sel ? 'border-color:var(--accent)' : ''}`}>
          <div class="row"><div style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)"><${Icon} name="box" size=${22} /></div>
            <div class="grow" style="min-width:0"><div style="font-weight:600;font-size:calc(var(--fs)*1.15)">v${v.version}${i === 0 ? html` <span class="badge ok">новейшая</span>` : ''}</div><div class="tiny muted ellipsis" title=${v.dir}>${v.id}</div></div></div>
          <div class="row wrap" style="gap:5px;margin:12px 0">
            <span class="badge">${v.bats.length} стратегий</span><span class="badge">${v.fakes.length} фейков</span>
            <span class=${'badge ' + (v.caps.gameFilter ? 'ok' : '')}>Game Filter${v.caps.gameFilter ? (v.caps.gameFilterStyle === 'split' ? ' TCP/UDP' : ' общий') : ': нет'}</span>
            <span class=${'badge ' + (v.caps.ipset ? 'ok' : '')}>IPSet${v.caps.ipset ? ' · ' + (v.ipsetState === 'missing' ? 'нет файла' : v.ipsetState) : ': нет'}</span>
            ${v.caps.activeFakes && html`<span class="badge ok">ACTIVE-фейки</span>`}
            ${v.caps.targets && html`<span class="badge">targets.txt</span>`}
            ${!v.caps.winws && html`<span class="badge bad">нет winws.exe</span>`}
          </div>
          <div class="row wrap" style="gap:4px">
            ${sel ? html`<span class="badge accent">выбрана</span>` : html`<button class="btn sm primary" onClick=${() => selectVersion(v.id)}>Выбрать</button>`}
            <span class="spacer"></span>
            ${v.caps.ipset && html`<button class="btn sm ghost tooltip" data-tip="Скачать свежий ipset-all.txt" disabled=${busy === v.id} onClick=${async () => { setBusy(v.id); try { const r = await call('ipset:update', v.id); toast(`ipset-all обновлён: ${r.lines} строк`, 'ok'); await refreshScan(); } finally { setBusy(''); } }}><${Icon} name="download" size=${14} />IPSet</button>`}
            <button class="btn sm ghost icon tooltip" data-tip="Открыть папку" onClick=${() => api.call('shell:open', v.dir)}><${Icon} name="folder" size=${14} /></button>
          </div>
        </div>`;
      })}
    </div>
  </div>`;
}
