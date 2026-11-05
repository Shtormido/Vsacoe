import { html, useState, useEffect, useMemo, S, api, call, toast, confirmDialog, promptDialog, fmtSize, cls, curVersion } from '../lib.js';
import { Icon } from '../icons.js';
import { Seg, Expander, InfoBar, Empty } from '../ui.js';
import { detectKind, parseGrouped, serializeGrouped, parseTarget, formatTarget } from '../listmodel.js';

const BIG_LINES = 4000;
const SHOW_LIMIT = 300;
const DESCR = {
  'list-general-user.txt': 'Свои домены для обхода',
  'list-exclude-user.txt': 'Домены-исключения',
  'ipset-exclude-user.txt': 'IP-исключения',
  'list-general.txt': 'Основной список доменов',
  'list-google.txt': 'Домены Google/YouTube',
  'list-exclude.txt': 'Исключения (из релиза)',
  'ipset-all.txt': 'Список IP для ipset-фильтра',
  'ipset-exclude.txt': 'Локальные сети и исключения',
  'targets.txt': 'Цели для проверки стратегий',
};

function ItemChip({ value, hit, onChange, onRemove, onDragStart }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  if (edit) return html`<span class="item-chip"><input value=${v} size=${Math.max(6, v.length)} ref=${el => el && setTimeout(() => el.focus(), 0)} onInput=${e => setV(e.target.value)}
    onBlur=${(e) => { const nv = e.target.value.trim(); setEdit(false); if (nv && nv !== value) onChange(nv); }} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setV(value); setEdit(false); } }} /></span>`;
  return html`<span class=${cls('item-chip', hit && 'hit')} draggable="true" onDragStart=${onDragStart} onClick=${(e) => { if (e.target.closest('button')) return; setV(value); setEdit(true); }} title="Нажмите, чтобы изменить; перетащите в другую группу">${value}
    <button class="btn ghost icon" title="Удалить" onClick=${(e) => { e.stopPropagation(); onRemove(); }}><${Icon} name="x" size=${12} /></button></span>`;
}

function AddBox({ onAdd, placeholder }) {
  const [v, setV] = useState('');
  const add = () => { const items = v.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean); if (items.length) onAdd(items); setV(''); };
  return html`<div class="row" style="margin-top:10px"><input class="input mono" placeholder=${placeholder} value=${v} onInput=${e => setV(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} onPaste=${e => { setTimeout(() => {}, 0); }} />
    <button class="btn sm" onClick=${add}><${Icon} name="plus" size=${14} />Добавить</button></div>`;
}

function TargetRows({ group, gi, mutate, q }) {
  const [nk, setNk] = useState(''); const [nv, setNv] = useState('');
  const rows = group.items.map((it, ii) => ({ it, ii, t: parseTarget(it) }));
  return html`<div style="padding-top:8px">
    ${rows.filter(r => !q || r.it.toLowerCase().includes(q)).map(({ it, ii, t }) => t ? html`<div class="target-row">
        <input class="input mono" value=${t.key} onChange=${e => mutate(m => { m.groups[gi].items[ii] = formatTarget(e.target.value.replace(/\W/g, ''), t.value); })} />
        <input class="input mono" value=${t.value} onChange=${e => mutate(m => { m.groups[gi].items[ii] = formatTarget(t.key, e.target.value); })} />
        <button class="btn sm ghost icon" onClick=${() => mutate(m => { m.groups[gi].items.splice(ii, 1); })}><${Icon} name="trash" size=${14} /></button></div>`
      : html`<div class="target-row"><span class="mono small muted" style="grid-column:1/3">${it}</span><button class="btn sm ghost icon" onClick=${() => mutate(m => { m.groups[gi].items.splice(ii, 1); })}><${Icon} name="trash" size=${14} /></button></div>`)}
    <div class="target-row" style="margin-top:6px"><input class="input mono" placeholder="KeyName" value=${nk} onInput=${e => setNk(e.target.value.replace(/\W/g, ''))} />
      <input class="input mono" placeholder="https://host или PING:1.1.1.1" value=${nv} onInput=${e => setNv(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && nk && nv) { mutate(m => { m.groups[gi].items.push(formatTarget(nk, nv)); }); setNk(''); setNv(''); } }} />
      <button class="btn sm" disabled=${!nk || !nv} onClick=${() => { mutate(m => { m.groups[gi].items.push(formatTarget(nk, nv)); }); setNk(''); setNv(''); }}><${Icon} name="plus" size=${14} /></button></div>
  </div>`;
}

