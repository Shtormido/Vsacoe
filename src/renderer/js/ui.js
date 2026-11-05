// Базовые компоненты в стиле Fluent.
import { html, render, useState, useEffect, useRef, useLayoutEffect, cls, S, closeModal, scoreColor } from './lib.js';
import { Icon } from './icons.js';

export function Toggle({ on, onChange, disabled }) {
  return html`<button class=${cls('toggle', on && 'on')} disabled=${disabled} role="switch" aria-checked=${!!on} onClick=${() => onChange && onChange(!on)}></button>`;
}

export function Check({ on, onChange, label }) {
  return html`<label class="row" style="gap:8px;cursor:default" onClick=${(e) => { e.preventDefault(); onChange && onChange(!on); }}>
    <span class=${cls('check', on && 'on')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12.5 10 17 19 7"/></svg></span>${label}</label>`;
}

export function Seg({ value, options, onChange, disabled }) {
  return html`<div class="seg">${options.map(o => html`<button class=${value === o.value ? 'on' : ''} disabled=${disabled || o.disabled} title=${o.title || ''} onClick=${() => onChange(o.value)}>${o.icon ? html`<${Icon} name=${o.icon} size=${15} />` : ''}${o.label}</button>`)}</div>`;
}

/** Выпадающий список с поиском и группами. options: [{value,label,hint,group,badge}] */
/** Рендер в отдельный слой поверх окна (вне карточек, анимаций и overflow). */
function Portal({ children }) {
  const el = useRef(null);
  if (!el.current) { el.current = document.createElement('div'); el.current.className = 'portal'; }
  useLayoutEffect(() => {
    document.body.appendChild(el.current);
    return () => { render(null, el.current); el.current.remove(); };
  }, []);
  useLayoutEffect(() => { render(children, el.current); });
  return null;
}

