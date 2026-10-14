import { BREEDS } from '../data/breeds.js';
import { REGULARS } from '../data/clients.js';
import { SALONS } from '../data/salons.js';
import { SHOP, SHOP_CATS } from '../data/shop.js';
import { PLAYER_TREE, SALON_TREE, STAFF_TREE, canUnlock, computeMods, staffStats, staffXpForLevel, xpForLevel } from '../data/skills.js';
import { STAT_NAMES, candidatesFor, traitOf } from '../data/staff.js';
import { SUPPLIES, UNLOCK_STOCK } from '../data/supplies.js';
import { ACCENTS, ACCENT_PRICE, THEMES } from '../data/themes.js';
import { fmtTime } from '../game/DaySim.js';
import { save } from '../game/State.js';
import { formatMoney } from '../util/math.js';
import { h, iconEl, starsText } from './UI.js';

const APPS = [
  { id: 'mail', icon: '✉️', name: 'Почта' },
  { id: 'schedule', icon: '📅', name: 'Запись' },
  { id: 'supplies', icon: '📦', name: 'Расходники' },
  { id: 'shop', icon: '🛒', name: 'ГрумМаркет' },
  { id: 'site', icon: '🌐', name: 'Сайт салона' },
  { id: 'staff', icon: '👥', name: 'Персонал' },
  { id: 'skills', icon: '🌳', name: 'Навыки' },
  { id: 'design', icon: '🎨', name: 'Дизайн' },
  { id: 'finance', icon: '📊', name: 'Бухгалтерия' },
  { id: 'clients', icon: '📇', name: 'Картотека' },
];

const SITE_UPGRADES = [
  { id: 'widget', name: 'Онлайн-запись', price: 5000, desc: 'Заявки на завтра принимаются автоматически в конце дня.' },
  { id: 'gallery', name: 'Галерея работ', price: 3000, desc: 'Фото «до/после» — +1 заявка в день.' },
  { id: 'seo', name: 'Продвижение в поиске', price: 6000, desc: 'Салон в топе карт — ещё +1 заявка в день.' },
];
const SITE_COLORS = ['#ff6f96', '#8a6cf0', '#3fbf9f', '#4aa3df', '#ff9248', '#3d2f3a'];

/** Компьютер на ресепшене: «ЛапкиOS» с рабочими приложениями салона. */
export class Computer {
  constructor(game) {
    this.game = game;
    this.app = 'mail';
    this.sub = {};
  }

  get s() {
    return this.game.state;
  }

