import { html, useState, useEffect, S, api, call, toast, patchCfg, update, cls, promptDialog, confirmDialog } from '../lib.js';
import { Icon } from '../icons.js';
import { Seg, Select, Setting, Toggle, ColorInput, Range, Expander, Orb } from '../ui.js';
import { PRESETS, COLOR_KEYS, allThemes, currentTheme, applyTheme, normalize, FONT_PRESETS, toCss } from '../themes.js';

let saveTimer = null;
function persistUi() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.call('config:patch', { ui: S.cfg.ui }).catch(() => {}), 300);
}

/** Изменение текущей темы. Встроенная тема при первом изменении копируется в пользовательскую. */
export function editTheme(patch) {
  const ui = S.cfg.ui;
  let t = currentTheme();
  const isPreset = PRESETS.some(p => p.id === t.id);
  if (isPreset) {
    t = { ...t, colors: { ...t.colors }, id: 'c' + Date.now().toString(36), name: t.name + ' (моя)', builtin: false };
    ui.customThemes = [...ui.customThemes, t];
    ui.themeId = t.id;
    toast('Создана своя тема «' + t.name + '» — встроенные не изменяются', 'info', 3000);
  }
  const next = { ...t, ...patch, colors: { ...t.colors, ...(patch.colors || {}) } };
  ui.customThemes = ui.customThemes.map(x => x.id === next.id ? next : x);
  applyTheme(normalize(next));
  update();
  persistUi();
}

function Preview({ t }) {
  const c = t.colors;
  return html`<div class="theme-prev" style=${`background:${toCss(c.bg)};font-family:${t.font}`}>
    <div class="tp-side" style=${`background:${toCss(c.layer)}`}><i style=${`background:${toCss(c.accent)};opacity:1`}></i><i style=${`background:${toCss(c.text)}`}></i><i style=${`background:${toCss(c.text)}`}></i><i style=${`background:${toCss(c.text)}`}></i></div>
    <div class="tp-main" style=${`background:${toCss(c.card)};border:1px solid ${toCss(c.stroke)};border-radius:${Math.min(t.radius, 10)}px`}>
      <div class="row" style="gap:5px"><span style=${`width:16px;height:16px;border-radius:50%;background:${toCss(c.stOn)};box-shadow:0 0 8px ${toCss(c.stOn)}`}></span><i style=${`flex:1;background:${toCss(c.text)};opacity:.8`}></i></div>
      <i style=${`width:70%;background:${toCss(c.text3)}`}></i>
      <div class="row" style="gap:4px;margin-top:auto"><i style=${`width:40%;height:10px;background:${toCss(c.accent)}`}></i><i style=${`width:30%;height:10px;background:${toCss(c.surface)}`}></i></div>
    </div></div>`;
}