export function ListsPage() {
  const ver = curVersion();
  const [index, setIndex] = useState(null);
  const [sel, setSel] = useState(S.listsSel || null);
  const [orig, setOrig] = useState('');
  const [model, setModel] = useState(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('groups');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const [showAll, setShowAll] = useState({});
  const [dragOver, setDragOver] = useState(null);

  const loadIndex = () => api.call('lists:index', S.cfg.selectedVersion).then(setIndex).catch(e => toast(e.message, 'error'));
  useEffect(() => { loadIndex(); }, [S.cfg.selectedVersion, S.cfg.customDir]);
  const file = index && index.files.find(f => f.path === sel);
  const kind = file ? detectKind(file.name) : 'list';
  const current = mode === 'groups' && model ? serializeGrouped(model) : text;
  // Изменения считаем относительно того же файла, разобранного и записанного обратно:
  // иначе файл без пустых строк между группами выглядел бы изменённым сразу после открытия.
  const norm = (t) => String(t).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  const baseline = useMemo(() => (file ? serializeGrouped(parseGrouped(orig, kind)) : ''), [orig, kind, file && file.path]);
  const dirty = model !== null && (mode === 'groups' ? norm(current) !== norm(baseline) : norm(text) !== norm(orig));

  const load = async (f) => {
    if (dirty && !(await confirmDialog('Несохранённые изменения', 'Перейти к другому файлу без сохранения?', 'Перейти'))) return;
    const r = await call('file:read', f.path);
    const k = detectKind(f.name);
    const m = parseGrouped(r.text, k);
    const lines = m.groups.reduce((a, g) => a + g.items.length, 0);
    S.listsSel = f.path;
    setSel(f.path); setOrig(r.text); setModel(m); setText(r.text); setQ(''); setShowAll({});
    setMode(lines > BIG_LINES ? 'text' : 'groups');
    const o = {}; m.groups.forEach((g, i) => { o[i] = m.groups.length <= 3; }); setOpen(o);
  };
  useEffect(() => { if (index && !model) { const f = index.files.find(x => x.path === sel) || index.files.find(x => x.name === 'list-general-user.txt') || index.files[0]; if (f) load(f); } }, [index]);

  const mutate = (fn) => setModel(m => { const n = { ...m, groups: m.groups.map(g => ({ ...g, items: [...g.items] })) }; fn(n); return n; });
  const switchMode = (m) => {
    if (m === mode) return;
    if (m === 'text') setText(serializeGrouped(model));
    else { setModel(parseGrouped(text, kind)); }
    setMode(m);
  };
  const save = async () => {
    const out = mode === 'groups' ? serializeGrouped(model) : text;
    await call('file:write', sel, out);
    setOrig(out); if (mode === 'text') setModel(parseGrouped(out, kind));
    toast('Сохранено: ' + file.name, 'ok', 1800); loadIndex();
  };
  const revert = () => { setModel(parseGrouped(orig, kind)); setText(orig); };
  const newList = async () => {
    const n = await promptDialog('Новый общий список', 'Имя файла', 'my-list.txt');
    if (!n) return;
    const p = await call('list:create', n); await loadIndex();
    toast('Создан. Подключите его в своём батнике: --hostlist="%LISTS%' + p.replace(/^.*[\\/]/, '') + '"', 'ok', 7000);
  };
  const addGroup = async () => {
    const n = await promptDialog('Новая группа', 'Название группы', 'Новая группа');
    if (!n) return;
    mutate(m => { m.groups.push({ name: n, prefix: kind === 'targets' ? '###' : '#', items: [] }); });
    setOpen(o => ({ ...o, [model.groups.length]: true }));
  };

  const ql = q.trim().toLowerCase();
  const stats = useMemo(() => model ? { groups: model.groups.length, items: model.groups.reduce((a, g) => a + g.items.length, 0) } : null, [model]);

  const fileGroups = index ? [['shared', 'Общие (переходят между версиями)'], ['version', 'Версия ' + (ver ? ver.version : '')]] : [];
  return html`<div class="page" style="max-width:1300px">
    <h1 class="page-title">Списки</h1>
    <p class="page-sub">Комментарии-заголовки (<span class="kbd"># Название</span>) показываются как сворачиваемые группы. Формат файлов не меняется — программа пишет их так же, как они были.</p>
    <div class="split">
      <div class="card sticky" style="padding:8px">
        ${fileGroups.map(([sc, title]) => html`<div class="opt-group">${title}</div>
          ${index.files.filter(f => f.scope === sc).map(f => html`<div class=${cls('file-item', f.path === sel && 'sel')} onClick=${() => load(f)} title=${f.path}>
            <${Icon} name=${f.name === 'targets.txt' ? 'flask' : /^ipset/.test(f.name) ? 'globe' : 'list'} size=${16} />
            <div class="grow" style="min-width:0"><div class="ellipsis small">${f.name}</div><div class="tiny muted ellipsis">${DESCR[f.name] || fmtSize(f.size)}</div></div>
            ${/-user\.txt$/.test(f.name) && html`<span class="badge accent tiny">user</span>`}
          </div>`)}
          ${sc === 'shared' && !index.files.some(f => f.scope === 'shared') && html`<div class="tiny muted" style="padding:6px 10px">Общая папка не задана</div>`}`)}
        <div class="hr"></div>
        <button class="btn sm" style="width:100%" onClick=${newList} disabled=${!S.cfg.customDir}><${Icon} name="plus" size=${14} />Новый общий список</button>
      </div>

      <div style="min-width:0">
        ${!file ? html`<${Empty} icon="list" title="Выберите файл">Слева — общие списки и списки выбранной версии.<//>` : html`
        <div class="card" style="padding:12px 14px;margin-bottom:10px">
          <div class="row wrap">
            <div class="grow" style="min-width:160px"><div style="font-weight:600" class="row">${file.name}${dirty && html`<span class="ovr-dot" title="Есть несохранённые изменения"></span>`}</div>
              <div class="tiny muted">${file.scope === 'shared' ? 'Общий' : 'Версия ' + (ver && ver.version)} · ${stats && `${stats.groups} групп · ${stats.items} строк`}</div></div>
            <${Seg} value=${mode} onChange=${switchMode} options=${[{ value: 'groups', label: 'Группы', icon: 'grid' }, { value: 'text', label: 'Текст', icon: 'text' }]} />
            <button class="btn sm ghost icon tooltip" data-tip="Показать в папке" onClick=${() => api.call('shell:show', file.path)}><${Icon} name="folder" size=${15} /></button>
            <button class="btn sm" disabled=${!dirty} onClick=${revert}><${Icon} name="undo" size=${14} />Отменить</button>
            <button class="btn sm primary" disabled=${!dirty} onClick=${save}><${Icon} name="save" size=${14} />Сохранить</button>
          </div>
          ${file.scope === 'version' && /-user\.txt$/.test(file.name) && S.cfg.customDir && html`<div style="margin-top:10px"><${InfoBar}>При включённых «общих списках» используется одноимённый файл из общей папки, а не этот.<//></div>`}
        </div>
        ${mode === 'text' ? html`
          ${stats && stats.items > BIG_LINES && html`<div style="margin-bottom:8px"><${InfoBar}>Большой файл — открыт в текстовом режиме.<//></div>`}
          <textarea class="textarea" style="width:100%;height:calc(100vh - 300px)" spellcheck="false" value=${text} onInput=${e => setText(e.target.value)}></textarea>`
        : html`
          <div class="row" style="margin-bottom:10px">
            <input class="input" style="max-width:320px" placeholder="Фильтр по строкам и группам…" value=${q} onInput=${e => setQ(e.target.value)} />
            <button class="btn sm ghost" onClick=${() => { const o = {}; model.groups.forEach((_, i) => { o[i] = true; }); setOpen(o); }}>Развернуть все</button>
            <button class="btn sm ghost" onClick=${() => setOpen({})}>Свернуть все</button>
            <span class="spacer"></span>
            <button class="btn sm" onClick=${addGroup}><${Icon} name="plus" size=${14} />Группа</button>
          </div>
          ${model.preamble.length > 0 && html`<div class="cmd small muted" style="margin-bottom:8px;max-height:90px">${model.preamble.join('\n')}</div>`}
          ${model.groups.map((g, gi) => {
            const matchName = ql && (g.name || '').toLowerCase().includes(ql);
            const items = g.items.map((it, ii) => ({ it, ii })).filter(x => !ql || matchName || x.it.toLowerCase().includes(ql));
            if (ql && !items.length && !matchName) return null;
            const isOpen = ql ? true : !!open[gi];
            const limit = showAll[gi] ? Infinity : SHOW_LIMIT;
            return html`<div key=${gi} class=${dragOver === gi ? 'drag-over' : ''} style="border-radius:var(--radius)"
              onDragOver=${e => { e.preventDefault(); setDragOver(gi); }} onDragLeave=${() => setDragOver(null)}
              onDrop=${e => { e.preventDefault(); setDragOver(null); const d = JSON.parse(e.dataTransfer.getData('text/zue') || 'null'); if (!d || d.g === gi) return; mutate(m => { const [v] = m.groups[d.g].items.splice(d.i, 1); m.groups[gi].items.push(v); }); }}>
              <${Expander} open=${isOpen} onToggle=${v => setOpen(o => ({ ...o, [gi]: v }))}
                title=${html`<span class="row" style="gap:8px"><b>${g.name === null ? 'Без группы' : g.name}</b><span class="badge">${g.items.length}</span></span>`}
                right=${html`
                  <button class="btn sm ghost icon tooltip" data-tip="Переименовать" onClick=${async () => { const n = await promptDialog('Переименовать группу', 'Название', g.name || ''); if (n) mutate(m => { m.groups[gi].name = n; }); }}><${Icon} name="edit" size=${14} /></button>
                  <button class="btn sm ghost icon tooltip" data-tip="Выше" onClick=${() => gi > 0 && mutate(m => { [m.groups[gi - 1], m.groups[gi]] = [m.groups[gi], m.groups[gi - 1]]; })}><${Icon} name="chevron" size=${14} style="transform:rotate(-90deg)" /></button>
                  <button class="btn sm ghost icon tooltip" data-tip="Ниже" onClick=${() => gi < model.groups.length - 1 && mutate(m => { [m.groups[gi + 1], m.groups[gi]] = [m.groups[gi], m.groups[gi + 1]]; })}><${Icon} name="chevron" size=${14} style="transform:rotate(90deg)" /></button>
                  <button class="btn sm ghost icon tooltip" data-tip="Удалить группу" onClick=${async () => { if (!g.items.length || await confirmDialog('Удалить группу?', `«${g.name}» и ${g.items.length} строк будут удалены.`, 'Удалить', true)) mutate(m => { m.groups.splice(gi, 1); }); }}><${Icon} name="trash" size=${14} /></button>`}>
                ${kind === 'targets' ? html`<${TargetRows} group=${g} gi=${gi} mutate=${mutate} q=${matchName ? '' : ql} />` : html`
                  <div class="item-grid">
                    ${items.slice(0, limit).map(({ it, ii }) => html`<${ItemChip} key=${it + ii} value=${it} hit=${ql && it.toLowerCase().includes(ql)}
                      onDragStart=${e => e.dataTransfer.setData('text/zue', JSON.stringify({ g: gi, i: ii }))}
                      onChange=${v => mutate(m => { m.groups[gi].items[ii] = v; })} onRemove=${() => mutate(m => { m.groups[gi].items.splice(ii, 1); })} />`)}
                    ${items.length > limit && html`<button class="btn sm" onClick=${() => setShowAll(s => ({ ...s, [gi]: true }))}>Показать все (${items.length})</button>`}
                    ${!g.items.length && html`<span class="small muted">Пусто</span>`}
                  </div>
                  <${AddBox} placeholder="домены или IP через пробел / перенос строки" onAdd=${(arr) => {
                    const ex = new Set(g.items.map(x => x.toLowerCase()));
                    const fresh = arr.filter(x => !ex.has(x.toLowerCase()));
                    if (fresh.length < arr.length) toast(`Пропущено дублей: ${arr.length - fresh.length}`, 'warn', 2000);
                    mutate(m => { m.groups[gi].items.push(...fresh); });
                  }} />`}
              <//></div>`;
          })}
          ${!model.groups.length && html`<${Empty} icon="list" title="Файл пуст">Добавьте группу, чтобы начать.<//>`}
        `}`}
      </div>
    </div>
  </div>`;
}