  open(app = null) {
    if (app) this.app = app;
    else if (this.s.mail.some((m) => !m.read)) this.app = 'mail';
    this.game.audio.play('click');
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.el = h('div.pc');
      this._esc = (e) => {
        if (e.code === 'Escape') this.close();
      };
      window.addEventListener('keydown', this._esc);
      this.game.ui.layers.modal.append(this.el);
      this.render();
    });
  }

  close() {
    window.removeEventListener('keydown', this._esc);
    this.el?.remove();
    this.el = null;
    save(this.s);
    this.game.onComputerClosed?.();
    this._resolve?.();
  }

  go(app, sub) {
    this.app = app;
    if (sub) this.sub[app] = sub;
    this.game.audio.play('click');
    this.render();
  }

  toast(text, type) {
    this.game.ui.toast(text, type);
  }

  buy(price, what) {
    if (this.s.money < price) {
      this.toast('Не хватает денег', 'bad');
      return false;
    }
    this.s.money -= price;
    this.game.audio.play('coins');
    if (what) this.toast(what, 'good');
    return true;
  }

  render() {
    if (!this.el) return;
    const s = this.s;
    const unread = s.mail.filter((m) => !m.read).length;
    const reqs = s.requests.filter((r) => r.day === s.day + 1).length;
    const badge = { mail: unread, schedule: reqs, staff: s.staff.filter((e) => e.injured).length, skills: s.points + s.staff.reduce((a, e) => a + e.points, 0) };
    const dock = h('div.pc-dock', APPS.map((a) => h(`button.pc-app${a.id === this.app ? '.on' : ''}`, { onclick: () => this.go(a.id) },
      h('span.ico', a.icon), h('span', a.name), badge[a.id] ? h('span.pc-badge', String(badge[a.id])) : null)));
    const clock = s.today?.open ? fmtTime(s.today.clock) : s.today ? 'до открытия' : '';
    const bar = h('div.pc-bar', h('b', 'ЛапкиOS'), h('span', `День ${s.day}${clock ? ' · ' + clock : ''}`),
      h('span', `💰 ${formatMoney(s.money)}`), h('span.stars', starsText(s.rep)),
      h('button.pc-close', { onclick: () => this.close() }, '✕ Выключить'));
    const main = h('div.pc-main', this[`app_${this.app}`]());
    this.el.replaceChildren(h('div.pc-screen', bar, h('div.pc-body', dock, main)));
  }

  // ------------------------------------------------------------ почта
  app_mail() {
    const s = this.s;
    const sel = s.mail.find((m) => m.id === this.sub.mail) || s.mail[0];
    if (sel) sel.read = true;
    return h('div.pc-split',
      h('div.pc-list', s.mail.length ? s.mail.map((m) => h(`div.pc-row${m === sel ? '.on' : ''}${m.read ? '' : '.unread'}`, { onclick: () => this.go('mail', m.id) },
        h('b', m.from), h('div', m.subject), h('small', `день ${m.day}`))) : h('p.muted', 'Писем пока нет.')),
      h('div.pc-read', sel ? [h('h3', sel.subject), h('div.muted', `От: ${sel.from} · день ${sel.day}`), h('p', sel.body)] : null));
  }

  // ------------------------------------------------------------ запись
  app_schedule() {
    const s = this.s;
    const sim = this.game.day;
    const T = s.today;
    const today = T ? [...T.appts].sort((a, b) => a.time - b.time) : [];
    const tomorrow = s.bookings[s.day + 1] || [];
    const reqs = s.requests.filter((r) => r.day === s.day + 1);
    const cap = sim.capacity();
    const row = (time, name, pet, status) => h('div.slot', h('b', fmtTime(time)), h('span', name), h('span.muted', pet || ''), status ? h('span.badge', status) : null);
    const statusOf = (a) => {
      if (!a.spawned) return T?.open && a.time < T.clock ? 'опаздывает' : 'ожидается';
      const c = sim.clients.find((x) => x.appt === a);
      if (!c) return 'обслужен(а)';
      return { arriving: 'идёт к стойке', desk: 'у стойки', sofa: 'ждёт на диване', self: 'у вас на столе', staff: 'у сотрудника', done: 'уходит', angry: 'ушёл недовольным' }[c.status];
    };
    return h('div',
      h('h2', 'Запись клиентов'),
      h('p.muted', `Салон открыт 9:00–19:00. Столов: ${SALONS[s.salon].tables}, лимит записей в день: ${cap}. ${s.site.upgrades.includes('widget') ? 'Онлайн-запись принимает заявки автоматически.' : 'Без онлайн-записи необработанные заявки сгорают в конце дня.'}`),
      h('div.pc-cols',
        h('div', h('h3', 'Сегодня'), today.length ? today.map((a) => {
          const info = sim.buildClient(a.spec);
          return row(a.time, info.name, `${info.pet.name}, ${BREEDS[info.pet.breed].name.toLowerCase()}${a.source === 'walkin' ? ' · без записи' : ''}`, statusOf(a));
        }) : h('p.muted', 'Записей нет.')),
        h('div', h('h3', `Завтра · записано ${tomorrow.length} из ${cap}`),
          tomorrow.map((b) => row(b.time, b.name, b.pet, 'записан(а)')),
          h('h3', { style: { marginTop: '14px' } }, `Новые заявки (${reqs.length})`),
          reqs.length ? reqs.map((r) => h('div.slot.req',
            h('b', fmtTime(r.time)), h('span', r.name), h('span.muted', r.pet),
            h('button.mint', { disabled: tomorrow.length >= cap, onclick: () => { if (sim.acceptRequest(r.id)) this.toast(`Записали: ${r.name}, ${fmtTime(r.time)}`, 'good'); this.render(); } }, 'Принять'),
            h('button', { onclick: () => { sim.declineRequest(r.id); this.render(); } }, '✕'))) : h('p.muted', 'Заявок нет. Новые приходят каждое утро — чем выше репутация и лучше сайт, тем больше.'))));
  }

  // ------------------------------------------------------------ расходники
  app_supplies() {
    const s = this.s;
    const m = computeMods(s);
    const disc = 1 - (m.supplyDiscount || 0);
    this.cart ||= {};
    const items = Object.entries(SUPPLIES).filter(([, it]) => !it.needs || s.owned.includes(it.needs));
    const total = items.reduce((a, [id, it]) => a + (this.cart[id] || 0) * Math.round(it.price * disc), 0);
    const order = () => {
      if (!total) return;
      if (!this.buy(total)) return;
      for (const [id, it] of items) {
        const packs = this.cart[id] || 0;
        if (!packs) continue;
        const qty = packs * it.pack;
        if (m.instant) s.stock[id] = (s.stock[id] || 0) + qty;
        else s.deliveries.push({ item: id, qty, day: s.day + 1, name: it.name });
      }
      if (s.today) s.today.supplies += total;
      this.toast(m.instant ? 'Экспресс-доставка: всё уже на складе!' : 'Заказ оформлен — привезут завтра к открытию.', 'good');
      this.cart = {};
      this.render();
    };
    return h('div',
      h('h2', 'Заказ расходников «ЗооСнаб»'),
      h('p.muted', m.instant ? 'Экспресс-доставка: товары приходят сразу.' : 'Доставка — завтра к 9:00.' + (disc < 1 ? ' Оптовая скидка 20%.' : '')),
      h('table.pc-table',
        h('tr', h('th', ''), h('th', 'Товар'), h('th', 'На складе'), h('th', 'Упаковка'), h('th', 'Цена'), h('th', 'Заказ')),
        items.map(([id, it]) => h('tr',
          h('td', h('div.mini-icon', iconEl(it.icon))),
          h('td', h('b', it.name), h('div.muted', it.desc)),
          h('td', h(`span.badge${(s.stock[id] || 0) < 3 ? '.warn' : ''}`, `${s.stock[id] || 0} ${it.unit}`)),
          h('td', `${it.pack} ${it.unit}`),
          h('td', formatMoney(Math.round(it.price * disc))),
          h('td.stepper', h('button', { onclick: () => { this.cart[id] = Math.max(0, (this.cart[id] || 0) - 1); this.render(); } }, '−'),
            h('b', String(this.cart[id] || 0)),
            h('button', { onclick: () => { this.cart[id] = (this.cart[id] || 0) + 1; this.render(); } }, '+'))))),
      h('div.pc-footer', h('span', `Итого: ${formatMoney(total)}`), h('button.primary', { disabled: !total, onclick: order }, 'Оформить заказ')),
      s.deliveries.length ? h('div', h('h3', 'В пути'), s.deliveries.map((d) => h('div.slot', h('span', `${d.name} ×${d.qty}`), h('span.muted', `приедет в день ${d.day}`)))) : null);
  }

  // ------------------------------------------------------------ магазин
  app_shop() {
    const s = this.s;
    const cat = this.sub.shop || 'tools';
    return h('div',
      h('h2', 'ГрумМаркет'),
      h('div.tabs', Object.entries(SHOP_CATS).map(([k, v]) => h(`button${k === cat ? '.on' : ''}`, { onclick: () => this.go('shop', k) }, v))),
      h('div.grid', SHOP.filter((it) => it.cat === cat).map((it) => {
        const owned = s.owned.includes(it.id) && !it.repeatable;
        const locked = it.needs && !s.owned.includes(it.needs);
        return h(`div.card${owned ? '.owned' : ''}`,
          h('div.icon', iconEl(it.icon)),
          h('div.info', h('div.title', it.name), h('div.desc', it.desc),
            h('div.row', h('span.price', formatMoney(it.price)),
              owned ? h('span.badge', 'Куплено') : locked ? h('span.badge.warn', 'Нужна «Стриж»')
                : h('button.primary', {
                  disabled: s.money < it.price,
                  onclick: () => {
                    if (!this.buy(it.price, `Куплено: ${it.name}`)) return;
                    if (it.id === 'ads') s.adsDays += 5;
                    else s.owned.push(it.id);
                    for (const [k, v] of Object.entries(UNLOCK_STOCK[it.id] || {})) s.stock[k] = (s.stock[k] || 0) + v;
                    if (['sofa', 'coffee', 'decor', 'neon', 'music'].includes(it.id)) this.game.rebuildSalonKeepActors();
                    this.render();
                  },
                }, it.id === 'ads' && s.adsDays ? `Ещё (${s.adsDays} дн.)` : 'Купить'))));
      })));
  }

  // ------------------------------------------------------------ сайт
  app_site() {
    const s = this.s;
    const site = s.site;
    const input = (key, max) => h('input', { type: 'text', value: site[key], maxlength: max, onchange: (e) => { site[key] = e.target.value.trim() || site[key]; this.game.refreshSign?.(); this.render(); } });
    const demand = Math.round(Math.max(0.4, Math.min(1.3, 2 - site.priceMul)) * 100);
    const editor = h('div.site-editor',
      h('h3', 'Настройки сайта'),
      h('label', 'Название', input('name', 24)),
      h('label', 'Слоган', input('slogan', 40)),
      h('label', 'Цвет', h('div.swatches', SITE_COLORS.map((c) => h(`button.sw${site.color === c ? '.on' : ''}`, { style: { background: c }, onclick: () => { site.color = c; this.render(); } })))),
      h('label', `Цены: ×${site.priceMul.toFixed(2)}`, h('input', {
        type: 'range', min: 0.8, max: 1.6, step: 0.05, value: site.priceMul,
        onchange: (e) => { site.priceMul = Number(e.target.value); this.render(); },
      })),
      h('p.muted', `Спрос на запись: ${demand}%. Дороже — меньше заявок, но больше денег с каждого клиента.`),
      h('h3', 'Модули'),
      SITE_UPGRADES.map((u) => h('div.slot', h('b', u.name), h('span.muted', u.desc),
        site.upgrades.includes(u.id) ? h('span.badge', 'Подключено')
          : h('button.primary', { disabled: s.money < u.price, onclick: () => { if (this.buy(u.price, `Подключено: ${u.name}`)) { site.upgrades.push(u.id); this.render(); } } }, formatMoney(u.price)))));
    const svcPrice = (base) => formatMoney(Math.round(base * SALONS[s.salon].prestige * site.priceMul / 10) * 10);
    const preview = h('div.site-preview', { style: { '--site': site.color } },
      h('div.site-head', h('div.site-logo', '🐾'), h('div', h('div.site-name', site.name), h('div.site-slogan', site.slogan))),
      h('div.site-hero', h('div', h('b', SALONS[s.salon].district), h('div', `Рейтинг ${s.rep.toFixed(1)} ★ · ${s.stats.served} довольных хвостов`)),
        h('button', 'Записаться онлайн')),
      h('div.site-sec', h('b', 'Услуги и цены'), h('div.site-prices',
        [['Мытьё и сушка', 650], ['Вычёсывание', 350], ['Стрижка', 900], ['Когти', 300], ['Бантик и парфюм', 350]]
          .map(([n, p]) => h('div', h('span', n), h('span', `от ${svcPrice(p)}`))))),
      site.upgrades.includes('gallery') ? h('div.site-sec', h('b', 'Галерея'), h('div.site-gallery', ['🐩', '🐕', '🐈', '🦮', '🐕‍🦺', '🐶'].map((e) => h('div', e)))) : null,
      h('div.site-sec', h('b', 'Отзывы'), site.reviews.length ? site.reviews.slice(0, 4).map((r) => h('div.site-review', h('span.stars', starsText(r.stars)), ` ${r.name}: «${r.text}»`))
        : h('div.muted', 'Отзывов пока нет.')));
    return h('div', h('h2', 'Сайт салона'), h('div.pc-cols', editor, preview));
  }

  // ------------------------------------------------------------ персонал
  app_staff() {
    const s = this.s;
    const sim = this.game.day;
    const maxStaff = SALONS[s.salon].tables - 1;
    const cands = candidatesFor(s.day, SALONS[s.salon].tier, s.staff.map((e) => e.person)).filter((c) => !s.staff.some((e) => e.id === c.id));
    const statBars = (st) => h('div.stats4', Object.entries(STAT_NAMES).map(([k, n]) => h('div.stat', h('span', n), h('div.bar', h('div', { style: { width: `${st[k] * 10}%` } })), h('b', String(st[k])))));
    const busy = (e) => sim.jobs.some((j) => j.emp.id === e.id);
    const staffCards = s.staff.map((e) => {
      const st = staffStats(e);
      const tr = traitOf(e);
      return h('div.staff-card',
        h('div.portrait', { style: { backgroundImage: `url(portraits/${e.person}.png)` } }),
        h('div', { style: { flex: 1 } },
          h('h4', e.name, h('span.muted', ` · ур. ${e.level} · ${formatMoney(e.salary)}/день`)),
          h('div.xpbar', h('div', { style: { width: `${(e.xp / staffXpForLevel(e.level)) * 100}%` } })),
          tr ? h('div.muted', `Черта: ${tr.name} — ${tr.desc}`) : null,
          statBars(st),
          h('div.row-btns',
            e.injured ? h('span.badge.bad', 'Травма') : busy(e) ? h('span.badge.warn', 'Работает') : h('span.badge', 'Свободен(на)'),
            e.injured ? h('button.primary', {
              disabled: !s.stock.firstaid,
              onclick: () => { s.stock.firstaid--; e.injured = false; this.toast(`${e.name} снова в строю!`, 'good'); this.render(); },
            }, `🩹 Обработать (${s.stock.firstaid})`) : null,
            h('button', { onclick: () => this.go('skills', `staff:${e.id}`) }, `🌳 Навыки${e.points ? ` (${e.points})` : ''}`),
            h('button', {
              disabled: busy(e),
              onclick: () => { s.staff = s.staff.filter((x) => x !== e); this.game.syncStaff(); this.toast(`${e.name} уволен(а).`, ''); this.render(); },
            }, 'Уволить'))));
    });
    return h('div',
      h('h2', 'Персонал'),
      h('p.muted', `Сотрудники работают за своими столами: примите клиента у стойки и выберите «Поручить». Мест: ${s.staff.length} из ${maxStaff}. Зарплата списывается каждый вечер.`),
      staffCards.length ? staffCards : h('p.muted', 'Пока вы работаете в одиночку.'),
      h('h3', 'Кандидаты на сегодня'),
      maxStaff <= s.staff.length ? h('p.muted', 'Свободных столов нет. Переезжайте в помещение побольше.') : null,
      h('div.pc-cols3', cands.map((c) => {
        const tr = traitOf(c);
        const fee = c.salary * 2;
        return h('div.staff-card.cand',
          h('div.portrait', { style: { backgroundImage: `url(portraits/${c.person}.png)` } }),
          h('div', { style: { flex: 1 } },
            h('h4', c.name), tr ? h('div.muted', `${tr.name}: ${tr.desc}`) : h('div.muted', 'Без особенностей'),
            statBars(c.stats),
            h('div.muted', `Зарплата ${formatMoney(c.salary)}/день · найм ${formatMoney(fee)}`),
            h('button.primary', {
              disabled: s.money < fee || s.staff.length >= maxStaff,
              onclick: () => {
                if (!this.buy(fee, `${c.name} теперь в команде!`)) return;
                s.staff.push({ ...c });
                this.game.syncStaff();
                this.render();
              },
            }, 'Нанять')));
      })));
  }

  // ------------------------------------------------------------ навыки
  tree(nodes, owned, { points, onBuy, money = false }) {
    const cols = Math.max(...nodes.map((n) => n.x)) + 1;
    const rows = Math.max(...nodes.map((n) => n.y)) + 1;
    return h('div.tree', { style: { gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, auto)` } },
      nodes.map((n) => {
        const has = owned.includes(n.id);
        const ok = canUnlock(nodes, owned, n);
        const afford = money ? this.s.money >= n.cost : points >= n.cost;
        return h(`div.node${has ? '.has' : ok ? '.ok' : '.lock'}`, { style: { gridColumn: n.x + 1, gridRow: n.y + 1 } },
          h('b', n.name), h('div.desc', n.desc),
          n.req.length ? h('div.req', `нужно: ${n.req.map((r) => nodes.find((x) => x.id === r)?.name).join(', ')}`) : null,
          has ? h('span.badge', 'Изучено') : h('button.primary', { disabled: !ok || !afford, onclick: () => onBuy(n) },
            money ? formatMoney(n.cost) : `${n.cost} очк.`));
      }));
  }

  app_skills() {
    const s = this.s;
    const tab = this.sub.skills || 'player';
    const tabs = h('div.tabs',
      h(`button${tab === 'player' ? '.on' : ''}`, { onclick: () => this.go('skills', 'player') }, `Грумер (${s.points})`),
      h(`button${tab === 'salon' ? '.on' : ''}`, { onclick: () => this.go('skills', 'salon') }, 'Салон'),
      s.staff.map((e) => h(`button${tab === `staff:${e.id}` ? '.on' : ''}`, { onclick: () => this.go('skills', `staff:${e.id}`) }, `${e.name} (${e.points})`)));
    let body;
    if (tab === 'player') {
      body = [h('p.muted', `Уровень ${s.level}. Опыт ${s.xp} / ${xpForLevel(s.level)} — за каждого питомца, которого вы стрижёте сами. Очков: ${s.points}.`),
        this.tree(PLAYER_TREE, s.skills.player, { points: s.points, onBuy: (n) => { s.points -= n.cost; s.skills.player.push(n.id); this.game.audio.play('success'); this.render(); } })];
    } else if (tab === 'salon') {
      body = [h('p.muted', 'Улучшения бизнеса покупаются за деньги.'),
        this.tree(SALON_TREE, s.skills.salon, { money: true, onBuy: (n) => { if (this.buy(n.cost, n.name)) { s.skills.salon.push(n.id); this.render(); } } })];
    } else {
      const e = s.staff.find((x) => `staff:${x.id}` === tab);
      if (!e) {
        this.sub.skills = 'player';
        return this.app_skills();
      }
      body = [h('p.muted', `${e.name}: уровень ${e.level}, очков ${e.points}. Опыт сотрудник получает за каждого питомца.`),
        this.tree(STAFF_TREE, e.skills, { points: e.points, onBuy: (n) => { e.points -= n.cost; e.skills.push(n.id); this.game.audio.play('success'); this.render(); } })];
    }
    return h('div', h('h2', 'Древо навыков'), tabs, body);
  }

  // ------------------------------------------------------------ дизайн
  app_design() {
    const s = this.s;
    const apply = (patch) => {
      s.theme = { ...s.theme, ...patch };
      this.game.rebuildSalonKeepActors();
      this.render();
    };
    return h('div',
      h('h2', 'Дизайн салона'),
      h('p.muted', 'Тема меняет стены, пол, дерево, ткани и фирменный цвет во всех комнатах.'),
      h('div.grid', Object.entries(THEMES).map(([id, t]) => {
        const owned = s.themesOwned.includes(id);
        const active = s.theme.id === id;
        return h(`div.card${active ? '.owned' : ''}`,
          h('div.icon.theme-sw', t.swatch.map((c) => h('i', { style: { background: c } }))),
          h('div.info', h('div.title', t.name), h('div.desc', t.desc),
            h('div.row', h('span.price', t.price ? formatMoney(t.price) : 'бесплатно'),
              active ? h('span.badge', 'Сейчас') : owned ? h('button.mint', { onclick: () => apply({ id, accent: null }) }, 'Применить')
                : h('button.primary', { disabled: s.money < t.price, onclick: () => { if (this.buy(t.price, `Тема «${t.name}»`)) { s.themesOwned.push(id); apply({ id, accent: null }); } } }, 'Купить'))));
      })),
      h('h3', `Фирменный цвет (${formatMoney(ACCENT_PRICE)})`),
      h('div.swatches.big', ACCENTS.map((c) => h(`button.sw${s.theme.accent === c ? '.on' : ''}`, {
        style: { background: c },
        onclick: () => { if (s.theme.accent !== c && this.buy(ACCENT_PRICE, 'Цвет изменён')) apply({ accent: c }); },
      }))));
  }

  // ------------------------------------------------------------ бухгалтерия
  app_finance() {
    const s = this.s;
    const rows = s.finance.slice(-12);
    const max = Math.max(1, ...rows.map((r) => Math.max(r.income + r.tips, r.expenses)));
    const T = s.today;
    return h('div',
      h('h2', 'Бухгалтерия'),
      T ? h('p', h('b', `Сегодня: `), `выручка ${formatMoney(T.income)}, чаевые ${formatMoney(T.tips)}, расходники ${formatMoney(T.supplies || 0)}`) : null,
      h('div.chart', rows.map((r) => h('div.col', { title: `День ${r.day}` },
        h('div.b.in', { style: { height: `${((r.income + r.tips) / max) * 140}px` } }),
        h('div.b.out', { style: { height: `${(r.expenses / max) * 140}px` } }),
        h('small', String(r.day))))),
      h('div.muted', 'Розовые — доходы, серые — расходы (аренда, зарплаты, расходники).'),
      h('table.pc-table', h('tr', h('th', 'День'), h('th', 'Клиентов'), h('th', 'Доход'), h('th', 'Расход'), h('th', 'Итог')),
        [...rows].reverse().map((r) => h('tr', h('td', String(r.day)), h('td', String(r.served)), h('td', formatMoney(r.income + r.tips)),
          h('td', formatMoney(r.expenses)), h('td', h('b', { style: { color: r.income + r.tips - r.expenses >= 0 ? '#1f8a6f' : '#e5484d' } }, formatMoney(r.income + r.tips - r.expenses)))))));
  }

  // ------------------------------------------------------------ картотека
  app_clients() {
    const s = this.s;
    return h('div', h('h2', 'Картотека постоянных клиентов'), h('p.muted', 'Отличная работа (4★ и выше) повышает лояльность и открывает новые факты.'),
      REGULARS.map((r) => {
        const st = s.regulars[r.id];
        const known = st.visits > 0;
        return h('div.regular',
          h(`div.portrait${known ? '' : '.locked'}`, { style: { backgroundImage: `url(portraits/${r.person}.png)` } }),
          h('div', { style: { flex: 1 } },
            h('h4', known ? r.name : '???', known ? h('span.muted', ` · ${r.pet.name}, ${BREEDS[r.pet.breed].name.toLowerCase()}`) : null),
            known ? h('div.hearts', '♥'.repeat(st.loyalty) + '♡'.repeat(5 - st.loyalty), h('span.muted', `  визитов: ${st.visits}`))
              : h('div.muted', s.chapter >= r.chapter ? 'Скоро запишется' : `Появится в главе ${r.chapter}`),
            known ? h('ul', r.bio.map((b, i) => h(`li${st.loyalty >= i ? '' : '.lock'}`, st.loyalty >= i ? b : 'Повышайте лояльность, чтобы узнать больше...'))) : null));
      }));
  }
}
