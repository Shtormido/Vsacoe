import { html, useState, useEffect, S, curVersion, allBats, patchCfg, api, call, toast, update, openModal, closeModal, promptDialog, confirmDialog, scoreColor, cls } from '../lib.js';
import { Icon } from '../icons.js';
import { Select, CommandView, InfoBar, ScoreBar, Empty, Warnings } from '../ui.js';
import { startZapret, selectVersion, refreshScan } from '../actions.js';

function Details({ bat }) {
  const c = S.cfg;
  const [b, setB] = useState(null);
  useEffect(() => { api.call('cmd:build', { versionId: c.selectedVersion, batKey: bat.key }).then(setB).catch(e => setB({ ok: false, error: e.message })); }, [bat.key, c.selectedVersion]);
  if (!b) return html`<div class="small muted" style="padding:8px">Разбор…</div>`;
  if (!b.ok) return html`<${InfoBar} type="err">${b.error}<//>`;
  const slots = S.info.fakeSlots;
  return html`<div class="col" style="gap:10px;padding-top:10px">
    <${Warnings} list=${b.warnings} />
    <div class="row wrap" style="gap:6px">
      ${b.gameFilterStyle && html`<span class="badge ok">Game Filter (${b.gameFilterStyle === 'split' ? 'TCP/UDP' : 'общий'})</span>`}
      ${b.usesIpset && html`<span class="badge ok">IPSet</span>`}
      ${Object.entries(b.fakesUsed).map(([k, v]) => html`<span class="badge accent" title=${v.join(', ')}>${(slots.find(s => s.key === k) || {}).label || k}: ${v.map(x => x.replace(/\.bin$/, '')).join(', ')}</span>`)}
    </div>
    <${CommandView} args=${b.args} />
    <div class="row"><span class="tiny muted grow ellipsis">${b.batFile}</span>
      <button class="btn sm" onClick=${() => { navigator.clipboard.writeText(b.commandLine); toast('Команда скопирована', 'ok', 1500); }}><${Icon} name="copy" size=${14} />Копировать команду</button>
      <button class="btn sm" onClick=${() => api.call('shell:show', b.batFile)}><${Icon} name="folder" size=${14} />Показать файл</button></div>
  </div>`;
}

function editBat(bat) {
  api.call('file:read', bat.file).then(({ text }) => {
    let val = text;
    openModal({ wide: true, render: () => html`<div class="modal-body"><h3>${bat.name}.bat</h3>
      <div class="small muted" style="margin-bottom:8px">Своя стратегия запускается с файлами выбранной версии: <span class="kbd">%~dp0</span>, <span class="kbd">%BIN%</span>, <span class="kbd">%LISTS%</span> указывают на папку версии; списки и фейки из общей папки подставляются автоматически.</div>
      <textarea class="textarea" style="width:100%;height:50vh" spellcheck="false" onInput=${e => { val = e.target.value; }}>${text}</textarea></div>
      <div class="modal-foot"><button class="btn" onClick=${closeModal}>Отмена</button>
      <button class="btn primary" onClick=${async () => { await call('file:write', bat.file, val); closeModal(); toast('Сохранено', 'ok', 1500); refreshScan(); }}><${Icon} name="save" size=${14} />Сохранить</button></div>` });
  });
}