/** Выпадающий список с поиском и группами. options: [{value,label,hint,group,badge}] */
export function Select({ value, options, onChange, placeholder = 'Не выбрано', search, width, disabled, render: renderOpt }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState(null);
  const ref = useRef();
  const popRef = useRef();
  const place = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 260 && above > below;
    const maxH = Math.max(160, Math.min(360, up ? above : below));
    setPos({ left: r.left, width: Math.max(r.width, 220), top: up ? null : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : null, maxH, up });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const close = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = (e) => { if (popRef.current && popRef.current.contains(e.target)) return; place(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);
  const cur = options.find(o => o.value === value);
  const filtered = q ? options.filter(o => (o.label + ' ' + (o.hint || '')).toLowerCase().includes(q.toLowerCase())) : options;
  let lastGroup = null;
  const style = pos ? `left:${pos.left}px;width:${pos.width}px;max-height:${pos.maxH}px;${pos.up ? `bottom:${pos.bottom}px` : `top:${pos.top}px`}` : 'visibility:hidden';
  return html`<div class="select" ref=${ref} style=${width ? `width:${width}` : ''}>
    <button class=${cls('select-btn', open && 'open')} disabled=${disabled} onClick=${() => { setOpen(!open); setQ(''); }}>
      <span class="v">${cur ? (renderOpt ? renderOpt(cur) : cur.label) : html`<span class="muted">${placeholder}</span>`}</span>
      <${Icon} name="chevdown" size=${14} />
    </button>
    ${open && html`<${Portal}><div class=${cls('select-pop', pos && pos.up && 'up')} style=${style} ref=${popRef}>
      ${(search || options.length > 12) && html`<input class="input select-search" placeholder="Поиск…" value=${q} onInput=${e => setQ(e.target.value)} ref=${el => el && setTimeout(() => el.focus(), 10)} />`}
      ${filtered.map(o => {
        const g = o.group && o.group !== lastGroup ? html`<div class="opt-group">${o.group}</div>` : null;
        lastGroup = o.group;
        return html`${g}<div class=${cls('opt', o.value === value && 'sel')} onClick=${() => { onChange(o.value); setOpen(false); }}>
          <span class="grow ellipsis">${renderOpt ? renderOpt(o) : o.label}</span>${o.badge || ''}${o.hint ? html`<span class="tiny muted">${o.hint}</span>` : ''}</div>`;
      })}
      ${!filtered.length && html`<div class="opt muted">Ничего не найдено</div>`}
    </div><//>`}
  </div>`;
}

/** Строка настройки в стиле Параметров Windows */
export function Setting({ icon, title, desc, children, disabled, overridden, onReset, extra, source }) {
  return html`<div class=${cls('setting', disabled && 'disabled')}>
    ${icon && html`<span class="s-ico"><${Icon} name=${icon} size=${20} /></span>`}
    <div class="s-main">
      <div class="s-title">${title}${overridden && html`<span class="ovr-dot" title="Задано на этом уровне"></span>`}${extra}</div>
      ${desc && html`<div class="s-desc">${desc}</div>`}
      ${source && html`<div class="tiny muted" style="margin-top:2px">${source}</div>`}
    </div>
    <div class="s-ctl">${children}${overridden && onReset && html`<button class="btn ghost sm icon tooltip" data-tip="Сбросить на этом уровне" onClick=${onReset}><${Icon} name="undo" size=${14} /></button>`}</div>
  </div>`;
}

export function InfoBar({ type = 'info', title, children, action }) {
  const icon = type === 'warn' ? 'warning' : type === 'err' ? 'warning' : type === 'ok' ? 'check' : 'info';
  return html`<div class=${'infobar ' + type}><span class="ib-ico"><${Icon} name=${icon} size=${18} /></span><div class="grow">${title && html`<b>${title} </b>`}${children}</div>${action}</div>`;
}

export function Expander({ title, right, children, open: o0 = false, icon, onToggle, open: controlled }) {
  const [open, setOpen] = useState(o0);
  const isOpen = controlled !== undefined && onToggle ? controlled : open;
  const toggle = () => { if (onToggle) onToggle(!isOpen); else setOpen(!open); };
  return html`<div class=${cls('expander', isOpen && 'open')}>
    <div class="exp-head" onClick=${toggle}>
      <span class="chev"><${Icon} name="chevron" size=${14} /></span>
      ${icon && html`<${Icon} name=${icon} size=${18} />`}
      <div class="grow">${title}</div>
      <div class="row" onClick=${e => e.stopPropagation()}>${right}</div>
    </div>
    <div class="exp-body"><div>${isOpen && html`<div class="exp-inner">${children}</div>`}</div></div>
  </div>`;
}

export function Orb({ state, size = 132, icon }) {
  const live = state === 'running' || state === 'service';
  const busy = state === 'testing' || state === 'starting';
  const style = document.body.dataset.orb || 'glow';
  return html`<div class=${cls('orb', 'st-' + state, live && 'live', busy && 'busy', state === 'off' && 'off', 'style-' + style)} style=${`--size:${size}px`}>
    <div class="halo"></div><div class="ring"></div><div class="ring"></div><div class="ring"></div>${busy && html`<div class="spin"></div>`}
    <div class="core"><${Icon} name=${icon || (state === 'service' ? 'shield' : state === 'off' ? 'bolt' : busy ? 'pulse' : 'bolt')} size=${size * 0.2} stroke=${2} /></div>
  </div>`;
}

export function Progress({ value, indet }) {
  return html`<div class=${cls('progress', indet && 'indet')}><i style=${`width:${Math.max(0, Math.min(100, value || 0))}%`}></i></div>`;
}

export function ScoreBar({ score, width = 90 }) {
  return html`<div class="row" style="gap:8px"><div class="scorebar" style=${`width:${width}px;--full:${width}px`}><i style=${`width:${score}%`}></i></div><span class="tiny" style=${`color:${scoreColor(score)};font-weight:600;min-width:38px`}>${score}%</span></div>`;
}

export function ModalHost() {
  const m = S.modal;
  if (!m) return null;
  const wide = typeof m === 'object' && m.wide;
  const render = typeof m === 'function' ? m : m.render;
  return html`<div class="modal-back" onMouseDown=${(e) => { if (e.target === e.currentTarget) closeModal(); }}>
    <div class=${cls('modal', wide && 'wide')}>${render()}</div></div>`;
}

export function Toasts() {
  return html`<div class="toasts">${S.toasts.map(t => html`<div key=${t.id} class=${cls('toast', t.type, t.out && 'out')}>
    <span class="ib-ico"><${Icon} name=${t.type === 'error' ? 'warning' : t.type === 'ok' ? 'check' : t.type === 'warn' ? 'warning' : 'info'} /></span><div>${t.text}</div></div>`)}</div>`;
}

/** Красивый вывод аргументов winws с разбиением по секциям --new */
export function CommandView({ args }) {
  if (!args || !args.length) return html`<div class="cmd muted">—</div>`;
  const sections = [[]];
  for (const a of args) { if (a === '--new') sections.push([]); else sections[sections.length - 1].push(a); }
  const renderArg = (a) => {
    const m = a.match(/^(--?[\w-]+)(=)?(.*)$/s);
    if (!m) return html`<span class="a-val">${a} </span>`;
    const isPath = /[\\/]/.test(m[3]);
    return html`<span><span class="a-name">${m[1]}</span>${m[2] ? '=' : ''}<span class=${isPath ? 'a-path' : 'a-val'}>${isPath ? m[3].replace(/^.*[\\/]/, '…\\') : m[3]}</span> </span>`;
  };
  return html`<div class="cmd">${sections.map((sec, i) => html`<span class=${i ? 'a-sec' : ''}>${i ? html`<span class="a-new">--new </span>` : ''}${sec.map(renderArg)}</span>`)}</div>`;
}

export function ColorInput({ value, onChange }) {
  const hex = String(value || '#000000');
  const base6 = hex.slice(0, 7);
  const alpha = hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) : 255;
  const [txt, setTxt] = useState(hex);
  useEffect(() => setTxt(hex), [hex]);
  return html`<div class="color-row">
    <input type="color" class="input" value=${base6} onInput=${e => onChange(e.target.value + (alpha < 255 ? alpha.toString(16).padStart(2, '0') : ''))} />
    <input class="input mono" style="width:110px" value=${txt} onInput=${e => { setTxt(e.target.value); if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value)) onChange(e.target.value); }} />
    <input type="range" class="range" style="width:80px" min="0" max="255" value=${alpha} title="Прозрачность" onInput=${e => onChange(base6 + (+e.target.value < 255 ? (+e.target.value).toString(16).padStart(2, '0') : ''))} />
  </div>`;
}

export function Range({ value, min, max, step = 1, onChange, suffix = '', width }) {
  return html`<div class="row"><input type="range" class="range" style=${width ? `width:${width}` : ''} min=${min} max=${max} step=${step} value=${value} onInput=${e => onChange(+e.target.value)} /><span class="small mono" style="min-width:52px;text-align:right">${value}${suffix}</span></div>`;
}

export function Empty({ icon = 'info', title, children }) {
  return html`<div class="empty"><${Icon} name=${icon} size=${40} stroke=${1.2} /><div class="big">${title}</div><div>${children}</div></div>`;
}

/** Предупреждения сборки команды: 1–2 показываем целиком, больше — свёрнутым списком. */
export function Warnings({ list }) {
  const [open, setOpen] = useState(false);
  if (!list || !list.length) return null;
  if (list.length <= 2) return html`<div class="col" style="gap:6px">${list.map(w => html`<${InfoBar} type="warn">${w}<//>`)}</div>`;
  return html`<${InfoBar} type="warn" title=${`Предупреждений: ${list.length}.`} action=${html`<button class="btn sm ghost" onClick=${() => setOpen(!open)}>${open ? 'Скрыть' : 'Показать'}</button>`}>
    ${open ? html`<ul style="margin:6px 0 0;padding-left:18px">${list.map(w => html`<li class="small">${w}</li>`)}</ul>` : html`<span class="small">${list[0]}…</span>`}<//>`;
}