export function AppearancePage() {
  const ui = S.cfg.ui;
  const t = currentTheme();
  const isPreset = PRESETS.some(p => p.id === t.id);
  const [fonts, setFonts] = useState(null);
  useEffect(() => { api.call('fonts:list').then(f => setFonts(f.sort())).catch(() => setFonts([])); }, []);
  const choose = (id) => { ui.themeId = id; applyTheme(); update(); persistUi(); };
  const fontOpts = [...FONT_PRESETS.map(f => ({ value: f, label: f.split(',')[0].replace(/"/g, ''), group: 'Рекомендуемые' })), ...(fonts || []).map(f => ({ value: `"${f}", sans-serif`, label: f, group: 'Шрифты системы' }))];
  const fontRender = (o) => html`<span style=${`font-family:${o.value}`}>${o.label}</span>`;

  const saveAs = async () => {
    const name = await promptDialog('Сохранить как новую тему', 'Название', t.name.replace(/ \(моя\)$/, '') + ' 2');
    if (!name) return;
    const nt = { ...t, colors: { ...t.colors }, id: 'c' + Date.now().toString(36), name, builtin: false };
    ui.customThemes = [...ui.customThemes, nt]; ui.themeId = nt.id; applyTheme(); update(); persistUi();
    toast('Тема сохранена', 'ok', 1500);
  };
  const rename = async () => { const n = await promptDialog('Переименовать тему', 'Название', t.name); if (n) editTheme({ name: n }); };
  const del = async () => {
    if (!(await confirmDialog('Удалить тему?', `«${t.name}» будет удалена.`, 'Удалить', true))) return;
    ui.customThemes = ui.customThemes.filter(x => x.id !== t.id); ui.themeId = 'fluent-dark'; applyTheme(); update(); persistUi();
  };
  const imp = async () => {
    const j = await call('theme:import'); if (!j) return;
    if (!j.colors) return toast('Это не файл темы', 'error');
    const nt = { ...normalize(j), id: 'c' + Date.now().toString(36), builtin: false, name: j.name || 'Импорт' };
    ui.customThemes = [...ui.customThemes, nt]; ui.themeId = nt.id; applyTheme(); update(); persistUi();
    toast('Тема импортирована', 'ok');
  };

  return html`<div class="page">
    <h1 class="page-title">Оформление</h1>
    <p class="page-sub">Готовые темы и полная настройка: цвета, шрифты, размеры, скругления, материал окна Windows 11, анимации, фон и вид индикатора.</p>

    <div class="section-title">Темы</div>
    <div class="grid stagger" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
      ${allThemes().map((th, i) => { const n = normalize(th); return html`<div key=${th.id} class=${cls('theme-card', th.id === ui.themeId && 'on')} style=${`--i:${i}`} onClick=${() => choose(th.id)}>
        <${Preview} t=${n} />
        <div class="theme-meta"><span class="swatch" style=${`background:${toCss(n.colors.accent)}`}></span><span class="grow ellipsis">${th.name}</span>${!PRESETS.some(p => p.id === th.id) && html`<span class="badge">своя</span>`}</div>
      </div>`; })}
    </div>
    <div class="row wrap" style="margin-top:10px">
      <button class="btn" onClick=${saveAs}><${Icon} name="copy" size=${14} />Сохранить как новую</button>
      ${!isPreset && html`<button class="btn" onClick=${rename}><${Icon} name="edit" size=${14} />Переименовать</button><button class="btn danger" onClick=${del}><${Icon} name="trash" size=${14} />Удалить</button>`}
      <span class="spacer"></span>
      <button class="btn" onClick=${() => call('theme:export', t).then(ok => ok && toast('Тема экспортирована', 'ok'))}><${Icon} name="upload" size=${14} />Экспорт</button>
      <button class="btn" onClick=${imp}><${Icon} name="download" size=${14} />Импорт</button>
    </div>

    <div class="section-title">Текущая тема: ${t.name}${isPreset ? html` <span class="badge">встроенная — изменения создадут копию</span>` : ''}</div>
    <${Setting} icon=${t.dark ? 'moon' : 'sun'} title="Основа" desc="Светлая или тёмная схема (системные элементы, полосы прокрутки)">
      <${Seg} value=${t.dark ? 'dark' : 'light'} onChange=${v => editTheme({ dark: v === 'dark' })} options=${[{ value: 'light', label: 'Светлая', icon: 'sun' }, { value: 'dark', label: 'Тёмная', icon: 'moon' }]} />
    <//>
    <${Setting} icon="palette" title="Акцентный цвет">
      <div class="row wrap" style="gap:4px">${['#60cdff', '#005fb8', '#0a84ff', '#34c759', '#4cc38a', '#ff9f0a', '#ff375f', '#e0457b', '#bf5af2', '#b57bff', '#ff2bd6', '#ffd60a'].map(a => html`<button class="btn icon sm" style=${`background:${a};border-color:${t.colors.accent === a ? 'var(--text)' : 'transparent'}`} onClick=${() => editTheme({ colors: { accent: a, accentText: /^#(ff|fc|ff9|60|4c|34|ffd)/i.test(a) && t.dark ? '#111111' : '#ffffff' } })}></button>`)}</div>
      <${ColorInput} value=${t.colors.accent} onChange=${v => editTheme({ colors: { accent: v } })} />
    <//>
    <${Setting} icon="sun" title="Материал окна" desc="Эффекты Windows 11 (22H2+). В остальных системах фон непрозрачный">
      <${Seg} value=${t.material} onChange=${v => editTheme({ material: v })} options=${[{ value: 'mica', label: 'Mica' }, { value: 'tabbed', label: 'Mica Alt' }, { value: 'acrylic', label: 'Акрил' }, { value: 'none', label: 'Нет' }]} />
    <//>
    <${Setting} icon="eye" title="Прозрачность фона" desc="Насколько сквозь окно виден материал" disabled=${t.material === 'none'}>
      <${Range} value=${Math.round(t.transparency * 100)} min=${0} max=${100} suffix="%" onChange=${v => editTheme({ transparency: v / 100 })} />
    <//>

    <div class="section-title">Текст</div>
    <${Setting} icon="text" title="Шрифт интерфейса">
      <${Select} width="280px" value=${t.font} options=${fontOpts.some(o => o.value === t.font) ? fontOpts : [{ value: t.font, label: t.font.split(',')[0].replace(/"/g, '') }, ...fontOpts]} onChange=${v => editTheme({ font: v })} render=${fontRender} search />
    <//>
    <${Setting} icon="text" title="Шрифт заголовков">
      <${Select} width="280px" value=${t.displayFont} options=${fontOpts.some(o => o.value === t.displayFont) ? fontOpts : [{ value: t.displayFont, label: (t.displayFont || '').split(',')[0].replace(/"/g, '') }, ...fontOpts]} onChange=${v => editTheme({ displayFont: v })} render=${fontRender} search />
    <//>
    <${Setting} icon="code" title="Моноширинный шрифт" desc="Команды, списки, журнал">
      <${Select} width="280px" value=${t.mono} options=${[{ value: t.mono, label: t.mono.split(',')[0].replace(/"/g, '') }, ...fontOpts.filter(o => o.value !== t.mono)]} onChange=${v => editTheme({ mono: v })} render=${fontRender} search />
    <//>
    <${Setting} icon="text" title="Размер шрифта">
      <${Range} value=${t.fontSize} min=${11} max=${20} suffix="px" onChange=${v => editTheme({ fontSize: v })} />
    <//>

    <div class="section-title">Форма и движение</div>
    <${Setting} icon="grid" title="Скругление углов"><${Range} value=${t.radius} min=${0} max=${20} suffix="px" onChange=${v => editTheme({ radius: v })} /><//>
    <${Setting} icon="menu" title="Плотность"><${Seg} value=${t.density} onChange=${v => editTheme({ density: v })} options=${[{ value: 'comfortable', label: 'Обычная' }, { value: 'compact', label: 'Компактная' }]} /><//>
    <${Setting} icon="menu" title="Ширина меню"><${Range} value=${t.sidebarWidth} min=${200} max=${340} suffix="px" onChange=${v => editTheme({ sidebarWidth: v })} /><//>
    <${Setting} icon="pulse" title="Скорость анимаций" desc="1× — стандарт, меньше — быстрее" disabled=${t.reduceMotion}><${Range} value=${t.anim} min=${0.3} max=${2.5} step=${0.1} suffix="×" onChange=${v => editTheme({ anim: v })} /><//>
    <${Setting} icon="stop" title="Без анимаций"><${Toggle} on=${t.reduceMotion} onChange=${v => editTheme({ reduceMotion: v })} /><//>
    <${Setting} icon="bolt" title="Вид индикатора" desc="Как выглядит знак состояния на главной">
      <div class="row" style="gap:14px">
        <${Seg} value=${t.orb} onChange=${v => { editTheme({ orb: v }); document.body.dataset.orb = v; }} options=${[{ value: 'glow', label: 'Сияние' }, { value: 'pulse', label: 'Пульс' }, { value: 'ring', label: 'Кольцо' }, { value: 'minimal', label: 'Минимал' }]} />
        <div class="row" style="gap:4px">${['off', 'running', 'service', 'testing'].map(s => html`<${Orb} state=${s} size=${44} />`)}</div>
      </div>
    <//>

    <div class="section-title">Фон</div>
    <${Setting} icon="film" title="Фоновое изображение" desc=${t.bgImage ? 'Установлено' : 'Не выбрано'}>
      ${t.bgImage && html`<button class="btn sm" onClick=${() => editTheme({ bgImage: '' })}>Убрать</button>`}
      <button class="btn" onClick=${async () => { const d = await call('image:pick'); if (d) editTheme({ bgImage: d }); }}>Выбрать…</button>
    <//>
    <${Setting} icon="eye" title="Видимость изображения" disabled=${!t.bgImage}><${Range} value=${Math.round(t.bgImageOpacity * 100)} min=${0} max=${100} suffix="%" onChange=${v => editTheme({ bgImageOpacity: v / 100 })} /><//>
    <${Setting} icon="eye" title="Размытие изображения" disabled=${!t.bgImage}><${Range} value=${t.bgImageBlur} min=${0} max=${60} suffix="px" onChange=${v => editTheme({ bgImageBlur: v })} /><//>

    <div class="section-title">Все цвета</div>
    <${Expander} title="Палитра (${COLOR_KEYS.length} цветов, с прозрачностью)" icon="palette">
      <div class="grid g2" style="margin-top:10px">${COLOR_KEYS.map(([k, label]) => html`<div class="row" style="justify-content:space-between;gap:8px"><span class="small">${label}</span><${ColorInput} value=${t.colors[k]} onChange=${v => editTheme({ colors: { [k]: v } })} /></div>`)}</div>
    <//>
  </div>`;
}
