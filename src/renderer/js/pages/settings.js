import { html, useState, useEffect, S, curVersion, batByKey, activeProfile, effective, layerOf, setSetting, SCOPE_LABEL, api, call, toast } from '../lib.js';
import { Icon } from '../icons.js';
import { Seg, Select, Setting, Toggle, InfoBar, CommandView, Expander, Warnings } from '../ui.js';
import { refreshScan } from '../actions.js';

const SRC_LABEL = { default: 'по умолчанию', base: 'из базы', profile: 'из профиля', version: 'из версии', bat: 'из батника' };

function validRange(s) {
  const v = String(s || '').replace(/\s+/g, '');
  if (!v) return false;
  return v.split(',').every(it => { const m = it.match(/^([1-9]\d{0,4})(?:-([1-9]\d{0,4}))?$/); if (!m) return false; const a = +m[1], b = m[2] ? +m[2] : a; return a <= 65535 && b <= 65535 && a <= b; });
}

function TextSetting({ value, onCommit, placeholder, width = '220px', validate, mono }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  const bad = validate && v && !validate(v);
  return html`<input class=${'input' + (bad ? ' bad' : '') + (mono ? ' mono' : '')} style=${`width:${width}`} value=${v} placeholder=${placeholder}
    onInput=${e => setV(e.target.value)} onBlur=${() => { if (!bad && v !== (value || '')) onCommit(v); }} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }} />`;
}

