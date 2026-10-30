'use strict';
(function (G) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  class UI {
    constructor(app) {
      this.app = app; this.cat = null; this.panel = null; this.infoB = null; this.toastT = {};
      this.buildToolbar();
      document.querySelectorAll('.speeds button').forEach(b => b.onclick = () => { this.app.setSpeed(+b.dataset.speed); G.Audio.play('click'); });
      document.querySelectorAll('#side .round').forEach(b => b.onclick = () => { G.Audio.play('click'); this.togglePanel(b.dataset.panel); });
      document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { b.closest('.sheet').id === 'info' ? this.hideInfo() : this.closePanel(); });
      $('cityPill').onclick = () => this.togglePanel('stats');
      $('minimap').onclick = e => {
        const g = this.app.g, mc = $('minimap'), r = mc.getBoundingClientRect();
        const s = mc.width / (g.W * 2), X = (e.clientX - r.left) / r.width * mc.width / s, Y = (e.clientY - r.top) / r.height * mc.height / s;
        const x = (X - g.W + 2 * Y) / 2, y = (2 * Y - X + g.W) / 2;
        this.app.r.centerOn(x, y);
      };
    }
    show(on) { for (const id of ['hud', 'side', 'toolbar', 'questMini', 'minimapWrap']) $(id).classList.toggle('hidden', !on); }

    // ---------- Панель инструментов ----------
    buildToolbar() {
      const tb = $('toolbar'); tb.innerHTML = '';
      for (const c of G.CATS) {
        const b = document.createElement('button'); b.className = 'cat'; b.dataset.cat = c.id;
        b.innerHTML = `<span class="e">${c.icon}</span><span class="l">${c.name}</span>`;
        b.onclick = () => {
          G.Audio.play('click');
          if (c.tool) { this.closeSub(); this.app.setTool(this.app.tool === c.tool ? 'inspect' : c.tool); return; }
          if (this.cat === c.id) this.closeSub(); else this.openSub(c);
        };
        tb.appendChild(b);
      }
    }
    openSub(c) {
      this.cat = c.id; const sm = $('submenu'), g = this.app.g;
      sm.innerHTML = '';
      for (const k of c.tools) {
        const t = G.TOOLS[k], locked = !g.unlocked(k);
        const el = document.createElement('button');
        el.className = 'tool' + (locked ? ' locked' : '') + (this.app.tool === k ? ' on' : '');
        const price = t.cost ? '$' + G.fmt(t.cost) + (t.kind === 'line' || t.kind === 'rect' ? '/кл.' : '') : 'бесплатно';
        el.innerHTML = `${locked ? `<span class="lock">🔒 ур. ${t.unlock}</span>` : ''}<span class="e">${t.icon}</span><span class="n">${t.name}</span><span class="p">${price}</span>`;
        el.title = (t.desc || '') + (t.upkeep ? `\nСодержание: $${t.upkeep}/день` : '');
        el.onclick = () => {
          if (locked) { this.toast(`🔒 ${t.name} откроется на ${t.unlock} уровне`, 'bad'); G.Audio.play('error'); return; }
          G.Audio.play('click'); this.app.setTool(k); this.closeSub();
        };
        sm.appendChild(el);
      }
      sm.classList.remove('hidden'); $('toolhint').classList.add('hidden');
      this.markCats();
    }
    closeSub() { this.cat = null; $('submenu').classList.add('hidden'); this.markCats(); this.updateHint(); }
    markCats() {
      const tc = G.CATS.find(c => (c.tools && c.tools.includes(this.app.tool)) || c.tool === this.app.tool);
      document.querySelectorAll('.cat').forEach(b => b.classList.toggle('on', !!(b.dataset.cat === this.cat || (!this.cat && tc && b.dataset.cat === tc.id))));
    }
    updateHint(extra) {
      const t = this.app.tool, h = $('toolhint');
      if (t === 'inspect' || this.cat) { h.classList.add('hidden'); return; }
      const T = G.TOOLS[t];
      const base = T.kind === 'place' ? `$${G.fmt(T.cost)}` : T.cost ? `$${T.cost}/клетка` : '';
      h.innerHTML = `<span>${T.icon} ${T.name}</span>${extra ? `<b>${extra}</b>` : base ? `<b>${base}</b>` : ''}<button title="Отмена (Esc)">✕</button>`;
      h.querySelector('button').onclick = () => this.app.setTool('inspect');
      h.classList.remove('hidden');
      this.markCats();
    }

    // ---------- HUD ----------
    update() {
      const g = this.app.g, s = g.stats;
      $('cityName').textContent = g.name;
      $('lvl').textContent = g.level;
      $('xpFill').style.width = (g.level >= G.MAX_LEVEL ? 100 : g.xp / G.xpFor(g.level) * 100) + '%';
      $('money').textContent = g.sandbox ? '∞' : G.money(g.money);
      const net = g.budget().net, ne = $('net');
      ne.textContent = (net >= 0 ? '+' : '') + G.fmt(net) + '/д'; ne.className = net >= 0 ? 'pos' : 'neg';
      $('pop').textContent = G.fmt(s.pop);
      const hp = Math.round(s.happy * 100);
      $('happy').textContent = hp + '%';
      $('happyIco').textContent = hp >= 75 ? '😍' : hp >= 60 ? '😊' : hp >= 45 ? '😐' : hp >= 30 ? '😟' : '😡';
      for (const [z, id] of [[1, 'dR'], [2, 'dC'], [3, 'dI']]) {
        const v = s.demand[z], el = $(id);
        if (v >= 0) { el.style.bottom = '50%'; el.style.top = 'auto'; el.style.height = (v * 50) + '%'; }
        else { el.style.top = '50%'; el.style.bottom = 'auto'; el.style.height = (-v * 50) + '%'; el.style.opacity = .55; }
        if (v >= 0) el.style.opacity = 1;
      }
      $('date').textContent = 'День ' + g.day;
      const h = g.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
      $('time').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + (g.festival ? ' 🎉' : '');
      $('clockIco').textContent = h >= 6 && h < 18 ? '☀️' : h >= 18 && h < 21 ? '🌇' : '🌙';
      document.querySelectorAll('.speeds button').forEach(b => b.classList.toggle('on', +b.dataset.speed === g.speed));
      this.updateQuests();
      if (this.panel === 'budget' || this.panel === 'stats' || this.panel === 'quests') this.renderPanel(true);
      if (this.infoB) { if (!g.buildings.has(this.infoB.id)) this.hideInfo(); else this.renderInfo(); }
    }
    updateQuests() {
      const g = this.app.g, act = g.activeQuests(), qm = $('questMini');
      const key = act.join(',');
      const html = act.map(i => {
        const q = G.QUESTS[i], [c, m] = q.p(g);
        return `<div class="qm" data-q="${i}"><div class="t"><span>${q.t}</span><span>$${G.fmt(q.m)}</span></div><div class="pb"><i style="width:${Math.min(100, c / m * 100)}%"></i></div></div>`;
      }).join('');
      if (this._qk !== key) { qm.innerHTML = html; this._qk = key; qm.querySelectorAll('.qm').forEach(e => e.onclick = () => this.togglePanel('quests')); }
      else qm.querySelectorAll('.qm').forEach((e, k) => { const [c, m] = G.QUESTS[act[k]].p(g); e.querySelector('i').style.width = Math.min(100, c / m * 100) + '%'; });
      const b = $('qBadge'); b.textContent = act.length; b.classList.toggle('show', act.length > 0);
    }

    // ---------- Окна ----------
    togglePanel(id) {
      if (this.panel === id) { this.closePanel(); return; }
      this.panel = id; this.renderPanel(); $('panel').classList.remove('hidden');
      document.querySelectorAll('#side .round').forEach(b => b.classList.toggle('on', b.dataset.panel === id));
    }
    closePanel() {
      this.panel = null; $('panel').classList.add('hidden');
      document.querySelectorAll('#side .round').forEach(b => b.classList.remove('on'));
    }
    renderPanel(live) {
      const g = this.app.g, body = $('panelBody'), id = this.panel;
      if (live && document.activeElement && body.contains(document.activeElement) && document.activeElement.type === 'range') return;
      let h = '';
      if (id === 'quests') {
        h = `<h2>📋 Задания</h2><p class="note">Выполняйте задания, чтобы получать деньги и опыт. Новые уровни открывают здания.</p>`;
        const act = g.activeQuests();
        G.QUESTS.forEach((q, i) => {
          if (!g.qDone[i] && !act.includes(i)) return;
          const [c, m] = q.p(g);
          h += `<div class="quest ${g.qDone[i] ? 'done' : ''}"><div class="qt">${q.t}</div>${g.qDone[i] ? '' : `<div class="meter"><i style="width:${Math.min(100, c / m * 100)}%;background:linear-gradient(90deg,#3ddc84,#a6f35b)"></i></div><div class="note">${G.fmt(Math.min(c, m))} / ${G.fmt(m)}</div>`}<div class="qr">Награда: $${G.fmt(q.m)} · ${q.xp} XP</div></div>`;
        });
        const left = G.QUESTS.length - g.qDone.filter(Boolean).length - act.length;
        if (left > 0) h += `<p class="note">…и ещё ${left} заданий впереди</p>`;
      } else if (id === 'budget') {
        const b = g.budget();
        h = `<h2>📊 Бюджет</h2>
          <div class="kv"><span>🏠 Налог с жителей</span><b class="pos">+$${G.fmt(b.inc[1])}</b></div>
          <div class="kv"><span>🏪 Налог с торговли</span><b class="pos">+$${G.fmt(b.inc[2])}</b></div>
          <div class="kv"><span>🏭 Налог с промышленности</span><b class="pos">+$${G.fmt(b.inc[3])}</b></div>
          <div class="kv"><span>🏖️ Туризм (${G.fmt(g.tour.tourists)} чел./день)</span><b class="pos">+$${G.fmt(b.inc[4])}</b></div>
          <div class="kv"><span>🛣️ Содержание дорог</span><b class="neg">−$${G.fmt(b.roads)}</b></div>`;
        const ex = Object.entries(b.exp).sort((a, c) => c[1] - a[1]);
        for (const [k, v] of ex) h += `<div class="kv"><span>${G.BLD[k].icon} ${G.BLD[k].name}</span><b class="neg">−$${G.fmt(v)}</b></div>`;
        h += `<div class="kv" style="border:0;font-size:16px"><span><b>Итого в день</b></span><b class="${b.net >= 0 ? 'pos' : 'neg'}">${b.net >= 0 ? '+' : '−'}$${G.fmt(Math.abs(b.net))}</b></div>`;
        h += `<h3>Налоги</h3>`;
        for (const z of [1, 2, 3]) h += `<div class="slider"><span>${G.ZONE[z].icon} ${G.ZONE[z].name}</span><input type="range" min="0" max="20" value="${g.taxes[z]}" data-tax="${z}"><b>${g.taxes[z]}%</b></div>`;
        h += `<p class="note">Высокие налоги снижают спрос и счастье, низкие — доходы.</p>`;
        h += `<h3>Городской праздник</h3><p class="note">Фейерверки и гуляния: +12% к счастью на 2 дня.</p>
          <button class="btn primary full" id="btnFest" ${g.festival ? 'disabled' : ''}>🎉 Устроить праздник — $${G.fmt(g.festivalCost())}</button>`;
      } else if (id === 'layers') {
        h = `<h2>🗺️ Слои данных</h2><div class="grid2">`;
        for (const o of G.OVERLAYS) h += `<button class="layer ${this.app.r.overlay === o.id ? 'on' : ''}" data-ov="${o.id}"><span>${o.icon}</span>${o.name}</button>`;
        h += `</div><button class="btn full" data-ov="">Выключить слой</button>`;
      } else if (id === 'stats') {
        const s = g.stats, u = g.util;
        h = `<h2>📈 ${esc(g.name)}</h2>
          <div class="kv"><span>Уровень мэра</span><b>${g.level} ${g.level < G.MAX_LEVEL ? `(${G.fmt(g.xp)} / ${G.fmt(G.xpFor(g.level))} XP)` : ''}</b></div>
          <div class="kv"><span>Население</span><b>${G.fmt(s.pop)}</b></div>
          <div class="kv"><span>Рабочие места (торговля / пром.)</span><b>${G.fmt(s.jobsC)} / ${G.fmt(s.jobsI)}</b></div>
          <div class="kv"><span>Занятость</span><b>${Math.round(Math.min(1, (s.jobsC + s.jobsI) / Math.max(1, s.pop * 0.55)) * 100)}%</b></div>
          <div class="kv"><span>Режим</span><b>${g.sandbox ? 'Песочница' : 'Карьера'}</b></div>
          <h3>Население</h3><canvas class="chart" id="chPop" width="680" height="260"></canvas>
          <h3>Казна</h3><canvas class="chart" id="chMoney" width="680" height="260"></canvas>
          <h3>Коммунальные службы</h3>`;
        for (const r of G.RES) {
          const P = u.produced[r] || 0, D = u.demanded[r] || 0, ri = G.RES_INFO[r];
          const pct = P > 0 ? Math.min(100, D / P * 100) : (D > 0 ? 100 : 0);
          h += `<div class="res"><div class="top"><span>${ri.icon} ${ri.name}</span><b>${G.fmt(D)} / ${G.fmt(P)}</b></div><div class="meter"><i style="width:${pct}%;background:${D > P ? 'var(--bad)' : ri.color}"></i></div></div>`;
        }
      } else if (id === 'disasters') {
        const can = g.sandbox || g.level >= 10;
        h = `<h2>🌪️ Бедствия</h2>
          <div class="toggle"><span>Случайные бедствия и пожары</span><button class="switch ${g.disasters ? 'on' : ''}" id="swDis"></button></div>
          <p class="note">${can ? 'Вызовите бедствие вручную — проверьте, готов ли город!' : 'Ручной вызов бедствий откроется на 10 уровне (или в песочнице).'}</p>
          <div class="grid2" style="margin-top:10px">
            <button class="btn" data-dis="fire" ${can ? '' : 'disabled'}>🔥 Пожар</button>
            <button class="btn" data-dis="tornado" ${can ? '' : 'disabled'}>🌪️ Торнадо</button>
            <button class="btn" data-dis="meteor" ${can ? '' : 'disabled'}>☄️ Метеорит</button>
          </div>`;
      } else if (id === 'region') {
        h = this.regionHTML();
      } else if (id === 'settings') {
        h = `<h2>⚙️ Настройки</h2>
          <label class="note">Название города</label>
          <input id="setName" maxlength="24" value="${esc(g.name)}" style="width:100%;font:inherit;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;margin:6px 0 4px">
          <div class="toggle"><span>🔊 Звук</span><button class="switch ${G.Audio.on ? 'on' : ''}" id="swSnd"></button></div>
          <button class="btn full" id="btnSave">💾 Сохранить</button>
          <button class="btn danger full" id="btnNewCity">✨ Новая игра (новый регион)</button>
          <h3>Управление</h3>
          <p class="note">ЛКМ — строить/выбирать · ПКМ или колесо — двигать карту · колесо — масштаб<br>
          WASD/стрелки — камера · Esc — отмена · P — пауза · 1–3 — скорость<br>
          R — дорога · B — снос · Телефон: два пальца — камера и масштаб</p>
          <p class="note">Игра сохраняется автоматически каждый игровой день.</p>`;
      }
      body.innerHTML = h;
      this.bindPanel();
    }
    bindPanel() {
      const g = this.app.g, body = $('panelBody');
      body.querySelectorAll('[data-tax]').forEach(inp => inp.oninput = () => { g.taxes[inp.dataset.tax] = +inp.value; inp.nextElementSibling.textContent = inp.value + '%'; g.updateStats(); });
      const f = $('btnFest'); if (f) f.onclick = () => { g.holdFestival(); this.renderPanel(); };
      body.querySelectorAll('[data-ov]').forEach(b => b.onclick = () => { this.app.setOverlay(b.dataset.ov || null); this.renderPanel(); });
      const sd = $('swDis'); if (sd) sd.onclick = () => { g.disasters = !g.disasters; this.renderPanel(); };
      body.querySelectorAll('[data-dis]').forEach(b => b.onclick = () => {
        const k = b.dataset.dis; this.closePanel();
        if (k === 'fire') g.randomFire(); else if (k === 'tornado') g.startTornado(); else g.dropMeteor();
      });
      const sn = $('setName'); if (sn) sn.onchange = () => { g.name = sn.value.trim() || g.name; this.update(); };
      const ss = $('swSnd'); if (ss) ss.onclick = () => { G.Audio.on = !G.Audio.on; try { localStorage.setItem('gradostroi_snd', G.Audio.on ? '1' : '0'); } catch (e) { } this.renderPanel(); };
      const bs = $('btnSave'); if (bs) bs.onclick = () => { if (g.save()) this.toast('💾 Город сохранён', 'good'); };
      const bn = $('btnNewCity'); if (bn) bn.onclick = () => this.confirm('Начать новую игру? Все города региона будут удалены.', () => this.app.toStart(true));
      this.bindRegion(body);
      if ($('chPop')) { this.chart($('chPop'), g.stats.history.map(h => h.pop).concat([g.stats.pop]), '#5fd16f'); this.chart($('chMoney'), g.stats.history.map(h => h.money).concat([g.money]), '#ffcb47'); }
    }
    // ---------- Регион и торговля ----------
    regionHTML() {
      const g = this.app.g, R = G.Region.data;
      if (!R) return '<h2>🌐 Регион</h2><p class="note">Регион недоступен.</p>';
      G.Region.sync(g);
      const st = c => Object.keys(G.GOODS).map(k => `${G.GOODS[k].icon} ${G.fmt(c.stock[k] || 0)}`).join(' &nbsp;');
      let h = `<h2>🌐 Регион</h2><p class="note">Каждый город может специализироваться: добывать камень, уголь, древесину или принимать туристов — и торговать с соседями. Пока вы в одном городе, остальные живут сами: добывают ресурсы и копят деньги.</p><h3>Города</h3>`;
      for (const c of R.cities) {
        const sp = G.SPECS[c.spec] || G.SPECS.river, here = c.id === g.cityId;
        h += `<div class="cityc ${here ? 'here' : ''}"><div><b>${sp.icon} ${esc(c.name)}</b><div class="note">${sp.name} · ур. ${c.level} · 👥 ${G.fmt(c.pop)} · 💰 ${R.sandbox ? '∞' : G.fmt(c.money)}${c.tourists ? ` · 🧳 ${G.fmt(c.tourists)}` : ''}</div><div class="note">${st(c)}</div></div>${here ? '<span class="here-tag">Вы здесь</span>' : `<button class="btn" data-goto="${c.id}">Перейти</button>`}</div>`;
      }
      const canFound = (g.sandbox || g.level >= G.REGION_LEVEL) && R.cities.length < G.MAX_CITIES;
      h += `<button class="btn primary full" id="btnFound" ${canFound ? '' : 'disabled'}>➕ Основать новый город</button>`;
      if (!canFound) h += `<p class="note">${R.cities.length >= G.MAX_CITIES ? `Максимум ${G.MAX_CITIES} города в регионе.` : `Откроется на ${G.REGION_LEVEL} уровне мэра.`}</p>`;
      const pr = g.production(), plants = [...g.buildings.values()].filter(b => b.type === 'coal' && b.rc >= 0 && !b.ruin).length;
      h += `<h3>Склад: ${esc(g.name)}</h3>`;
      for (const k in G.GOODS) {
        const G1 = G.GOODS[k], use = k === 'coal' ? plants * G.COAL_USE : (g.lastCons[k] || 0);
        h += `<div class="kv"><span>${G1.icon} ${G1.name}</span><b>${G.fmt(g.stock[k] || 0)} <small style="color:var(--good)">+${pr[k]}</small> <small style="color:var(--bad)">−${use}</small></b></div>`;
      }
      h += `<p class="note">Камень и древесина нужны для роста зданий до 2–4 уровня, уголь — топливо для ТЭС (${G.COAL_USE}/день).</p>`;
      h += `<h3>Внешний рынок</h3>`;
      for (const k in G.GOODS) {
        const p = G.GOODS[k].price;
        h += `<div class="mkt"><span>${G.GOODS[k].icon} ${G.GOODS[k].name}</span><button class="btn" data-buy="${k}">Купить 50 · $${G.fmt(p * 50 * 1.6)}</button><button class="btn" data-sell="${k}">Продать 50 · $${G.fmt(p * 50 * 0.6)}</button></div>`;
      }
      h += `<h3>Торговые маршруты</h3>`;
      if (!R.routes.length) h += `<p class="note">Маршрутов нет. Город-получатель платит отправителю $${G.GOODS.stone.price}–${G.GOODS.coal.price} за единицу.</p>`;
      R.routes.forEach((r, i) => {
        const a = G.Region.city(r.from), b = G.Region.city(r.to), G1 = G.GOODS[r.res];
        h += `<div class="route ${r.last === 0 ? 'fail' : ''}"><span>${esc(a ? a.name : '?')} → ${esc(b ? b.name : '?')}: ${G1.icon} ${r.amt}/день · $${G.fmt(r.amt * G1.price)}<br><small class="note">вчера доставлено: ${r.last || 0}</small></span><button data-delroute="${i}" title="Удалить">✕</button></div>`;
      });
      if (R.cities.length >= 2) {
        const opts = R.cities.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        h += `<div class="rform"><select id="rFrom">${opts}</select><select id="rTo">${R.cities.map((c, i) => `<option value="${c.id}" ${i === 1 ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          <select id="rRes">${Object.keys(G.GOODS).map(k => `<option value="${k}">${G.GOODS[k].icon} ${G.GOODS[k].name}</option>`).join('')}</select>
          <select id="rAmt"><option>10</option><option selected>20</option><option>40</option><option>60</option></select></div>
          <button class="btn full" id="btnRoute">🚚 Добавить маршрут</button>`;
      } else h += `<p class="note">Основайте второй город, чтобы торговать между городами.</p>`;
      h += `<h3>Туризм</h3><div class="kv"><span>🧳 Туристов в день</span><b>${G.fmt(g.tour.tourists)}</b></div>
        <div class="kv"><span>⭐ Привлекательность</span><b>${G.fmt(g.tour.attr)}</b></div>
        <div class="kv"><span>🏨 Мест в отелях</span><b>${G.fmt(g.tour.cap)}</b></div>
        <div class="kv"><span>💵 Доход от туристов</span><b class="pos">+$${G.fmt(g.tour.tourists * 3)}/день</b></div>
        <p class="note">Туристов привлекают пляжи, парки и достопримечательности, а размещают отели. Чем больше население региона — тем больше гостей.</p>`;
      return h;
    }
    bindRegion(body) {
      const g = this.app.g;
      body.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => this.app.switchCity(+b.dataset.goto));
      const f = $('btnFound'); if (f) f.onclick = () => this.foundDialog();
      body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
        const k = b.dataset.buy, c = Math.round(G.GOODS[k].price * 50 * 1.6);
        if (!g.canPay(c)) { this.toast('⚠️ Недостаточно денег', 'bad'); G.Audio.play('error'); return; }
        g.pay(c); g.stock[k] += 50; g.recalc(false); G.Audio.play('coin'); this.renderPanel();
      });
      body.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
        const k = b.dataset.sell;
        if ((g.stock[k] || 0) < 50) { this.toast('⚠️ На складе меньше 50', 'bad'); G.Audio.play('error'); return; }
        g.stock[k] -= 50; if (!g.sandbox) g.money += Math.round(G.GOODS[k].price * 50 * 0.6); G.Audio.play('coin'); this.update(); this.renderPanel();
      });
      body.querySelectorAll('[data-delroute]').forEach(b => b.onclick = () => { G.Region.removeRoute(+b.dataset.delroute); this.renderPanel(); });
      const br = $('btnRoute'); if (br) br.onclick = () => {
        const from = +$('rFrom').value, to = +$('rTo').value;
        if (from === to) { this.toast('⚠️ Выберите разные города', 'bad'); return; }
        G.Region.addRoute(from, to, $('rRes').value, +$('rAmt').value); G.Audio.play('quest');
        this.toast('🚚 Маршрут открыт — поставки каждый день', 'good'); this.renderPanel();
      };
    }
    foundDialog() {
      const specs = Object.keys(G.SPECS).map((k, i) => `<button data-v="${k}" class="${i === 2 ? 'on' : ''}">${G.SPECS[k].icon} ${G.SPECS[k].name}</button>`).join('');
      this.modal(`<div class="em">🏗️</div><h1>Новый город</h1>
        <p class="note">Выберите край — от него зависят ресурсы.</p>
        <input id="fName" maxlength="24" value="Город ${G.Region.data.cities.length + 1}" style="width:100%;font:inherit;font-size:16px;padding:12px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;margin:8px 0">
        <div class="seg" id="fSpec">${specs}</div><p class="note" id="fDesc">${G.SPECS.mountains.desc}</p>`,
        '<button class="btn" id="mNo">Отмена</button><button class="btn primary" id="mYes">Основать</button>');
      let spec = 'mountains';
      document.querySelectorAll('#fSpec button').forEach(b => b.onclick = () => { spec = b.dataset.v; document.querySelectorAll('#fSpec button').forEach(x => x.classList.toggle('on', x === b)); $('fDesc').textContent = G.SPECS[spec].desc; });
      $('mNo').onclick = () => this.closeModal();
      $('mYes').onclick = () => { const n = $('fName').value.trim() || 'Новый город'; this.closeModal(); this.app.foundCity(n, spec); };
    }
    chart(cv, data, col) {
      const x = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 24;
      x.clearRect(0, 0, W, H);
      if (data.length < 2) { x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '24px Rubik, sans-serif'; x.textAlign = 'center'; x.fillText('Данные появятся через пару дней', W / 2, H / 2); return; }
      const mn = Math.min(0, ...data), mx = Math.max(...data, 1);
      const px = i => pad + i / (data.length - 1) * (W - pad * 2), py = v => H - pad - (v - mn) / (mx - mn || 1) * (H - pad * 2);
      const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, G.alpha(col, 0.45)); gr.addColorStop(1, G.alpha(col, 0));
      x.beginPath(); x.moveTo(px(0), H - pad); data.forEach((v, i) => x.lineTo(px(i), py(v))); x.lineTo(px(data.length - 1), H - pad); x.fillStyle = gr; x.fill();
      x.beginPath(); data.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))); x.strokeStyle = col; x.lineWidth = 4; x.lineJoin = 'round'; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '22px Rubik, sans-serif'; x.textAlign = 'right'; x.fillText(G.fmt(mx), W - pad, pad + 6);
    }

    // ---------- Информация о здании ----------
    showInfo(b) { this.infoB = b; this.app.r.sel = b; $('info').classList.remove('hidden'); this.renderInfo(); }
    hideInfo() { this.infoB = null; this.app.r.sel = null; $('info').classList.add('hidden'); }
    renderInfo() {
      const g = this.app.g, b = this.infoB, i = g.idx(b.x, b.y);
      let h = '<div class="binfo">';
      const pct = v => Math.round(v * 100) + '%';
      const meter = (v, col) => `<div class="meter"><i style="width:${v * 100}%;background:${col}"></i></div>`;
      if (b.ruin) {
        h += `<div class="head"><span class="big">🏚️</span><div><h2 style="margin:0">Руины</h2><div class="note">Расчистятся сами через пару дней или снесите их</div></div></div>`;
      } else if (b.zone) {
        const Z = G.ZONE[b.zone], names = { 1: ['', 'Домик', 'Таунхаус', 'Многоэтажка', 'Небоскрёб'], 2: ['', 'Магазин', 'Офисный центр', 'Бизнес-башня'], 3: ['', 'Мастерская', 'Завод', 'Комбинат'] };
        const cap = G.CAP[b.zone][b.lvl];
        h += `<div class="head"><span class="big">${Z.icon}</span><div><h2 style="margin:0">${names[b.zone][b.lvl]}</h2><div class="stars">${'★'.repeat(b.lvl)}${'☆'.repeat(Z.max - b.lvl)}</div><div class="note">${Z.name} зона</div></div></div>`;
        if (b.construct > 0) h += `<p class="note">🏗️ Идёт строительство…</p>`;
        else if (b.abandoned) h += `<p class="note" style="color:var(--bad)">🏚️ Здание заброшено — восстановите коммуникации</p>`;
        h += `<div class="kv"><span>${b.zone === 1 ? '👥 Жители' : '💼 Работники'}</span><b>${b.occ} / ${cap}</b></div>`;
        h += `<div class="needs">`;
        const need = G.needsFor(b.lvl);
        for (const r of G.RES) h += `<span class="${need.includes(r) ? (b[r] ? '' : 'no') : (b[r] ? 'na' : 'na')}">${G.RES_INFO[r].icon} ${need.includes(r) ? (b[r] ? '✓' : '✗') : '—'}</span>`;
        h += `</div>`;
        h += `<div class="kv"><span>😊 Счастье</span><b>${pct(b.happy || 0)}</b></div>${meter(b.happy || 0, 'var(--good)')}`;
        h += `<div class="kv"><span>💎 Стоимость земли</span><b>${pct(g.lv[i])}</b></div>${meter(g.lv[i], '#60a5fa')}`;
        h += `<div class="kv"><span>☁️ Загрязнение</span><b>${pct(g.pol[i])}</b></div><div class="kv"><span>🦹 Преступность</span><b>${pct(g.crime[i])}</b></div>`;
        const hints = [];
        for (const r of need) if (!b[r]) hints.push(`нужно: ${G.RES_INFO[r].name.toLowerCase()} — постройте источник у дороги`);
        if (b.rc < 0) hints.push('нет доступа к дороге');
        if (!b.construct && b.lvl < Z.max && !hints.length) {
          const nn = G.needsFor(b.lvl + 1).filter(r => !b[r]);
          if (nn.length) hints.push('для роста нужно: ' + nn.map(r => G.RES_INFO[r].name.toLowerCase()).join(', '));
          else if (g.lv[i] < 0.5) hints.push('для роста повысьте стоимость земли (парки, школы, вода рядом)');
          const mat = G.MAT[b.lvl + 1];
          if (mat && !g.sandbox && Object.keys(mat).some(k => g.stock[k] < mat[k])) hints.push('не хватает стройматериалов (' + Object.keys(mat).map(k => G.GOODS[k].icon + ' ' + G.GOODS[k].name.toLowerCase()).join(', ') + ') — добывайте или покупайте в 🌐 Регионе');
        }
        if (hints.length) h += `<p class="note">💡 ${hints.join('<br>💡 ')}</p>`;
      } else {
        const d = G.BLD[b.type];
        h += `<div class="head"><span class="big">${d.icon}</span><div><h2 style="margin:0">${d.name}</h2><div class="note">${d.desc}</div></div></div>`;
        h += `<div class="kv"><span>Содержание</span><b class="neg">$${d.upkeep}/день</b></div>`;
        h += `<div class="kv"><span>Подключено к дорогам</span><b class="${b.rc >= 0 ? 'pos' : 'neg'}">${b.rc >= 0 ? 'Да' : 'Нет — постройте дорогу рядом'}</b></div>`;
        if (d.provides) for (const r in d.provides) h += `<div class="kv"><span>${G.RES_INFO[r].icon} Производит</span><b>${d.provides[r]}</b></div>`;
        if (d.service) h += `<div class="kv"><span>Радиус охвата</span><b>${d.service.r} клеток</b></div>`;
        if (d.extract) h += `<div class="kv"><span>${G.GOODS[d.extract.res].icon} Добыча</span><b>${b.rc >= 0 ? g.extractAt(b.type, b.x, b.y) : 0} / день</b></div><p class="note">Склад: ${G.fmt(g.stock[d.extract.res])}. Излишки можно продать или отправить соседям (🌐 Регион).</p>`;
        if (d.hotel) h += `<div class="kv"><span>🏨 Мест для туристов</span><b>${d.hotel}</b></div>`;
        if (d.tourism) h += `<div class="kv"><span>⭐ Привлекательность</span><b>+${d.tourism}</b></div>`;
        if (b.type === 'coal') h += `<div class="kv"><span>⚫ Уголь на складе</span><b class="${g.stock.coal > 0 ? '' : 'neg'}">${G.fmt(g.stock.coal)} (−${G.COAL_USE}/день)</b></div>${b.noFuel ? '<p class="note" style="color:var(--bad)">Нет угля — станция стоит! Купите уголь в 🌐 Регионе.</p>' : ''}`;
      }
      if (b.fire) h += `<button class="btn primary full" id="ibFire">🚒 Потушить пожар${g.cov.fire[i] > 0 ? '' : ' ($250)'}</button>`;
      if (b.crimeT) h += `<button class="btn primary full" id="ibCrime">🚓 Вызвать полицию</button>`;
      if (!b.ruin) h += `<button class="btn full" id="ibMove">🚚 Переместить</button>`;
      h += `<button class="btn danger full" id="ibDel">🧨 Снести ($${5 * b.w * b.h})</button></div>`;
      $('infoBody').innerHTML = h;
      const f = $('ibFire'); if (f) f.onclick = () => { this.app.g.extinguish(b); this.renderInfo(); };
      const c = $('ibCrime'); if (c) c.onclick = () => { this.app.g.solveCrime(b); this.renderInfo(); };
      const mv = $('ibMove'); if (mv) mv.onclick = () => { this.app.setTool('move'); this.app.moving = b; this.toast('🚚 Выберите новое место', '', null, null, 2000); };
      $('ibDel').onclick = () => { g.applyRect('bulldoze', [[b.x, b.y]]); G.Audio.play('bulldoze'); this.hideInfo(); };
    }

    // ---------- Уведомления ----------
    toast(text, cls, onClick, key, ms) {
      if (key) { const now = performance.now(); if (this.toastT[key] && now - this.toastT[key] < 6000) return; this.toastT[key] = now; }
      const box = $('toasts');
      while (box.children.length > 3) box.firstChild.remove();
      const t = document.createElement('div'); t.className = 'toast ' + (cls || ''); t.innerHTML = text;
      if (onClick) t.onclick = onClick;
      box.appendChild(t);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 360); }, ms || 3200);
    }
    modal(html, btn, cb) {
      if (!$('modal').classList.contains('hidden')) { (this.mq = this.mq || []).push([html, btn, cb]); return; }
      $('modalCard').innerHTML = html + `<div class="row" style="margin-top:16px">${btn || '<button class="btn primary" id="mOk">Отлично!</button>'}</div>`;
      $('modal').classList.remove('hidden');
      const ok = $('mOk'); if (ok) ok.onclick = () => { this.closeModal(); if (cb) cb(); };
    }
    closeModal() {
      $('modal').classList.add('hidden');
      if (this.mq && this.mq.length) { const [h, b, c] = this.mq.shift(); setTimeout(() => this.modal(h, b, c), 150); }
    }
    confirm(text, yes) {
      this.modal(`<div class="em">🤔</div><p>${text}</p>`, '<button class="btn" id="mNo">Отмена</button><button class="btn danger" id="mYes">Да</button>');
      $('mNo').onclick = () => this.closeModal();
      $('mYes').onclick = () => { this.closeModal(); yes(); };
    }
    levelUp(lvl, unlocked, bonus) {
      const items = unlocked.map(k => `<span>${G.TOOLS[k].icon} ${G.TOOLS[k].name}</span>`).join('');
      this.modal(`<div class="em">🏆</div><h1>Уровень ${lvl}!</h1><p class="note">Мэр растёт вместе с городом. Бонус: <b style="color:var(--accent)">$${G.fmt(bonus)}</b></p>${items ? `<h3 style="color:var(--muted);font-size:13px;letter-spacing:1px">ОТКРЫТО</h3><div class="unl">${items}</div>` : ''}`);
      if (this.cat) { const c = G.CATS.find(c => c.id === this.cat); this.openSub(c); }
    }
  }
  G.UI = UI;
})(window.G);