export function StrategiesPage() {
  const c = S.cfg;
  const ver = curVersion();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  if (!ver) return html`<div class="page"><${Empty} icon="layers" title="Нет версий">Укажите папку запрета на вкладке «Версии».<//></div>`;
  const bats = allBats(ver).filter(b => !q || b.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [['Стратегии версии ' + ver.version, bats.filter(b => b.source === 'version')], ['Свои стратегии', bats.filter(b => b.source === 'custom')]];

  const copyToCustom = async (b) => {
    const name = await promptDialog('Новая своя стратегия', 'Имя файла (без .bat)', b ? b.name + ' (моя)' : 'my-strategy');
    if (!name) return;
    const key = await call('bat:create', { versionId: ver.id, batKey: b ? b.key : null, name });
    await refreshScan();
    await patchCfg({ selectedBat: key });
    const nb = S.scan.custom.bats.find(x => x.key === key);
    if (nb) editBat(nb);
  };
  const del = async (b) => {
    if (!(await confirmDialog('Удалить стратегию?', b.name + '.bat будет удалён из общей папки.', 'Удалить', true))) return;
    await call('bat:delete', b.key); await refreshScan();
  };

  return html`<div class="page">
    <h1 class="page-title">Стратегии</h1>
    <p class="page-sub">Батники выбранной версии и свои стратегии из общей папки. Разбор показывает итоговые аргументы winws с учётом всех настроек.</p>
    <div class="row wrap" style="margin-bottom:14px">
      <div style="width:200px"><${Select} value=${c.selectedVersion} onChange=${selectVersion} options=${S.scan.versions.map(v => ({ value: v.id, label: 'v' + v.version }))} /></div>
      <div class="grow" style="max-width:340px;position:relative"><input class="input" placeholder="Поиск стратегии…" value=${q} onInput=${e => setQ(e.target.value)} /></div>
      <span class="spacer"></span>
      <button class="btn" onClick=${refreshScan}><${Icon} name="refresh" size=${15} />Обновить</button>
      <button class="btn primary" onClick=${() => copyToCustom(null)}><${Icon} name="plus" size=${15} />Новая стратегия</button>
    </div>
    ${groups.map(([title, list]) => html`
      <div class="section-title">${title} <span class="badge">${list.length}</span></div>
      ${!list.length && html`<div class="small muted" style="padding:6px 2px">${title.startsWith('Свои') ? 'Скопируйте любой батник в свои, чтобы изменить его, или создайте новый. Файлы лежат в «' + (S.scan.custom.dir || '—') + '\\bats».' : 'Нет батников'}</div>`}
      <div class="stagger">${list.map((b, i) => {
        const sc = c.scores[`${ver.id}|${b.key}`];
        const isSel = b.key === c.selectedBat;
        const isRun = S.status.run && S.status.run.batKey === b.key && S.status.state === 'running';
        return html`<div key=${b.key} style=${`--i:${Math.min(i, 14)}`}>
          <div class=${cls('list-row', isSel && 'sel')} onDblClick=${() => startZapret({ batKey: b.key })}>
            <span class=${'st-' + (isRun ? 'running' : 'off')}><span class=${cls('dot', isRun && 'live')} style=${isRun ? '' : 'opacity:.35'}></span></span>
            <div class="grow" style="min-width:0"><div class="ellipsis">${b.name}${b.source === 'custom' && html` <span class="badge accent">своя</span>`}${isSel && html` <span class="badge">выбрана</span>`}</div></div>
            ${sc && html`<div class="tooltip" data-tip=${'проверено ' + new Date(sc.at).toLocaleString('ru-RU')}><${ScoreBar} score=${sc.score} width=${70} /></div>`}
            <button class="btn sm ghost icon tooltip" data-tip="Разбор" onClick=${() => setOpen(open === b.key ? null : b.key)}><${Icon} name=${open === b.key ? 'chevdown' : 'eye'} size=${15} /></button>
            ${b.source === 'custom'
              ? html`<button class="btn sm ghost icon tooltip" data-tip="Редактировать" onClick=${() => editBat(b)}><${Icon} name="edit" size=${15} /></button>
                     <button class="btn sm ghost icon tooltip" data-tip="Удалить" onClick=${() => del(b)}><${Icon} name="trash" size=${15} /></button>`
              : html`<button class="btn sm ghost icon tooltip" data-tip="Копировать в свои" onClick=${() => copyToCustom(b)}><${Icon} name="copy" size=${15} /></button>`}
            <button class="btn sm" onClick=${() => patchCfg({ selectedBat: b.key })} disabled=${isSel}>Выбрать</button>
            <button class="btn sm primary" onClick=${() => { patchCfg({ selectedBat: b.key }); startZapret({ batKey: b.key }); }}><${Icon} name="play" size=${13} fill />Запустить</button>
          </div>
          ${open === b.key && html`<div class="card" style="margin:3px 0 8px;animation:rise var(--dur-slow) var(--ease)"><${Details} bat=${b} /></div>`}
        </div>`;
      })}</div>`)}
  </div>`;
}