export function SettingsPage() {
  const c = S.cfg;
  const ver = curVersion();
  const bat = batByKey(c.selectedBat);
  const prof = activeProfile();
  const [scope, setScope] = useState(() => { const s = S.settingsScope || 'base'; S.settingsScope = null; return s; });
  const [build, setBuild] = useState(null);
  const eff = effective(scope);
  const layer = layerOf(scope);
  const vals = eff.values;
  const caps = ver ? ver.caps : { slots: [] };
  const dep = JSON.stringify([c.base, c.profiles, c.versionOverrides, c.batOverrides, c.selectedBat, c.selectedVersion, c.activeProfileId]);
  useEffect(() => { if (ver && c.selectedBat) api.call('cmd:build', { versionId: c.selectedVersion, batKey: c.selectedBat }).then(setBuild).catch(() => setBuild(null)); }, [dep]);

  const set = (k, v) => setSetting(scope, k, v);
  const reset = (k) => () => setSetting(scope, k, undefined);
  const src = (k) => (layer[k] === undefined && eff.source[k] !== 'default' ? 'Значение ' + SRC_LABEL[eff.source[k]] : null);
  const ov = (k) => layer[k] !== undefined;
  const scopeName = { base: 'База (для всех версий и батников)', profile: `Профиль «${prof.name}»`, version: ver ? `Версия ${ver.version}` : 'Версия', bat: bat ? `Батник «${bat.name}»` : 'Батник' };
  const countOv = (s) => Object.keys(layerOf(s)).length;

  const fakeFiles = [
    ...((ver && ver.fakes) || []).filter(f => !/^ACTIVE_/i.test(f)).map(f => ({ value: f, label: f.replace(/\.bin$/i, ''), group: 'Фейки версии' })),
    ...S.scan.custom.fakes.map(f => ({ value: f, label: f.replace(/\.bin$/i, ''), group: 'Свои фейки', badge: html`<span class="badge accent">свой</span>` })),
  ];
  const fakeOpts = [{ value: '', label: 'Как в батнике' }, ...fakeFiles];

  return html`<div class="page">
    <h1 class="page-title">Настройки обхода</h1>
    <p class="page-sub">Настройки накладываются слоями: <b>база</b> → <b>профиль</b> → <b>версия</b> → <b>батник</b>. Нижний уровень перекрывает верхний. Точка <span class="ovr-dot" style="display:inline-block"></span> — значение задано на текущем уровне.</p>
    <div class="row wrap" style="margin-bottom:6px">
      <${Seg} value=${scope} onChange=${setScope} options=${['base', 'profile', 'version', 'bat'].map(s => ({ value: s, label: SCOPE_LABEL[s] + (countOv(s) ? ` · ${countOv(s)}` : ''), disabled: (s === 'version' && !ver) || (s === 'bat' && !bat) }))} />
    </div>
    <div class="small muted" style="margin-bottom:14px">Редактируется: <b class="dim">${scopeName[scope]}</b>${countOv(scope) > 0 && html` · <a class="dim" style="cursor:default;text-decoration:underline" onClick=${async () => { for (const k of Object.keys(layer)) await setSetting(scope, k, undefined); toast('Уровень очищен', 'ok', 1500); }}>сбросить всё на этом уровне</a>`}</div>

    <div class="section-title"><${Icon} name="game" />Game Filter</div>
    ${ver && !caps.gameFilter && html`<${InfoBar} type="warn">Батники версии ${ver.version} не используют Game Filter — настройка не повлияет на них.<//>`}
    <${Setting} icon="game" title="Режим" desc="Обход для игровых портов (1024–65535 или свои диапазоны)" overridden=${ov('gameFilter.mode')} onReset=${reset('gameFilter.mode')} source=${src('gameFilter.mode')}
      extra=${ver && caps.gameFilterStyle === 'single' ? html`<span class="badge warn" title="В этой версии один общий диапазон для TCP и UDP">старый формат</span>` : null}>
      <${Seg} value=${vals['gameFilter.mode']} onChange=${v => set('gameFilter.mode', v)} options=${[{ value: 'disabled', label: 'Выкл' }, { value: 'all', label: 'TCP + UDP' }, { value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]} />
    <//>
    <${Setting} icon="sliders" title="TCP-порты" desc="Например 1024-1934,1936-65535" overridden=${ov('gameFilter.tcp')} onReset=${reset('gameFilter.tcp')} source=${src('gameFilter.tcp')} disabled=${vals['gameFilter.mode'] === 'disabled' || vals['gameFilter.mode'] === 'udp'}>
      <${TextSetting} mono value=${vals['gameFilter.tcp']} validate=${validRange} onCommit=${v => set('gameFilter.tcp', v.replace(/\s+/g, ''))} />
    <//>
    <${Setting} icon="sliders" title="UDP-порты" desc=${caps.gameFilterStyle === 'single' ? 'В старых версиях используется общий диапазон (берётся TCP при режиме TCP+UDP)' : 'Диапазоны через запятую'} overridden=${ov('gameFilter.udp')} onReset=${reset('gameFilter.udp')} source=${src('gameFilter.udp')} disabled=${vals['gameFilter.mode'] === 'disabled' || vals['gameFilter.mode'] === 'tcp'}>
      <${TextSetting} mono value=${vals['gameFilter.udp']} validate=${validRange} onCommit=${v => set('gameFilter.udp', v.replace(/\s+/g, ''))} />
    <//>

    <div class="section-title"><${Icon} name="globe" />IPSet фильтр</div>
    <${Setting} icon="globe" title="Режим ipset-all" desc=${html`<b>loaded</b> — по списку IP · <b>none</b> — выключен · <b>any</b> — все IP. Файлы версии не меняются: подставляется служебный список.`} overridden=${ov('ipset.mode')} onReset=${reset('ipset.mode')} source=${src('ipset.mode')} disabled=${ver && !caps.ipset}>
      <${Seg} value=${vals['ipset.mode']} onChange=${v => set('ipset.mode', v)} options=${[{ value: 'loaded', label: 'loaded' }, { value: 'none', label: 'none' }, { value: 'any', label: 'any' }]} />
    <//>
    ${ver && vals['ipset.mode'] === 'loaded' && !ver.ipsetLoadedPath && html`<${InfoBar} type="warn">В версии ${ver.version} ipset-all.txt сейчас пуст/отключён и резервной копии нет — обновите список на вкладке «Версии».<//>`}

    <div class="section-title"><${Icon} name="bolt" />Фейки</div>
    ${ver && ver.caps.activeFakes && html`<div class="small muted" style="margin:-2px 0 8px">В версии ${ver.version} активные фейки: ${Object.entries(ver.active).map(([k, v]) => `${k.replace(/\.bin$/, '')} = ${v ? v.replace(/\.bin$/, '') : 'свой файл'}`).join(' · ')}. Замена здесь не трогает файлы.</div>`}
    ${S.info.fakeSlots.map(slot => {
      const k = 'fakes.' + slot.key;
      const used = !ver || caps.slots.includes(slot.key);
      const curr = build && build.fakesUsed && build.fakesUsed[slot.key];
      return html`<${Setting} icon="bolt" title=${slot.label} desc=${slot.hint + (curr ? ` · сейчас: ${curr.join(', ')}` : '')} overridden=${ov(k)} onReset=${reset(k)} source=${src(k)} disabled=${!used}
        extra=${!used ? html`<span class="badge">не используется в v${ver.version}</span>` : null}>
        <${Select} width="260px" value=${vals[k] || ''} onChange=${v => set(k, v)} options=${fakeOpts} search />
      <//>`;
    })}
    <div class="row" style="margin-top:8px"><button class="btn sm" onClick=${async () => { const r = await call('fake:import'); if (r) { await refreshScan(); toast('Фейки добавлены в общую папку', 'ok'); } }}><${Icon} name="plus" size=${14} />Добавить свои фейки (.bin)</button>
      <span class="small muted">Свои фейки копируются в «${S.scan.custom.dir || '—'}\\bin» и доступны во всех версиях.</span></div>

    <div class="section-title"><${Icon} name="sliders" />Тонкая настройка</div>
    <${Setting} icon="globe" title="Подмена SNI / host" desc="Заменяет sni= и host= в --dpi-desync-fake-tls-mod и hostfakesplit-mod (пусто — как в батнике)" overridden=${ov('desync.sni')} onReset=${reset('desync.sni')} source=${src('desync.sni')} disabled=${ver && !caps.sni}>
      <${TextSetting} mono value=${vals['desync.sni']} placeholder="www.google.com" onCommit=${v => set('desync.sni', v.trim())} />
    <//>
    <${Setting} icon="refresh" title="Повторы фейков (--dpi-desync-repeats)" desc="Одно значение для всех секций (пусто — как в батнике)" overridden=${ov('desync.repeats')} onReset=${reset('desync.repeats')} source=${src('desync.repeats')}>
      <${TextSetting} mono width="100px" value=${vals['desync.repeats']} placeholder="6" validate=${v => /^\d{1,2}$/.test(v)} onCommit=${v => set('desync.repeats', v.trim())} />
    <//>
    <${Setting} icon="list" title="Общие списки" desc="Пользовательские списки (list-general-user и др.) берутся из общей папки и переходят из версии в версию" overridden=${ov('lists.shared')} onReset=${reset('lists.shared')} source=${src('lists.shared')}>
      <${Toggle} on=${vals['lists.shared']} onChange=${v => set('lists.shared', v)} />
    <//>
    <${Setting} icon="pulse" title="TCP timestamps" desc="Включать перед запуском (как service.bat)" overridden=${ov('net.tcpTimestamps')} onReset=${reset('net.tcpTimestamps')} source=${src('net.tcpTimestamps')}>
      <${Toggle} on=${vals['net.tcpTimestamps']} onChange=${v => set('net.tcpTimestamps', v)} />
    <//>
    <${Setting} icon="terminal" title="Окно winws" desc="Скрытое — с журналом в программе; свёрнутое — как оригинальный батник" overridden=${ov('run.window')} onReset=${reset('run.window')} source=${src('run.window')}>
      <${Seg} value=${vals['run.window']} onChange=${v => set('run.window', v)} options=${[{ value: 'hidden', label: 'Скрыто' }, { value: 'minimized', label: 'Свёрнуто' }]} />
    <//>
    <${Setting} icon="code" title="Доп. аргументы в начало" desc="Глобальные опции winws, например --debug=1" overridden=${ov('args.start')} onReset=${reset('args.start')} source=${src('args.start')}>
      <${TextSetting} mono width="300px" value=${vals['args.start']} onCommit=${v => set('args.start', v)} />
    <//>
    <${Setting} icon="code" title="Доп. аргументы в конец" desc="Добавляются к последней секции" overridden=${ov('args.end')} onReset=${reset('args.end')} source=${src('args.end')}>
      <${TextSetting} mono width="300px" value=${vals['args.end']} onCommit=${v => set('args.end', v)} />
    <//>

    <div class="section-title"><${Icon} name="terminal" />Итоговая команда</div>
    <${Expander} title=${html`<span>${bat ? bat.name : '—'} ${ver ? html`<span class="muted">· v${ver.version} · профиль «${prof.name}»</span>` : ''}</span>`} right=${build && build.ok && html`<button class="btn sm" onClick=${() => { navigator.clipboard.writeText(build.commandLine); toast('Скопировано', 'ok', 1200); }}><${Icon} name="copy" size=${14} /></button>`}>
      ${build && build.warnings && build.warnings.length > 0 && html`<div style="margin:8px 0"><${Warnings} list=${build.warnings} /></div>`}
      ${build && build.ok ? html`<div style="margin-top:8px"><${CommandView} args=${build.args} /></div>` : html`<div class="small muted">${build ? build.error : 'Нет данных'}</div>`}
    <//>
  </div>`;
}
