import { html, useState, S, patchCfg, promptDialog, confirmDialog, toast, update, cls, openModal, closeModal, curVersion, batByKey } from '../lib.js';
import { Icon, PROFILE_ICONS } from '../icons.js';
import { activateProfile } from '../actions.js';

const COLORS = ['#0a84ff', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#5ac8fa', '#ffd60a', '#ff6b35', '#30d158', '#64d2ff', '#8e8e93', '#e0457b'];
const KEY_LABEL = { 'gameFilter.mode': 'Game Filter', 'gameFilter.tcp': 'GF TCP', 'gameFilter.udp': 'GF UDP', 'ipset.mode': 'IPSet', 'desync.sni': 'SNI', 'desync.repeats': 'Повторы', 'lists.shared': 'Общие списки', 'net.tcpTimestamps': 'TCP ts', 'run.window': 'Окно', 'args.start': 'Арг. начало', 'args.end': 'Арг. конец' };
const keyLabel = (k) => KEY_LABEL[k] || (k.startsWith('fakes.') ? 'Фейк ' + ((S.info.fakeSlots.find(s => 'fakes.' + s.key === k) || {}).label || k) : k);
const VAL_LABEL = { disabled: 'выкл', all: 'TCP+UDP', tcp: 'TCP', udp: 'UDP', hidden: 'скрыто', minimized: 'свёрнуто' };
const fmtVal = (v) => v === true ? 'вкл' : v === false ? 'выкл' : v === '' ? 'как в батнике' : VAL_LABEL[v] || String(v).replace(/\.bin$/, '');

function editLook(p) {
  let color = p.color, icon = p.icon;
  const save = () => { patchCfg({ profiles: S.cfg.profiles.map(x => x.id === p.id ? { ...x, color, icon } : x) }); closeModal(); };
  const Body = () => {
    const [, f] = useState(0);
    return html`<div class="modal-body"><h3>Оформление профиля</h3>
      <div class="small muted" style="margin-bottom:8px">Цвет</div>
      <div class="row wrap">${COLORS.map(c => html`<button class=${cls('btn icon', color === c && 'primary')} style=${`background:${c};border-color:${color === c ? 'var(--text)' : 'transparent'}`} onClick=${() => { color = c; f(x => x + 1); }}>${color === c ? html`<${Icon} name="check" />` : ''}</button>`)}
        <input type="color" class="input" value=${color} onInput=${e => { color = e.target.value; f(x => x + 1); }} /></div>
      <div class="small muted" style="margin:16px 0 8px">Значок</div>
      <div class="row wrap">${PROFILE_ICONS.map(i => html`<button class=${cls('btn icon', icon === i && 'primary')} onClick=${() => { icon = i; f(x => x + 1); }}><${Icon} name=${i} /></button>`)}</div>
    </div><div class="modal-foot"><button class="btn" onClick=${closeModal}>Отмена</button><button class="btn primary" onClick=${save}>Сохранить</button></div>`;
  };
  openModal(() => html`<${Body} />`);
}

export function ProfilesPage() {
  const c = S.cfg;
  const ver = curVersion();
  const profiles = c.profiles;
  const setProfiles = (list) => patchCfg({ profiles: list });
  const create = async (from) => {
    const name = await promptDialog(from ? 'Дублировать профиль' : 'Новый профиль', 'Название', from ? from.name + ' (копия)' : 'Новый профиль');
    if (!name) return;
    const id = 'p' + Date.now().toString(36);
    setProfiles([...profiles, { id, name, icon: from ? from.icon : 'star', color: from ? from.color : COLORS[profiles.length % COLORS.length], version: from ? from.version : '', bat: from ? from.bat : '', overrides: from ? { ...from.overrides } : {} }]);
    toast('Профиль создан', 'ok', 1500);
  };
  const rename = async (p) => {
    const name = await promptDialog('Переименовать', 'Название', p.name);
    if (name) setProfiles(profiles.map(x => x.id === p.id ? { ...x, name } : x));
  };
  const remove = async (p) => {
    if (profiles.length < 2) return toast('Должен остаться хотя бы один профиль', 'warn');
    if (!(await confirmDialog('Удалить профиль?', `«${p.name}» и его настройки будут удалены.`, 'Удалить', true))) return;
    const list = profiles.filter(x => x.id !== p.id);
    patchCfg({ profiles: list, activeProfileId: c.activeProfileId === p.id ? list[0].id : c.activeProfileId });
  };
  const bind = (p) => setProfiles(profiles.map(x => x.id === p.id ? (x.bat ? { ...x, bat: '', version: '' } : { ...x, bat: c.selectedBat, version: c.selectedVersion }) : x));
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const cardDnD = (p) => ({
    onDragStart: (e) => { e.dataTransfer.setData('text/zue-profile', p.id); e.dataTransfer.effectAllowed = 'move'; setDrag(p.id); },
    onDragEnd: () => { setDrag(null); setOver(null); },
    onDragOver: (e) => {
      if (!drag || drag === p.id) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const pos = e.clientX < r.left + r.width / 2 ? 'before' : 'after';
      if (!over || over.id !== p.id || over.pos !== pos) setOver({ id: p.id, pos });
    },
    onDrop: (e) => {
      if (!drag) return;
      e.preventDefault();
      const list = [...profiles];
      const from = list.findIndex(x => x.id === drag);
      let to = list.findIndex(x => x.id === p.id) + (over && over.pos === 'after' ? 1 : 0);
      const [x] = list.splice(from, 1);
      if (to > from) to--;
      list.splice(to, 0, x);
      setProfiles(list); setDrag(null); setOver(null);
    },
  });
  const move = (p, d) => { const i = profiles.indexOf(p); const j = i + d; if (j < 0 || j >= profiles.length) return; const l = [...profiles]; [l[i], l[j]] = [l[j], l[i]]; setProfiles(l); };

  return html`<div class="page">
    <h1 class="page-title">Профили</h1>
    <p class="page-sub">Профиль — набор сохранённых настроек (Game Filter, IPSet, фейки…) и, при желании, привязанная стратегия. Переключение профиля сразу применяет настройки${c.app.autoRestart ? ' и перезапускает обход' : ''}. Сами настройки профиля меняются на вкладке «Настройки обхода» → уровень «Профиль».</p>
    <div class="row" style="margin-bottom:14px"><span class="spacer"></span><button class="btn primary" onClick=${() => create(null)}><${Icon} name="plus" size=${15} />Новый профиль</button></div>
    <div class="grid gauto stagger">
      ${profiles.map((p, i) => {
        const active = p.id === c.activeProfileId;
        const ov = Object.entries(p.overrides || {});
        const b = p.bat && batByKey(p.bat, S.scan.versions.find(v => v.id === p.version) || ver);
        return html`<div key=${p.id} draggable="true" ...${cardDnD(p)} class=${cls('card hoverable', drag === p.id && 'dragging', over && over.id === p.id && 'drop-' + over.pos)} style=${`--i:${i};${active ? `border-color:${p.color};box-shadow:0 0 0 1px ${p.color} inset` : ''}`}>
          <div class="row">
            <div style=${`width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:${p.color}22;color:${p.color}`} onClick=${() => editLook(p)} class="tooltip" data-tip="Цвет и значок"><${Icon} name=${p.icon || 'star'} size=${22} /></div>
            <div class="grow" style="min-width:0"><div class="ellipsis" style="font-weight:600">${p.name}</div><div class="tiny muted">${active ? 'активен' : ov.length + ' настроек'}</div></div>
            ${active ? html`<span class="badge accent">Активен</span>` : html`<button class="btn sm primary" onClick=${() => activateProfile(p.id)}>Включить</button>`}
          </div>
          <div class="row wrap" style="gap:5px;margin:12px 0;min-height:24px">
            ${ov.length ? ov.map(([k, v]) => html`<span class="chip tiny">${keyLabel(k)}: <b>${fmtVal(v)}</b></span>`) : html`<span class="small muted">Без изменений — только база</span>`}
          </div>
          <div class="small dim row" style="gap:6px;margin-bottom:10px"><${Icon} name=${p.bat ? 'link' : 'unlink'} size=${14} />${p.bat ? html`<span class="ellipsis">${(b && b.name) || p.bat.replace(/^custom:/, '')} ${p.version ? html`<span class="muted">· ${p.version}</span>` : ''}</span>` : html`<span class="muted">Стратегия не привязана</span>`}</div>
          <div class="card-actions">
            <span class="drag-handle" title="Перетащите карточку, чтобы изменить порядок"><${Icon} name="grip" size=${15} stroke=${3} /></span>
            <span class="spacer"></span>
            <button class="btn sm ghost icon tooltip" data-tip=${p.bat ? 'Отвязать стратегию' : 'Привязать текущую стратегию'} onClick=${() => bind(p)}><${Icon} name=${p.bat ? 'unlink' : 'link'} size=${14} /></button>
            <button class="btn sm ghost icon tooltip" data-tip="Переименовать" onClick=${() => rename(p)}><${Icon} name="edit" size=${14} /></button>
            <button class="btn sm ghost icon tooltip" data-tip="Дублировать" onClick=${() => create(p)}><${Icon} name="copy" size=${14} /></button>
            <button class="btn sm ghost icon tooltip" data-tip="Настроить" onClick=${async () => { if (!active) await activateProfile(p.id); update(s => { s.page = 'settings'; s.settingsScope = 'profile'; }); }}><${Icon} name="sliders" size=${14} /></button>
            <button class="btn sm ghost icon tooltip" data-tip="Удалить" onClick=${() => remove(p)}><${Icon} name="trash" size=${14} /></button>
          </div>
        </div>`;
      })}
    </div>
  </div>`;
}
