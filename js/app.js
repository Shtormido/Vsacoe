/* =========================================================
   MP3UP — логика приложения
   ========================================================= */
'use strict';

(() => {
  /* ---------- Утилиты ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  function fmtLong(sec) {
    const m = Math.round((sec || 0) / 60);
    if (m < 60) return `${m} мин`;
    return `${Math.floor(m / 60)} ч ${m % 60} мин`;
  }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  const tracksWord = (n) => `${n} ${plural(n, 'трек', 'трека', 'треков')}`;
  const hashHue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 360; };
  function shuffleArr(a) {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const LS = {
    get(k, d) { try { const v = localStorage.getItem('mp3up.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('mp3up.' + k, JSON.stringify(v)); } catch { /* приватный режим */ } },
  };

  const UNKNOWN_ARTIST = 'Неизвестный исполнитель';
  const AUDIO_RE = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|webm)$/i;
  const MOBILE = () => matchMedia('(max-width: 760px)').matches;
  const Native = window.MP3UPAndroid || null; // мост в Android-приложении
  if (Native) document.documentElement.classList.add('is-android');

  /* ---------- Состояние ---------- */
  const S = {
    tracks: new Map(),   // медиатека: свои файлы и сохранённые онлайн-треки
    remote: new Map(),   // онлайн-треки Audius, которые встречались в этой сессии
    playlists: new Map(),
    queue: [],        // текущий порядок воспроизведения (id)
    baseQueue: [],    // исходный порядок (для выключения перемешивания)
    qi: -1,
    ctxKey: '',       // что сейчас играет: 'album:…', 'playlist:…', 'wave', …
    ctxLabel: '',
    wave: false,
    current: null,
    counted: false,
    shuffle: LS.get('shuffle', false),
    repeat: LS.get('repeat', 'off'), // off | all | one
    libSort: LS.get('libSort', 'added'),
    q: '',
    view: null,
    queueOpen: false,
    npOpen: false,
  };

  const audioMain = $('#audio');   // идёт через Web Audio: эквалайзер и визуализатор
  const audioRaw = new Audio();    // для источников без CORS (Jamendo) — в обход Web Audio
  audioRaw.preload = 'auto';
  let audio = audioMain;           // активный элемент
  const coverCache = new Map();

  /* ---------- Данные медиатеки ---------- */
  const artistOf = (t) => t.artist || UNKNOWN_ARTIST;
  const allTracks = () => [...S.tracks.values()];
  const likedTracks = () => allTracks().filter((t) => t.liked).sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0));

  const getTrack = (id) => S.tracks.get(id) || S.remote.get(id);
  const hasTrack = (id) => S.tracks.has(id) || S.remote.has(id);
  const isRemote = (t) => !!t && !!t.source;
  const isExt = (t) => !!t && (t.source === 'spotify' || t.source === 'youtube'); // играют во внешнем плеере
  let ext = null; // активный внешний движок (Spotify / YouTube) или null

  function coverUrl(t, small) {
    if (!t) return null;
    if (!t.cover) return (small && t.artSmall) || t.art || null;
    let u = coverCache.get(t.id);
    if (!u) { u = URL.createObjectURL(t.cover); coverCache.set(t.id, u); }
    return u;
  }
  function colorOf(t) {
    if (t && t.color) return t.color;
    return { h: hashHue(t ? artistOf(t) + (t.album || '') : 'mp3up'), s: 55, l: 45 };
  }
  const cssColor = (c, a = 1) => `hsl(${c.h} ${c.s}% ${c.l}% / ${a})`;

  function coverHTML(t, cls = '') {
    const u = coverUrl(t, cls === 'sm' || cls === 'xs');
    if (u) return `<img class="cover ${cls}" src="${esc(u)}" alt="" loading="lazy" draggable="false">`;
    return `<div class="cover ph ${cls}" style="--h:${hashHue(t ? artistOf(t) + (t.album || t.title) : '')}">${ic('note')}</div>`;
  }

  function sortTracks(list, by) {
    const a = [...list];
    switch (by) {
      case 'title': a.sort((x, y) => collator.compare(x.title, y.title)); break;
      case 'artist': a.sort((x, y) => collator.compare(artistOf(x), artistOf(y)) || collator.compare(x.album || '', y.album || '') || (x.trackNo || 0) - (y.trackNo || 0)); break;
      case 'plays': a.sort((x, y) => (y.plays || 0) - (x.plays || 0) || (y.lastPlayed || 0) - (x.lastPlayed || 0)); break;
      case 'duration': a.sort((x, y) => (y.duration || 0) - (x.duration || 0)); break;
      default: a.sort((x, y) => y.addedAt - x.addedAt);
    }
    return a;
  }

  function getAlbums() {
    const m = new Map();
    for (const t of S.tracks.values()) {
      if (!t.album) continue;
      const key = norm(t.album);
      let a = m.get(key);
      if (!a) { a = { key, name: t.album, tracks: [], artists: new Map() }; m.set(key, a); }
      a.tracks.push(t);
      const ar = t.albumArtist || artistOf(t);
      a.artists.set(ar, (a.artists.get(ar) || 0) + 1);
    }
    for (const a of m.values()) {
      a.artist = a.artists.size > 2 ? 'Разные исполнители' : [...a.artists.keys()].join(', ');
      a.tracks.sort((x, y) => (x.trackNo || 999) - (y.trackNo || 999) || collator.compare(x.title, y.title));
      a.coverTrack = a.tracks.find((t) => t.cover || t.art) || a.tracks[0];
      a.addedAt = Math.max(...a.tracks.map((t) => t.addedAt));
      a.plays = a.tracks.reduce((s, t) => s + (t.plays || 0), 0);
      a.year = a.tracks.find((t) => t.year)?.year || '';
    }
    return [...m.values()];
  }
  const findAlbum = (name) => getAlbums().find((a) => a.key === norm(name));

  function getArtists() {
    const m = new Map();
    for (const t of S.tracks.values()) {
      const name = artistOf(t);
      const key = norm(name);
      let a = m.get(key);
      if (!a) { a = { key, name, tracks: [] }; m.set(key, a); }
      a.tracks.push(t);
    }
    for (const a of m.values()) {
      a.coverTrack = a.tracks.find((t) => t.cover || t.art) || a.tracks[0];
      a.plays = a.tracks.reduce((s, t) => s + (t.plays || 0), 0);
      a.albums = new Set(a.tracks.filter((t) => t.album).map((t) => norm(t.album))).size;
    }
    return [...m.values()];
  }
  const findArtist = (name) => getArtists().find((a) => a.key === norm(name));

  const playlistTracks = (p) => p.trackIds.map((id) => S.tracks.get(id)).filter(Boolean);

  function playlistCover(p, cls = '') {
    const seen = new Set();
    const urls = [];
    for (const t of playlistTracks(p)) {
      const k = t.album ? norm(t.album) : t.id;
      if (!coverUrl(t) || seen.has(k)) continue;
      seen.add(k); urls.push(coverUrl(t));
      if (urls.length === 4) break;
    }
    if (urls.length === 4) return `<div class="cover collage ${cls}">${urls.map((u) => `<img src="${u}" alt="" draggable="false">`).join('')}</div>`;
    if (urls.length) return `<img class="cover ${cls}" src="${urls[0]}" alt="" draggable="false">`;
    return `<div class="cover ph ${cls}" style="--h:${hashHue(p.name)}">${ic('list')}</div>`;
  }
  const likedCover = (cls = '') => `<div class="cover liked-cover ${cls}">${ic('heart-fill')}</div>`;
  const waveCover = (cls = '') => `<div class="cover wave-cover ${cls}">${ic('wave')}</div>`;

  function filterTracks(list, q) {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    if (!tokens.length) return list;
    return list.filter((t) => {
      const hay = norm(`${t.title} ${artistOf(t)} ${t.album || ''} ${t.genre || ''}`);
      return tokens.every((tok) => hay.includes(tok));
    });
  }

  /* ---------- Уведомления ---------- */
  function toast(msg, type = 'info', ms = 3000) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const icon = type === 'ok' ? ic('check') : type === 'warn' ? ic('close') : type === 'load' ? '<span class="spin"></span>' : ic('note');
    el.innerHTML = `${icon}<span></span>`;
    el.lastChild.textContent = msg;
    $('#toasts').append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    let timer;
    const close = () => { clearTimeout(timer); el.classList.remove('show'); setTimeout(() => el.remove(), 300); };
    if (ms) timer = setTimeout(close, ms);
    return { close, update: (m) => { el.lastChild.textContent = m; } };
  }

  /* ---------- Модальные окна ---------- */
  let modalStack = [];
  function openModal(html, { onDismiss, cls = '' } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    $('#modalRoot').append(back);
    requestAnimationFrame(() => back.classList.add('show'));
    const m = {
      el: back.firstElementChild,
      closed: false,
      close(silent) {
        if (m.closed) return;
        m.closed = true;
        modalStack = modalStack.filter((x) => x !== m);
        back.classList.remove('show');
        setTimeout(() => back.remove(), 220);
        if (!silent && onDismiss) onDismiss();
      },
    };
    back.addEventListener('mousedown', (e) => { if (e.target === back) m.close(); });
    modalStack.push(m);
    closeMenu();
    return m;
  }

  function askText(title, { placeholder = '', value = '', ok = 'Создать' } = {}) {
    return new Promise((resolve) => {
      const m = openModal(`
        <h3>${esc(title)}</h3>
        <input class="input" id="mInput" maxlength="80" placeholder="${esc(placeholder)}" value="${esc(value)}">
        <div class="modal-actions">
          <button class="btn btn-ghost" data-m="cancel">Отмена</button>
          <button class="btn btn-primary" data-m="ok">${esc(ok)}</button>
        </div>`, { onDismiss: () => resolve(null) });
      const input = $('#mInput', m.el);
      setTimeout(() => { input.focus(); input.select(); }, 30);
      const done = () => {
        const v = input.value.trim();
        if (!v) { input.classList.remove('err'); void input.offsetWidth; input.classList.add('err'); input.focus(); return; }
        m.close(true); resolve(v);
      };
      m.el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-m]')?.dataset.m;
        if (a === 'ok') done();
        if (a === 'cancel') m.close();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
    });
  }

  function confirmBox(title, text, ok = 'Удалить') {
    return new Promise((resolve) => {
      const m = openModal(`
        <h3>${esc(title)}</h3>
        <p class="m-text">${esc(text)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-m="cancel">Отмена</button>
          <button class="btn btn-danger" data-m="ok">${esc(ok)}</button>
        </div>`, { onDismiss: () => resolve(false) });
      m.el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-m]')?.dataset.m;
        if (a === 'cancel') m.close();
        if (a === 'ok') { m.close(true); resolve(true); }
      });
      setTimeout(() => $('[data-m="ok"]', m.el).focus(), 30);
    });
  }

  /* ---------- Контекстное меню ---------- */
  let menuItems = [];
  function openMenu(x, y, items) {
    const menu = $('#menu');
    menuItems = items;
    menu.innerHTML = items.map((it, i) => {
      if (it === 'sep') return '<div class="menu-sep"></div>';
      if (it.header) return `<div class="menu-head">${esc(it.label)}</div>`;
      return `<button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}" role="menuitem">${ic(it.icon || 'note')}<span>${esc(it.label)}</span></button>`;
    }).join('');
    menu.style.left = '0px'; menu.style.top = '0px';
    menu.classList.add('show');
    const r = menu.getBoundingClientRect();
    const left = clamp(x, 8, innerWidth - r.width - 8);
    const top = y + r.height > innerHeight - 8 ? Math.max(8, y - r.height) : y;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.transformOrigin = `${x - left}px ${y - top}px`;
    menu._at = { x, y };
  }
  function closeMenu() { $('#menu').classList.remove('show'); }
  const menuOpen = () => $('#menu').classList.contains('show');

  function servicesMenu(t, x, y) {
    const query = [t.artist, t.title].filter(Boolean).join(' ');
    openMenu(x, y, [
      { header: true, label: 'Найти в сервисе' },
      ...serviceLinks(query).map((sv) => ({ icon: 'share', label: sv.name, action: () => window.open(sv.url, '_blank', 'noopener') })),
    ]);
  }

  function trackMenu(id, x, y, ctx = {}) {
    const t = getTrack(id);
    if (!t) return;
    const findElsewhere = { icon: 'search', label: 'Найти в других сервисах…', action: () => { servicesMenu(t, x, y); return 'keep'; } };
    if (isExt(t)) {
      openMenu(x, y, [
        { icon: 'play', label: 'Слушать', action: () => playIds([id], 0, t.title) },
        { icon: 'share', label: `Открыть в ${SOURCES[t.source].name}`, action: () => window.open(t.permalink, '_blank', 'noopener') },
        { icon: 'search', label: 'Ещё у исполнителя', action: () => { ON.source = t.source; go('online', t.artist || t.title); } },
        'sep', findElsewhere,
      ]);
      return;
    }
    if (!S.tracks.has(id)) { // онлайн-трек, ещё не в медиатеке
      openMenu(x, y, [
        { icon: 'play', label: 'Слушать', action: () => playIds([id], 0, t.title) },
        { icon: 'next-up', label: 'Играть следующим', action: () => queueNext([id]) },
        { icon: 'queue', label: 'Добавить в очередь', action: () => queueAdd([id]) },
        { icon: 'plus', label: 'Добавить в плейлист…', action: () => { playlistPicker([id], x, y); return 'keep'; } },
        'sep',
        { icon: 'heart', label: 'Добавить в «Любимые»', action: () => toggleLike(id) },
        { icon: 'library', label: 'Сохранить в медиатеку', action: () => saveRemote([id]) },
        ...(t.iaId ? [{ icon: 'disc', label: 'Открыть альбом', action: () => go('ia', t.iaId) }] : []),
        { icon: 'search', label: 'Ещё треки исполнителя', action: () => { ON.source = t.source; go('online', artistOf(t)); } },
        { icon: 'share', label: `Открыть на ${SOURCES[t.source]?.name || 'сайте'}`, action: () => window.open(t.permalink, '_blank', 'noopener') },
        findElsewhere,
      ]);
      return;
    }
    const items = [
      { icon: 'play', label: 'Слушать', action: () => playIds([id], 0, t.title) },
      { icon: 'next-up', label: 'Играть следующим', action: () => queueNext([id]) },
      { icon: 'queue', label: 'Добавить в очередь', action: () => queueAdd([id]) },
      { icon: 'plus', label: 'Добавить в плейлист…', action: () => { playlistPicker([id], x, y); return 'keep'; } },
      'sep',
      { icon: t.liked ? 'heart-fill' : 'heart', label: t.liked ? 'Убрать из «Любимых»' : 'Добавить в «Любимые»', action: () => toggleLike(id) },
      { icon: 'user', label: 'Перейти к исполнителю', action: () => go('artist', artistOf(t)) },
    ];
    if (t.album) items.push({ icon: 'disc', label: 'Перейти к альбому', action: () => go('album', t.album) });
    items.push(findElsewhere);
    items.push({ icon: 'edit', label: 'Изменить название…', action: () => editTrack(id) });
    if (isRemote(t)) items.push({ icon: 'share', label: `Открыть на ${SOURCES[t.source]?.name || 'сайте'}`, action: () => window.open(t.permalink, '_blank', 'noopener') });
    if (ctx.playlistId) items.push('sep', { icon: 'close', label: 'Убрать из этого плейлиста', action: () => removeFromPlaylist(ctx.playlistId, id) });
    items.push('sep', { icon: 'trash', label: 'Удалить из медиатеки', danger: true, action: () => deleteTracks([id]) });
    openMenu(x, y, items);
  }

  function playlistPicker(ids, x, y) {
    const pls = [...S.playlists.values()].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    openMenu(x, y, [
      { header: true, label: 'Добавить в плейлист' },
      { icon: 'plus', label: 'Новый плейлист…', action: async () => {
        const name = await askText('Новый плейлист', { placeholder: 'Например, «В дорогу»' });
        if (!name) return;
        const p = await createPlaylist(name);
        addToPlaylist(p.id, ids);
      } },
      ...(pls.length ? ['sep'] : []),
      ...pls.map((p) => ({ icon: 'list', label: p.name, action: () => addToPlaylist(p.id, ids) })),
    ]);
  }

  /* ---------- Импорт музыки ---------- */
  function parseFileName(name) {
    const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\d{1,3}\s*[.\-)]\s+/, '').trim();
    const i = base.indexOf(' - ');
    return i > 0 ? { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() } : { artist: '', title: base };
  }

  function readDuration(blob) {
    return new Promise((resolve) => {
      const a = new Audio();
      const url = URL.createObjectURL(blob);
      const done = (d) => { URL.revokeObjectURL(url); a.removeAttribute('src'); resolve(isFinite(d) ? d : 0); };
      const timer = setTimeout(() => done(0), 8000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { clearTimeout(timer); done(a.duration); };
      a.onerror = () => { clearTimeout(timer); done(0); };
      a.src = url;
    });
  }

  async function dominantColor(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = c.height = 24;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(bmp, 0, 0, 24, 24);
      bmp.close?.();
      const d = x.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        const max = Math.max(R, G, B), min = Math.min(R, G, B);
        if (max < 20 || min > 240) continue;
        const w = (max - min) / 255 + 0.08; // насыщенные пиксели важнее
        r += R * w; g += G * w; b += B * w; n += w;
      }
      if (!n) return null;
      r /= n * 255; g /= n * 255; b /= n * 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const dd = max - min;
        s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
        if (max === r) h = (g - b) / dd + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / dd + 2;
        else h = (r - g) / dd + 4;
        h *= 60;
      }
      return { h: Math.round(h), s: Math.round(clamp(s * 100, 30, 80)), l: Math.round(clamp(l * 100, 38, 55)) };
    } catch { return null; }
  }

  let importing = false;
  async function importFiles(files) {
    files = [...files].filter((f) => f && (AUDIO_RE.test(f.name) || (f.type || '').startsWith('audio/')));
    if (!files.length) { toast('Аудиофайлы не найдены. Подойдут MP3, M4A, FLAC, OGG, WAV', 'warn', 4500); return []; }
    if (importing) { toast('Подождите, предыдущие файлы ещё добавляются', 'info'); return []; }
    importing = true;
    navigator.storage?.persist?.().catch(() => {});
    const known = new Map(allTracks().map((t) => [t.fileKey, t.id]));
    const ids = [];
    const base = Date.now();
    let added = 0, skipped = 0, failed = 0;
    const progress = files.length > 1 ? toast(`Добавляем музыку… 0 из ${files.length}`, 'load', 0) : null;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const fileKey = `${f.name}|${f.size}`;
      if (known.has(fileKey)) { skipped++; ids.push(known.get(fileKey)); continue; }
      try {
        const tags = await Tags.parse(f);
        const fromName = parseFileName(f.name);
        const t = {
          id: uid(),
          title: tags.title || fromName.title || f.name,
          artist: tags.artist || fromName.artist || '',
          albumArtist: tags.albumArtist || '',
          album: tags.album || '',
          year: tags.year || '',
          genre: tags.genre || '',
          trackNo: parseInt(tags.track, 10) || 0,
          duration: await readDuration(f),
          cover: tags.picture || null,
          color: null,
          addedAt: base - i,
          plays: 0, lastPlayed: 0, liked: false, likedAt: 0,
          size: f.size, fileKey,
        };
        if (t.cover) t.color = await dominantColor(t.cover);
        await DB.put('files', { id: t.id, blob: f });
        await DB.put('tracks', t);
        S.tracks.set(t.id, t);
        known.set(fileKey, t.id);
        ids.push(t.id);
        added++;
      } catch (e) {
        console.error('Не удалось добавить', f.name, e);
        failed++;
      }
      progress?.update(`Добавляем музыку… ${i + 1} из ${files.length}`);
    }
    progress?.close();
    importing = false;
    if (added) toast(`Готово! Добавлено: ${tracksWord(added)}${skipped ? ` · уже были: ${skipped}` : ''}`, 'ok', 3500);
    else if (failed) toast('Не получилось сохранить файлы. Возможно, закончилось место в браузере', 'warn', 5000);
    else toast('Эти треки уже есть в медиатеке', 'info');
    if (failed && added) toast(`Не удалось добавить файлов: ${failed}`, 'warn', 4000);
    renderAll();
    return ids;
  }

  async function filesFromDrop(dt) {
    // webkitGetAsEntry нужно вызвать синхронно, до любых await
    const entries = [...(dt.items || [])].map((it) => (it.kind === 'file' && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    const plain = [...(dt.files || [])];
    if (!entries.length) return plain;
    const out = [];
    const walk = async (entry) => {
      if (entry.isFile) {
        const f = await new Promise((res) => entry.file(res, () => res(null)));
        if (f) out.push(f);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res) => reader.readEntries(res, () => res([])));
          for (const e of batch) await walk(e);
        } while (batch.length);
      }
    };
    for (const e of entries) await walk(e);
    return out;
  }

  /* ---------- Плейлисты, «Любимые», удаление ---------- */
  async function createPlaylist(name) {
    const p = { id: uid(), name, trackIds: [], createdAt: Date.now(), updatedAt: Date.now() };
    S.playlists.set(p.id, p);
    await DB.put('playlists', p);
    renderSidebar();
    return p;
  }
  async function savePlaylist(p) {
    p.updatedAt = Date.now();
    await DB.put('playlists', p);
  }
  async function addToPlaylist(pid, ids) {
    const p = S.playlists.get(pid);
    if (!p) return;
    await saveRemote(ids.filter((id) => !S.tracks.has(id)), { silent: true });
    const fresh = ids.filter((id) => !p.trackIds.includes(id));
    if (!fresh.length) { toast(`Уже есть в «${p.name}»`, 'info'); return; }
    p.trackIds.push(...fresh);
    await savePlaylist(p);
    toast(`Добавлено в «${p.name}»`, 'ok');
    renderAll();
  }
  async function removeFromPlaylist(pid, id) {
    const p = S.playlists.get(pid);
    if (!p) return;
    p.trackIds = p.trackIds.filter((x) => x !== id);
    await savePlaylist(p);
    toast(`Убрано из «${p.name}»`, 'ok');
    renderAll();
  }
  async function newPlaylistFlow(openAfter = true) {
    const name = await askText('Новый плейлист', { placeholder: 'Например, «Для пробежки»' });
    if (!name) return null;
    const p = await createPlaylist(name);
    toast(`Плейлист «${name}» создан`, 'ok');
    if (openAfter) go('playlist', p.id);
    return p;
  }
  async function renamePlaylist(pid) {
    const p = S.playlists.get(pid);
    if (!p) return;
    const name = await askText('Переименовать плейлист', { value: p.name, ok: 'Сохранить' });
    if (!name) return;
    p.name = name;
    await savePlaylist(p);
    renderAll();
  }
  async function deletePlaylist(pid) {
    const p = S.playlists.get(pid);
    if (!p) return;
    if (!await confirmBox('Удалить плейлист?', `Плейлист «${p.name}» будет удалён. Сами треки останутся в медиатеке.`)) return;
    S.playlists.delete(pid);
    await DB.del('playlists', pid);
    toast('Плейлист удалён', 'ok');
    if (S.view?.name === 'playlist') go('library', 'playlists');
    else renderAll();
  }

  async function toggleLike(id) {
    const t = getTrack(id || S.current);
    if (!t) return;
    if (isExt(t)) { toast(`Добавляйте в любимое в самом ${SOURCES[t.source].name}`, 'info'); return; }
    t.liked = !t.liked;
    t.likedAt = t.liked ? Date.now() : 0;
    if (S.tracks.has(t.id)) await DB.put('tracks', t);
    else await saveRemote([t.id], { silent: true });
    toast(t.liked ? 'Добавлено в «Любимые треки»' : 'Убрано из «Любимых треков»', t.liked ? 'ok' : 'info', 1800);
    if (S.view?.name === 'liked' || S.view?.name === 'home') render();
    else updateLikeUI();
    renderSidebar();
  }

  async function deleteTracks(ids) {
    const t = getTrack(ids[0]);
    const ok = await confirmBox(
      ids.length > 1 ? `Удалить ${tracksWord(ids.length)}?` : 'Удалить трек?',
      ids.length > 1 ? 'Треки будут удалены из медиатеки и всех плейлистов.' : `«${t?.title}» будет удалён из медиатеки и всех плейлистов. Исходный файл на диске останется.`);
    if (!ok) return;
    for (const id of ids) {
      if (S.current === id) stopCurrent();
      let i;
      while ((i = S.queue.indexOf(id)) >= 0) removeQueueAt(i, true);
      S.baseQueue = S.baseQueue.filter((x) => x !== id);
      S.tracks.delete(id);
      const u = coverCache.get(id);
      if (u) { URL.revokeObjectURL(u); coverCache.delete(id); }
      await DB.del('tracks', id);
      await DB.del('files', id);
      for (const p of S.playlists.values()) {
        if (p.trackIds.includes(id)) { p.trackIds = p.trackIds.filter((x) => x !== id); await savePlaylist(p); }
      }
    }
    toast(ids.length > 1 ? `Удалено: ${tracksWord(ids.length)}` : 'Трек удалён', 'ok');
    saveSession();
    renderAll();
  }

  /* Сохранить онлайн-трек в медиатеку (играет из интернета) */
  async function saveRemote(ids, { silent = false } = {}) {
    let n = 0;
    for (const id of ids) {
      const t = S.remote.get(id);
      if (!t || S.tracks.has(id)) continue;
      t.addedAt = Date.now() - n;
      S.tracks.set(id, t);
      await DB.put('tracks', t);
      if (!t.color) colorizeRemote(t);
      n++;
    }
    if (n && !silent) toast(n > 1 ? `Сохранено в медиатеку: ${tracksWord(n)}` : 'Сохранено в медиатеку', 'ok');
    if (n) { renderSidebar(); updateLikeUI(); }
  }

  /* Цвет оформления по обложке онлайн-трека */
  async function colorizeRemote(t) {
    if (!t.art || t.color || t._colorizing) return;
    t._colorizing = true;
    try {
      const blob = await (await fetch(t.artSmall || t.art)).blob();
      t.color = await dominantColor(blob);
      if (t.color && S.tracks.has(t.id)) DB.put('tracks', t).catch(() => {});
      if (t.color && S.current === t.id) {
        document.documentElement.style.setProperty('--np', cssColor(t.color));
        vizColor = t.color;
      }
    } catch { /* без цвета */ }
    delete t._colorizing;
  }

  function editTrack(id) {
    const t = getTrack(id);
    if (!t) return;
    const m = openModal(`
      <h3>Информация о треке</h3>
      <div class="form">
        <label>Название<input class="input" name="title" value="${esc(t.title)}" maxlength="200"></label>
        <label>Исполнитель<input class="input" name="artist" value="${esc(t.artist)}" placeholder="${UNKNOWN_ARTIST}" maxlength="200"></label>
        <label>Альбом<input class="input" name="album" value="${esc(t.album)}" placeholder="Без альбома" maxlength="200"></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-m="cancel">Отмена</button>
        <button class="btn btn-primary" data-m="ok">Сохранить</button>
      </div>`);
    const save = async () => {
      const val = (n) => $(`[name="${n}"]`, m.el).value.trim();
      t.title = val('title') || t.title;
      t.artist = val('artist');
      t.album = val('album');
      await DB.put('tracks', t);
      m.close(true);
      toast('Сохранено', 'ok');
      renderAll();
      if (S.current === id) updateNowPlaying();
    };
    m.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-m]')?.dataset.m;
      if (a === 'cancel') m.close();
      if (a === 'ok') save();
    });
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    setTimeout(() => $('[name="title"]', m.el).focus(), 30);
  }

  function openTrackPicker(pid) {
    const p = S.playlists.get(pid);
    if (!p) return;
    const m = openModal(`
      <div class="modal-head"><h3>Добавить в «${esc(p.name)}»</h3><button class="icon-btn round" data-m="close" aria-label="Закрыть">${ic('close')}</button></div>
      <label class="m-search">${ic('search')}<input class="input" id="pkQ" placeholder="Поиск по медиатеке" autocomplete="off"></label>
      <div class="picker" id="pkList"></div>
      <div class="modal-actions"><button class="btn btn-primary" data-m="close">Готово</button></div>`,
    { cls: 'wide', onDismiss: () => render() });
    const draw = () => {
      const list = filterTracks(sortTracks(allTracks(), 'artist'), $('#pkQ', m.el).value);
      const inSet = new Set(p.trackIds);
      $('#pkList', m.el).innerHTML = list.length ? list.slice(0, 400).map((t) => `
        <div class="pk-row">${coverHTML(t, 'xs')}
          <div class="tt"><div class="t1">${esc(t.title)}</div><div class="t2">${esc(artistOf(t))}</div></div>
          <button class="pk-add ${inSet.has(t.id) ? 'on' : ''}" data-pk="${esc(t.id)}" aria-label="${inSet.has(t.id) ? 'Убрать' : 'Добавить'}">${ic(inSet.has(t.id) ? 'check' : 'plus')}</button>
        </div>`).join('') : '<p class="dim pad">Ничего не найдено</p>';
    };
    draw();
    $('#pkQ', m.el).addEventListener('input', draw);
    setTimeout(() => $('#pkQ', m.el).focus(), 30);
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pk]');
      if (b) {
        const id = b.dataset.pk;
        p.trackIds = p.trackIds.includes(id) ? p.trackIds.filter((x) => x !== id) : [...p.trackIds, id];
        draw();
        await savePlaylist(p);
        renderSidebar();
      }
      if (e.target.closest('[data-m="close"]')) m.close();
    });
  }

  /* ---------- Звук: Web Audio, эквалайзер, анализатор ---------- */
  const EQ_BANDS = [60, 230, 910, 3600, 14000];
  const EQ_LABELS = ['60 Гц', '230 Гц', '910 Гц', '3,6 кГц', '14 кГц'];
  const EQ_PRESETS = {
    'Ровный': [0, 0, 0, 0, 0],
    'Больше баса': [7, 4, 0, 0, 0],
    'Вокал': [-2, -1, 3, 4, 1],
    'Рок': [5, 2, -2, 2, 5],
    'Поп': [-1, 2, 4, 2, -1],
    'Электроника': [6, 3, 0, 2, 5],
    'Классика': [3, 1, -1, 1, 3],
    'Тихо ночью': [-4, -1, 1, 0, -3],
  };
  let eqGains = LS.get('eq', [0, 0, 0, 0, 0]);
  let actx = null, analyser = null, eqNodes = [];

  function ensureAudioGraph() {
    if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      const src = actx.createMediaElementSource(audioMain);
      let node = src;
      eqNodes = EQ_BANDS.map((f, i) => {
        const b = actx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f;
        b.Q.value = 1.1;
        b.gain.value = eqGains[i] || 0;
        node.connect(b);
        node = b;
        return b;
      });
      analyser = actx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      node.connect(analyser);
      analyser.connect(actx.destination);
    } catch (e) {
      console.warn('Web Audio недоступен', e);
      actx = null;
    }
  }
  function setEq(i, v) {
    eqGains[i] = v;
    LS.set('eq', eqGains);
    if (eqNodes[i] && actx) eqNodes[i].gain.setTargetAtTime(v, actx.currentTime, 0.05);
  }

  /* ---------- Воспроизведение ---------- */
  let objectUrl = null;
  let loadToken = 0;

  async function loadIndex(i, { autoplay = true, startAt = 0 } = {}) {
    if (i < 0 || i >= S.queue.length) return;
    if (ext) deactivateExt();
    S.qi = i;
    const id = S.queue[i];
    const t = getTrack(id);
    const token = ++loadToken;
    if (!t) { removeQueueAt(i); return; }
    S.current = id;
    S.counted = false;
    updateNowPlaying();
    renderQueue();
    let src;
    const el = isRemote(t) && t.cors === false ? audioRaw : audioMain;
    if (el !== audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = el;
      syncAudioSettings();
    }
    if (isRemote(t)) {
      src = t.source === 'audius' ? Audius.streamUrl(t.audiusId) : t.stream;
      colorizeRemote(t);
    } else {
      let rec;
      try { rec = await DB.get('files', id); } catch (e) { console.error(e); }
      if (token !== loadToken) return;
      if (!rec || !rec.blob) { toast('Файл трека не найден', 'warn'); return; }
      src = URL.createObjectURL(rec.blob);
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = src.startsWith('blob:') ? src : null;
    audio.src = src;
    if (startAt > 0) el.addEventListener('loadedmetadata', () => { audio.currentTime = Math.min(startAt, (audio.duration || startAt) - 1); }, { once: true });
    saveSession();
    if (autoplay) {
      ensureAudioGraph();
      try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') console.warn(e); }
    }
    updatePlayState();
  }

  function playIds(ids, start = 0, label = '', { key = '', wave = false, randomStart = false } = {}) {
    ids = ids.filter((id) => hasTrack(id));
    if (!ids.length) return;
    const head = getTrack(ids[clamp(start, 0, ids.length - 1)]);
    if (isExt(head)) {
      const same = ids.filter((id) => getTrack(id)?.source === head.source);
      const idx = Math.max(0, same.indexOf(head.id));
      (head.source === 'spotify' ? Spotify : YouTube).playTracks(same, randomStart ? Math.floor(Math.random() * same.length) : idx, label, key);
      return;
    }
    if (randomStart) start = Math.floor(Math.random() * ids.length);
    start = clamp(start, 0, ids.length - 1);
    S.wave = wave;
    S.ctxKey = key;
    S.ctxLabel = label;
    S.baseQueue = [...ids];
    if (S.shuffle && !wave && ids.length > 1) {
      const rest = ids.filter((_, k) => k !== start);
      S.queue = [ids[start], ...shuffleArr(rest)];
      S.qi = 0;
    } else {
      S.queue = [...ids];
      S.qi = start;
    }
    loadIndex(S.qi);
  }

  function togglePlay() {
    if (ext) { ext.toggle(); return; }
    if (!S.current) {
      if (S.tracks.size) startWave();
      else openFilePicker();
      return;
    }
    ensureAudioGraph();
    if (audio.paused) {
      if (!audio.src) loadIndex(S.qi);
      else audio.play().catch(() => {});
    } else audio.pause();
  }

  function next(auto = false) {
    if (ext) { ext.next(); return; }
    if (!S.queue.length) return;
    if (auto && S.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let i = S.qi + 1;
    if (i >= S.queue.length) {
      if (S.wave) extendWave();
      else if (S.repeat === 'all' || !auto) i = 0;
      else { audio.pause(); audio.currentTime = 0; updatePlayState(); return; }
    }
    loadIndex(i);
  }

  function prev() {
    if (ext) { ext.prev(); return; }
    if (!S.queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    let i = S.qi - 1;
    if (i < 0) i = S.repeat === 'all' ? S.queue.length - 1 : 0;
    loadIndex(i);
  }

  function seekBy(sec) {
    if (ext) { ext.seek(ext.position() + sec); return; }
    if (!S.current || !isFinite(audio.duration)) return;
    audio.currentTime = clamp(audio.currentTime + sec, 0, audio.duration);
  }

  function stopCurrent() {
    loadToken++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    S.current = null;
  }

  function toggleShuffle() {
    S.shuffle = !S.shuffle;
    LS.set('shuffle', S.shuffle);
    if (S.queue.length && !S.wave) {
      const cur = S.queue[S.qi];
      if (S.shuffle) {
        S.queue = [cur, ...shuffleArr(S.queue.filter((_, k) => k !== S.qi))];
        S.qi = 0;
      } else {
        S.queue = [...S.baseQueue];
        S.qi = Math.max(0, S.queue.indexOf(cur));
      }
      saveSession();
    }
    updateControls();
    renderQueue();
    toast(S.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено', 'info', 1500);
  }

  function cycleRepeat() {
    S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off';
    LS.set('repeat', S.repeat);
    updateControls();
    toast({ off: 'Повтор выключен', all: 'Повтор всей очереди', one: 'Повтор одного трека' }[S.repeat], 'info', 1500);
  }

  /* Очередь */
  function queueAdd(ids) {
    ids = ids.filter((id) => hasTrack(id));
    if (!ids.length) return;
    if (!S.queue.length) { playIds(ids, 0, 'Очередь'); return; }
    S.queue.push(...ids);
    S.baseQueue.push(...ids);
    toast(ids.length > 1 ? `В очереди: +${tracksWord(ids.length)}` : 'Добавлено в очередь', 'ok', 1800);
    saveSession(); renderQueue();
  }
  function queueNext(ids) {
    ids = ids.filter((id) => hasTrack(id));
    if (!ids.length) return;
    if (!S.queue.length) { playIds(ids, 0, 'Очередь'); return; }
    S.queue.splice(S.qi + 1, 0, ...ids);
    const bi = S.baseQueue.indexOf(S.current);
    S.baseQueue.splice(bi + 1, 0, ...ids);
    toast('Сыграет следующим', 'ok', 1800);
    saveSession(); renderQueue();
  }
  function removeQueueAt(i, silent) {
    const id = S.queue[i];
    S.queue.splice(i, 1);
    const bi = S.baseQueue.indexOf(id);
    if (bi >= 0) S.baseQueue.splice(bi, 1);
    if (i < S.qi) S.qi--;
    else if (i === S.qi) S.qi = Math.min(S.qi, S.queue.length - 1);
    if (!silent) { saveSession(); renderQueue(); }
  }
  function clearUpcoming() {
    S.queue = S.queue.slice(0, S.qi + 1);
    S.baseQueue = S.current ? [S.current] : [];
    S.wave = false;
    saveSession(); renderQueue();
  }

  /* Моя волна: любимые и часто слушаемые звучат чаще, недавно игравшие — реже */
  function waveOrder(exclude) {
    const now = Date.now();
    const keyed = allTracks().map((t) => {
      let w = 1 + (t.liked ? 3 : 0) + Math.log2(1 + (t.plays || 0));
      if (t.lastPlayed && now - t.lastPlayed < 3 * 3600e3) w *= 0.25;
      if (!t.plays) w *= 1.3; // немного новизны
      return { id: t.id, k: Math.pow(Math.random(), 1 / w) };
    });
    keyed.sort((a, b) => b.k - a.k);
    let ids = keyed.map((x) => x.id);
    if (exclude && ids.length > 1 && ids[0] === exclude) ids = [...ids.slice(1), ids[0]];
    return ids;
  }
  function startWave() {
    if (!S.tracks.size) { toast('Сначала добавьте музыку — и волна заиграет', 'info'); return; }
    playIds(waveOrder(), 0, 'Моя волна', { key: 'wave', wave: true });
    toast('Запускаем «Мою волну»', 'ok', 1500);
  }
  function extendWave() {
    const more = waveOrder(S.current);
    S.queue.push(...more);
    S.baseQueue.push(...more);
  }

  /* Что играть по ключу коллекции */
  function resolveSpec(spec) {
    const [type, ...rest] = spec.split(':');
    const v = rest.join(':');
    switch (type) {
      case 'all': return { ids: sortTracks(allTracks(), S.libSort).map((t) => t.id), label: 'Медиатека' };
      case 'liked': return { ids: likedTracks().map((t) => t.id), label: 'Любимые треки' };
      case 'recent': return { ids: sortTracks(allTracks(), 'added').map((t) => t.id), label: 'Недавно добавленные' };
      case 'top': return { ids: sortTracks(allTracks().filter((t) => t.plays), 'plays').map((t) => t.id), label: 'Часто слушаете' };
      case 'album': { const a = findAlbum(v); return a && { ids: a.tracks.map((t) => t.id), label: a.name }; }
      case 'artist': { const a = findArtist(v); return a && { ids: sortTracks(a.tracks, 'plays').map((t) => t.id), label: a.name }; }
      case 'playlist': { const p = S.playlists.get(v); return p && { ids: playlistTracks(p).map((t) => t.id), label: p.name }; }
      case 'genre': { const ids = allTracks().filter((t) => norm(t.genre) === norm(v)).map((t) => t.id); return { ids: shuffleArr(ids), label: v }; }
      default: return null;
    }
  }

  function handlePlaySpec(spec) {
    if (spec === 'wave') {
      if (S.ctxKey === 'wave' && S.current) togglePlay();
      else startWave();
      return;
    }
    if (spec.startsWith('list:')) {
      const [, lid, idx] = spec.split(':');
      const reg = lists.get(lid);
      if (!reg) return;
      const i = +idx;
      if (reg.ids[i] === S.current) togglePlay();
      else playIds(reg.ids, i, reg.label, { key: reg.key });
      return;
    }
    if (S.ctxKey === spec && S.current) { togglePlay(); return; }
    if (spec.startsWith('ia:')) { playArchive(spec.slice(3)); return; }
    if (spec.startsWith('sp-pl:')) { Spotify.playPlaylist(spec.slice(6)); return; }
    if (spec.startsWith('yt-list:')) { YouTube.playList(spec.slice(8)); return; }
    const r = resolveSpec(spec);
    if (!r || !r.ids.length) { toast('Здесь пока нет треков', 'info'); return; }
    playIds(r.ids, 0, r.label, { key: spec });
  }
  function handleShuffleSpec(spec) {
    if (spec.startsWith('ia:')) { playArchive(spec.slice(3), { shuffle: true }); return; }
    if (spec.startsWith('sp-pl:')) { Spotify.playPlaylist(spec.slice(6), { shuffle: true }); return; }
    const r = resolveSpec(spec);
    if (!r || !r.ids.length) return;
    if (!S.shuffle) { S.shuffle = true; LS.set('shuffle', true); updateControls(); }
    playIds(r.ids, 0, r.label, { key: spec, randomStart: true });
  }

  /* ---------- Сессия: продолжить с того же места ---------- */
  let lastSessionSave = 0;
  function saveSession() {
    lastSessionSave = Date.now();
    LS.set('session', {
      queue: S.queue.slice(0, 2000), baseQueue: S.baseQueue.slice(0, 2000), qi: S.qi,
      time: audio.currentTime || 0, key: S.ctxKey, label: S.ctxLabel, wave: S.wave,
      remote: [...new Set(S.queue)].filter((id) => !S.tracks.has(id) && S.remote.has(id)).slice(0, 500).map((id) => S.remote.get(id)),
    });
  }
  function restoreSession() {
    const s = LS.get('session', null);
    if (!s || !Array.isArray(s.queue)) return;
    (s.remote || []).forEach((t) => { if (t && t.id && !S.tracks.has(t.id)) S.remote.set(t.id, t); });
    const queue = s.queue.filter((id) => hasTrack(id));
    if (!queue.length) return;
    const curId = s.queue[s.qi];
    S.queue = queue;
    S.baseQueue = (s.baseQueue || queue).filter((id) => hasTrack(id));
    S.qi = Math.max(0, queue.indexOf(curId));
    S.ctxKey = s.key || '';
    S.ctxLabel = s.label || '';
    S.wave = !!s.wave;
    loadIndex(S.qi, { autoplay: false, startAt: queue[S.qi] === curId ? s.time : 0 });
  }

  /* ---------- Обновление интерфейса плеера ---------- */
  function setIcon(btn, name) { btn.querySelector('use')?.setAttribute('href', '#i-' + name); }

  function updatePlayState() {
    const playing = ext ? ext.playing() : (!audio.paused && !!S.current);
    document.body.classList.toggle('is-playing', playing);
    $('#np').classList.toggle('playing', playing);
    $$('[data-ctl="play"]').forEach((b) => { setIcon(b, playing ? 'pause' : 'play'); b.setAttribute('aria-label', playing ? 'Пауза' : 'Слушать'); });
    $$('[data-play]').forEach((b) => {
      const spec = b.dataset.play;
      let on = false;
      if (spec.startsWith('list:')) { const [, lid, idx] = spec.split(':'); on = lists.get(lid)?.ids[+idx] === S.current; }
      else on = spec === S.ctxKey;
      on = on && playing;
      b.classList.toggle('on', on);
      if (!b.classList.contains('wave-mini')) setIcon(b, on ? 'pause' : 'play');
      const lbl = b.querySelector('[data-off]');
      if (lbl) lbl.textContent = on ? lbl.dataset.on : lbl.dataset.off;
    });
    $$('.wave').forEach((w) => w.classList.toggle('playing', playing && S.ctxKey === 'wave'));
    $$('.row.playing').forEach((r) => r.classList.remove('playing'));
    if (S.current) $$(`.row[data-id="${CSS.escape(S.current)}"]`).forEach((r) => r.classList.add('playing'));
    $$('.sp-item').forEach((el) => el.classList.toggle('playing', !!S.current && el.dataset.key === S.ctxKey));
    const t = getTrack(S.current);
    document.title = t ? `${playing ? '▶ ' : ''}${t.title} — ${artistOf(t)} · MP3UP` : 'MP3UP — твоя музыка';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = S.current ? (playing ? 'playing' : 'paused') : 'none';
    notifyNative();
  }

  function updateControls() {
    $$('[data-ctl="shuffle"]').forEach((b) => { b.classList.toggle('on', S.shuffle); b.title = S.shuffle ? 'Перемешивание: вкл (S)' : 'Перемешать (S)'; });
    $$('[data-ctl="repeat"]').forEach((b) => {
      b.classList.toggle('on', S.repeat !== 'off');
      setIcon(b, S.repeat === 'one' ? 'repeat-one' : 'repeat');
      b.title = { off: 'Повтор: выкл (R)', all: 'Повтор: вся очередь (R)', one: 'Повтор: один трек (R)' }[S.repeat];
    });
  }

  function updateLikeUI() {
    const t = getTrack(S.current);
    $$('[data-ctl="like"]').forEach((b) => {
      const on = !!t?.liked;
      b.classList.toggle('on', on);
      setIcon(b, on ? 'heart-fill' : 'heart');
      b.setAttribute('aria-label', on ? 'Убрать из любимых' : 'Нравится');
    });
    $$('[data-like]').forEach((b) => {
      const tr = getTrack(b.dataset.like);
      const on = !!tr?.liked;
      b.classList.toggle('on', on);
      setIcon(b, on ? 'heart-fill' : 'heart');
    });
  }

  function updateVolumeUI() {
    const v = audio.muted ? 0 : Math.round(audio.volume * 100);
    $$('.vol').forEach((r) => { r.value = v; r.style.setProperty('--p', v + '%'); });
    $$('[data-ctl="mute"]').forEach((b) => setIcon(b, v === 0 ? 'volume-mute' : v < 50 ? 'volume-low' : 'volume'));
  }
  function setVolume(v) {
    v = clamp(v, 0, 1);
    audio.volume = v;
    audio.muted = v === 0;
    LS.set('vol', v);
    LS.set('muted', audio.muted);
    syncAudioSettings();
    updateVolumeUI();
  }
  function syncAudioSettings() {
    for (const el of [audioMain, audioRaw]) if (el !== audio) { el.volume = audio.volume; el.muted = audio.muted; }
    ext?.setVolume(audio.muted ? 0 : audio.volume);
  }
  function toggleMute() {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      if (audio.volume === 0) audio.volume = 0.5;
    } else audio.muted = true;
    LS.set('muted', audio.muted);
    LS.set('vol', audio.volume);
    syncAudioSettings();
    updateVolumeUI();
  }

  function updateNowPlaying() {
    const t = getTrack(S.current);
    $('#player').classList.toggle('no-track', !t);
    if (!t) {
      $('#pCover').innerHTML = '';
      $('#pTitle').textContent = 'Ничего не играет';
      $('#pArtist').textContent = S.tracks.size ? 'Выберите трек или включите «Мою волну»' : 'Добавьте музыку, чтобы начать';
      $('#npTitle').textContent = '—';
      $('#npArtist').textContent = '—';
      $('#npCover').innerHTML = '';
      document.documentElement.style.setProperty('--np', 'hsl(262 60% 50%)');
      updatePlayState();
      updateLikeUI();
      return;
    }
    const c = colorOf(t);
    document.documentElement.style.setProperty('--np', cssColor(c));
    $('#pCover').innerHTML = coverHTML(t);
    $('#pTitle').textContent = t.title;
    $('#pArtist').textContent = artistOf(t);
    $('#npTitle').textContent = t.title;
    $('#npArtist').textContent = artistOf(t);
    $('#npCover').innerHTML = coverHTML(t);
    $('#npCtx').textContent = S.ctxLabel || 'Медиатека';
    const u = coverUrl(t);
    $('#npBg').style.setProperty('--art', u ? `url("${u}")` : 'none');
    vizColor = c;
    sendNativeArtwork(t);
    updateLikeUI();
    updatePlayState();
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title, artist: artistOf(t), album: t.album || '',
          artwork: u ? [{ src: u, sizes: '512x512', type: t.cover?.type || 'image/jpeg' }] : [],
        });
      } catch { /* необязательно */ }
    }
  }

  /* Прогресс и визуализация */
  let seeking = false;
  let lastProgress = -1;
  let vizColor = { h: 262, s: 60, l: 50 };
  const viz = $('#viz');
  const vctx = viz.getContext('2d');
  let vdata = null;

  function progressTick() {
    const d = ext ? ext.duration() : isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (getTrack(S.current)?.duration || 0);
    const c = ext ? ext.position() : (audio.currentTime || 0);
    const key = Math.round(c * 4) + d;
    if (!seeking && key !== lastProgress) {
      lastProgress = key;
      const p = d ? clamp(c / d, 0, 1) : 0;
      $$('.seek').forEach((s) => { s.value = Math.round(p * 1000); s.style.setProperty('--p', p * 100 + '%'); });
      $$('.t-cur').forEach((e) => { e.textContent = fmt(c); });
      $$('.t-dur').forEach((e) => { e.textContent = fmt(d); });
      $('#miniProg').style.width = p * 100 + '%';
    }
    if (S.npOpen) drawViz();
    requestAnimationFrame(progressTick);
  }

  function drawViz() {
    const w = viz.clientWidth, h = viz.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (viz.width !== Math.round(w * dpr) || viz.height !== Math.round(h * dpr)) { viz.width = Math.round(w * dpr); viz.height = Math.round(h * dpr); }
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vctx.clearRect(0, 0, w, h);
    if (!analyser) return;
    if (!vdata) vdata = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(vdata);
    const half = Math.max(16, Math.min(48, Math.floor(w / 28)));
    const bw = w / (half * 2);
    const grad = vctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, `hsl(${vizColor.h} 90% 65% / .95)`);
    grad.addColorStop(0.6, `hsl(${(vizColor.h + 40) % 360} 90% 65% / .35)`);
    grad.addColorStop(1, `hsl(${(vizColor.h + 60) % 360} 90% 65% / 0)`);
    vctx.fillStyle = grad;
    const usable = Math.floor(vdata.length * 0.7);
    for (let i = 0; i < half; i++) {
      const idx = Math.floor(Math.pow(i / half, 1.7) * usable);
      const v = vdata[idx] / 255;
      const bh = Math.max(3, v * v * h * 0.95);
      const bwInner = bw * 0.62;
      const r = Math.min(bwInner / 2, 6);
      for (const x of [w / 2 + i * bw + (bw - bwInner) / 2, w / 2 - (i + 1) * bw + (bw - bwInner) / 2]) {
        vctx.beginPath();
        if (vctx.roundRect) vctx.roundRect(x, h - bh, bwInner, bh + r, r);
        else vctx.rect(x, h - bh, bwInner, bh);
        vctx.fill();
      }
    }
  }

  /* ---------- Android-приложение: уведомление, кнопки, файлы ---------- */
  let nativeKey = '';
  let nativeArtId = null;
  function notifyNative(force) {
    if (!Native) return;
    const t = getTrack(S.current);
    const playing = ext ? ext.playing() : (!!t && !audio.paused);
    const pos = Math.round((ext ? ext.position() : (audio.currentTime || 0)) * 1000);
    const dur = Math.round((ext ? ext.duration() : isFinite(audio.duration) ? audio.duration : (t?.duration || 0)) * 1000);
    if (ext?.name === 'spotify') { // у Spotify своё уведомление
      if (nativeKey !== 'spotify') { nativeKey = 'spotify'; try { Native.playback('', '', '', false, false, 0, 0); } catch { /* мост недоступен */ } }
      return;
    }
    const key = [t?.id, t?.title, t?.artist, playing, dur].join('|');
    if (!force && key === nativeKey) return;
    nativeKey = key;
    try { Native.playback(t ? t.title : '', t ? artistOf(t) : '', t?.album || '', playing, !!t, pos, dur); } catch { /* мост недоступен */ }
  }
  async function sendNativeArtwork(t) {
    if (!Native || !t || nativeArtId === t.id) return;
    nativeArtId = t.id;
    let data = '';
    const u = coverUrl(t);
    if (u) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = u;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = 320;
        c.getContext('2d').drawImage(img, 0, 0, 320, 320);
        data = c.toDataURL('image/jpeg', 0.85);
      } catch { /* без обложки */ }
    }
    if (nativeArtId === t.id) try { Native.artwork(data); } catch { /* мост недоступен */ }
  }
  window.mp3upControl = (cmd) => {
    if (cmd === 'play') doPlay();
    else if (cmd === 'pause') doPause();
    else if (cmd === 'toggle') togglePlay();
    else if (cmd === 'next') next();
    else if (cmd === 'prev') prev();
    else if (cmd.startsWith('seek:')) { const ms = +cmd.slice(5); if (isFinite(ms)) { doSeek(ms / 1000); notifyNative(true); } }
  };
  window.mp3upBack = () => {
    if (menuOpen()) { closeMenu(); return true; }
    if (modalStack.length) { modalStack[modalStack.length - 1].close(); return true; }
    if (S.queueOpen) { setQueueOpen(false); return true; }
    if (S.npOpen) { setNp(false); return true; }
    return false;
  };
  window.mp3upOpenShared = async (items) => {
    const files = [];
    for (const it of items || []) {
      try {
        const blob = await (await fetch(it.url)).blob();
        files.push(new File([blob], it.name || 'track.mp3', { type: it.type || blob.type || 'audio/mpeg' }));
      } catch (e) { console.warn('Не удалось открыть файл', it, e); }
    }
    const ids = await importFiles(files);
    if (ids.length) playIds(ids, 0, 'Открытые файлы');
  };

  /* ---------- Полноэкранный плеер и очередь ---------- */
  function setNp(open) {
    if (open && !S.current) { toast('Сначала включите какой-нибудь трек', 'info'); return; }
    S.npOpen = open;
    const np = $('#np');
    np.classList.toggle('open', open);
    np.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('np-open', open);
    if (open) ensureAudioGraph();
  }

  function setQueueOpen(open) {
    S.queueOpen = open;
    $('#queuePanel').classList.toggle('open', open);
    $$('[data-ctl="queue"]').forEach((b) => { if (b.closest('.player')) b.classList.toggle('on', open); });
    renderQueue();
  }

  function qrow(t, qi, current) {
    return `<div class="qrow ${current ? 'current' : ''}" data-qi="${qi}">
      ${coverHTML(t, 'xs')}
      <div class="tt"><div class="t1">${esc(t.title)}</div><div class="t2">${esc(artistOf(t))}</div></div>
      ${current ? '<span class="bars"><i></i><i></i><i></i></span>' : `<button class="icon-btn sm" data-act="queue-remove" data-qi="${qi}" aria-label="Убрать из очереди" title="Убрать из очереди">${ic('close')}</button>`}
    </div>`;
  }

  function renderQueue() {
    if (!S.queueOpen) return;
    const body = $('#queueBody');
    if (ext) {
      body.innerHTML = `<div class="q-empty">${ic('queue')}<p>Очередью управляет ${ext.label}</p><span>${ext.name === 'spotify' ? 'Следующие треки видны в приложении Spotify.' : 'Видео идут по порядку из выбранного списка.'}</span></div>`;
      return;
    }
    const cur = getTrack(S.queue[S.qi]);
    if (!S.queue.length || !cur) {
      body.innerHTML = `<div class="q-empty">${ic('queue')}<p>Очередь пуста</p><span>Включите любой трек, альбом или «Мою волну» — здесь появится то, что будет играть дальше.</span></div>`;
      return;
    }
    const upcoming = [];
    for (let k = S.qi + 1; k < S.queue.length && upcoming.length < 150; k++) {
      const t = getTrack(S.queue[k]);
      if (t) upcoming.push(qrow(t, k));
    }
    const left = S.queue.length - S.qi - 1;
    body.innerHTML = `
      <div class="q-label"><span>Сейчас играет${S.ctxLabel ? ` · ${esc(S.ctxLabel)}` : ''}</span></div>
      ${qrow(cur, S.qi, true)}
      <div class="q-label"><span>Далее · ${tracksWord(left)}</span>${left ? '<button class="link-btn" data-act="queue-clear">Очистить</button>' : ''}</div>
      ${upcoming.join('') || '<p class="dim pad">Больше ничего. Добавляйте треки через меню «⋯» → «Добавить в очередь».</p>'}`;
    updatePlayState();
  }

  /* ---------- Эквалайзер и подсказки ---------- */
  function openEq() {
    ensureAudioGraph();
    const presetName = () => Object.keys(EQ_PRESETS).find((k) => EQ_PRESETS[k].every((v, i) => v === eqGains[i])) || '';
    const m = openModal(`
      <div class="modal-head"><h3>Эквалайзер</h3><button class="icon-btn round" data-m="close" aria-label="Закрыть">${ic('close')}</button></div>
      <div class="eq-presets">${Object.keys(EQ_PRESETS).map((k) => `<button class="chip" data-preset="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      <div class="eq-bands">${EQ_BANDS.map((_, i) => `
        <div class="eq-band">
          <b data-eqv="${i}"></b>
          <div class="eq-slot"><input type="range" class="range always" min="-12" max="12" step="1" data-eq="${i}" aria-label="${EQ_LABELS[i]}"></div>
          <span>${EQ_LABELS[i]}</span>
        </div>`).join('')}</div>
      <p class="eq-note">${ext ? `Для ${ext.label} эквалайзер не действует — звук идёт через их плеер` : !actx ? 'Эквалайзер недоступен в этом браузере' : audio === audioRaw ? 'Для треков Jamendo эквалайзер не действует: их сервер не разрешает обработку звука' : 'Двигайте ползунки — изменения слышны сразу'}</p>`, { cls: 'wide' });
    const sync = () => {
      const pn = presetName();
      $$('[data-preset]', m.el).forEach((b) => b.classList.toggle('active', b.dataset.preset === pn));
      $$('[data-eq]', m.el).forEach((r) => {
        const i = +r.dataset.eq;
        r.value = eqGains[i];
        r.style.setProperty('--p', ((eqGains[i] + 12) / 24) * 100 + '%');
        $(`[data-eqv="${i}"]`, m.el).textContent = (eqGains[i] > 0 ? '+' : '') + eqGains[i] + ' дБ';
      });
    };
    sync();
    m.el.addEventListener('input', (e) => {
      const r = e.target.closest('[data-eq]');
      if (r) { setEq(+r.dataset.eq, +r.value); sync(); }
    });
    m.el.addEventListener('click', (e) => {
      const p = e.target.closest('[data-preset]');
      if (p) { EQ_PRESETS[p.dataset.preset].forEach((v, i) => setEq(i, v)); sync(); }
      if (e.target.closest('[data-m="close"]')) m.close();
    });
  }

  function openHelp() {
    const keys = [
      ['Пробел', 'Слушать / пауза'], ['Shift + → / ←', 'Следующий / предыдущий трек'], ['→ / ←', 'Перемотать на 5 секунд'],
      ['↑ / ↓', 'Громкость'], ['M', 'Выключить звук'], ['L', 'Добавить в «Любимые»'], ['S', 'Перемешать'], ['R', 'Режим повтора'],
      ['F', 'Полноэкранный плеер'], ['Q', 'Очередь'], ['E', 'Эквалайзер'], ['/', 'Поиск'], ['Esc', 'Закрыть окно'],
    ];
    const m = openModal(`
      <div class="modal-head"><h3>Как пользоваться</h3><button class="icon-btn round" data-m="close" aria-label="Закрыть">${ic('close')}</button></div>
      <ul class="help-tips">
        <li>${ic('upload')}<span><b>Добавляйте музыку</b> кнопкой «Добавить музыку» или просто перетащите файлы и папки в окно.</span></li>
        <li>${ic('play')}<span><b>Нажмите на трек</b> — он заиграет. Правый клик или «⋯» — все действия с треком.</span></li>
        <li>${ic('wave')}<span><b>«Моя волна»</b> — бесконечный поток из вашей медиатеки: любимое звучит чаще.</span></li>
        <li>${ic('heart')}<span><b>Ставьте ♥</b>, чтобы собрать «Любимые треки», и создавайте свои плейлисты.</span></li>
        <li>${ic('download')}<span><b>Установите MP3UP</b> кнопкой «Установить» вверху — он будет запускаться со значка, как обычное приложение.</span></li>
      </ul>
      <h3>Горячие клавиши</h3>
      <div class="keys">${keys.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>`, { cls: 'wide' });
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-m="close"]')) m.close(); });
  }

  /* ---------- Установка как приложение ---------- */
  let installPrompt = null;
  const UA = navigator.userAgent;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = () => /android/i.test(UA);

  function updateInstallUI() {
    $$('[data-act="install"]').forEach((b) => { b.hidden = isStandalone() || !!Native; });
  }

  async function installApp() {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome !== 'accepted') installPrompt = prompt;
      return;
    }
    openInstallHelp();
  }

  function openInstallHelp() {
    const step = (icon, html) => `<li>${ic(icon)}<span>${html}</span></li>`;
    let body;
    if (location.protocol === 'file:') {
      body = `<p class="m-text">Сейчас плеер открыт как файл с диска — в таком режиме браузер не разрешает установку.</p>
        <ul class="help-tips">
          ${step('download', 'Откройте MP3UP <b>по ссылке на сайт</b> — или запустите из папки плеера <b>start.bat</b> (Windows) либо <b>start.sh</b> (macOS, Linux).')}
          ${step('plus-square', 'В открывшемся окне нажмите кнопку <b>«Установить»</b> вверху.')}
        </ul>`;
    } else if (isIOS()) {
      body = `<ul class="help-tips">
          ${step('share', 'Откройте эту страницу в <b>Safari</b> и нажмите кнопку <b>«Поделиться»</b> внизу экрана.')}
          ${step('plus-square', 'Прокрутите список и выберите <b>«На экран „Домой“»</b>.')}
          ${step('check', 'Нажмите <b>«Добавить»</b> — значок MP3UP появится на главном экране.')}
        </ul>
        <p class="m-text">На iPhone у установленного приложения своя медиатека — музыку нужно будет добавить уже в нём.</p>`;
    } else if (/firefox/i.test(UA) && !isAndroid()) {
      body = `<p class="m-text">Firefox на компьютере не умеет устанавливать веб‑приложения. Откройте эту страницу в <b>Chrome</b>, <b>Edge</b> или <b>Яндекс Браузере</b> и нажмите «Установить».</p>`;
    } else if (isAndroid()) {
      body = `<ul class="help-tips">
          ${step('more', 'Откройте меню браузера <b>⋮</b> (справа вверху).')}
          ${step('plus-square', 'Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.')}
        </ul>`;
    } else {
      body = `<ul class="help-tips">
          ${step('download', 'Нажмите значок установки <b>справа в адресной строке</b> браузера.')}
          ${step('more', 'Или откройте меню <b>⋮</b> → <b>«Установить MP3UP»</b> (в Chrome — в разделе «Трансляция, сохранение и отправка»).')}
        </ul>`;
    }
    const m = openModal(`
      <div class="modal-head"><h3>Установить MP3UP</h3><button class="icon-btn round" data-m="close" aria-label="Закрыть">${ic('close')}</button></div>
      ${body}
      <p class="install-note">После установки MP3UP открывается со значка на рабочем столе или главном экране — в своём окне, как обычное приложение, и работает без интернета.</p>`);
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-m="close"]')) m.close(); });
  }

  /* ---------- Навигация ---------- */
  function go(name, param) {
    const hash = '#/' + name + (param != null ? '/' + encodeURIComponent(param) : '');
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = h.split('/');
    let param = null;
    if (rest.length) { try { param = decodeURIComponent(rest.join('/')); } catch { param = rest.join('/'); } }
    return { name: name || 'home', param };
  }

  /* Реестр списков треков на текущем экране (для запуска по клику) */
  let lists = new Map();
  let listSeq = 0;
  function regList(ids, label, key = '', extra = {}) {
    const id = 'l' + (++listSeq);
    lists.set(id, { ids, label, key, ...extra });
    return id;
  }

  /* ---------- Шаблоны ---------- */
  function trackList(tracks, { label = '', key = '', playlistId = null, compact = false, numbers = true } = {}) {
    const lid = regList(tracks.map((t) => t.id), label, key, { playlistId });
    return `<div class="tracklist ${compact ? 'compact' : ''}" data-list="${lid}">
      <div class="tl-head"><span class="num">#</span><span>Название</span><span class="al">Альбом</span><span></span><span class="r">${ic('clock')}</span><span></span></div>
      ${tracks.map((t, i) => `
      <div class="row ${t.id === S.current ? 'playing' : ''}" data-id="${esc(t.id)}" data-i="${i}">
        <span class="num"><span class="n">${numbers ? i + 1 : (t.trackNo || i + 1)}</span><button class="row-play" data-act="row-play" aria-label="Слушать">${ic('play')}</button><span class="bars"><i></i><i></i><i></i></span></span>
        <span class="ti">${coverHTML(t, 'sm')}<span class="tt"><span class="t1">${esc(t.title)}${isRemote(t) ? ic('globe', 'src') : ''}</span><a class="t2" href="${S.tracks.has(t.id) ? '#/artist/' : '#/online/'}${encodeURIComponent(artistOf(t))}">${esc(artistOf(t))}</a></span></span>
        <span class="al">${t.album ? `<a href="#/album/${encodeURIComponent(t.album)}">${esc(t.album)}</a>` : `<span class="dim">${isRemote(t) ? esc(t.genre || SOURCES[t.source]?.name || '') : '—'}</span>`}</span>
        ${isExt(t) ? '<span></span>' : `<button class="icon-btn like ${t.liked ? 'on' : ''}" data-act="like" data-like="${esc(t.id)}" aria-label="Нравится" title="Нравится">${ic(t.liked ? 'heart-fill' : 'heart')}</button>`}
        <span class="dur">${t.duration ? fmt(t.duration) : '—'}</span>
        <button class="icon-btn more" data-act="more" aria-label="Ещё" title="Ещё">${ic('more')}</button>
      </div>`).join('')}
    </div>`;
  }

  function card({ href, cover, title, sub = '', round = false, play = '' }) {
    return `<a class="card ${round ? 'round' : ''}" href="${href}">
      <div class="card-cover">${cover}${play ? `<button class="card-play" data-play="${esc(play)}" aria-label="Слушать">${ic('play')}</button>` : ''}</div>
      <div class="card-title">${esc(title)}</div>
      <div class="card-sub">${sub}</div>
    </a>`;
  }
  const albumCard = (a) => card({ href: `#/album/${encodeURIComponent(a.name)}`, cover: coverHTML(a.coverTrack), title: a.name, sub: esc([a.year, a.artist].filter(Boolean).join(' · ')), play: `album:${a.key}` });
  const artistCard = (a) => card({ href: `#/artist/${encodeURIComponent(a.name)}`, cover: coverHTML(a.coverTrack), title: a.name, sub: 'Исполнитель', round: true, play: `artist:${a.key}` });
  const playlistCard = (p) => card({ href: `#/playlist/${p.id}`, cover: playlistCover(p), title: p.name, sub: `Плейлист · ${tracksWord(playlistTracks(p).length)}`, play: `playlist:${p.id}` });

  function hero({ kind, title, sub, cover, round = false, spec, count, extra = '' }) {
    return `
      <section class="hero">
        <div class="hero-cover ${round ? 'round' : ''}">${cover}</div>
        <div class="hero-info">
          <div class="hero-kind">${kind}</div>
          <h1 class="hero-title ${title.length > 26 ? 'long' : ''}">${esc(title)}</h1>
          <div class="hero-sub">${sub}</div>
        </div>
      </section>
      <div class="actions">
        ${count ? `<button class="play-big" data-play="${esc(spec)}" aria-label="Слушать" title="Слушать">${ic('play')}</button>
        <button class="btn btn-ghost" data-shuffle="${esc(spec)}">${ic('shuffle')}<span>Перемешать</span></button>` : ''}
        ${extra}
      </div>`;
  }

  function emptyBlock(icon, title, text, action = '') {
    return `<div class="empty">${ic(icon, 'big')}<h3>${title}</h3><p>${text}</p>${action}</div>`;
  }

  function welcome() {
    return `
      <div class="welcome">
        <svg class="welcome-art"><use href="#i-logo"/></svg>
        <h1>Вся ваша музыка — <b>в одном месте</b></h1>
        <p>MP3UP — плеер для вашей коллекции. Без подписок, рекламы и интернета: треки хранятся только на этом устройстве.</p>
        <div class="steps">
          <div class="step"><b>1</b><span>Добавьте MP3 кнопкой ниже или перетащите файлы и папки в окно</span></div>
          <div class="step"><b>2</b><span>Обложки, названия и исполнители подтянутся из файлов сами</span></div>
          <div class="step"><b>3</b><span>Слушайте, ставьте ♥, собирайте плейлисты и включайте «Мою волну»</span></div>
        </div>
        <div class="welcome-actions">
          <button class="btn btn-primary lg" data-act="add-music">${ic('upload')}Выбрать файлы</button>
          <button class="btn btn-ghost lg" data-act="add-folder">${ic('folder')}Выбрать папку</button>
          <a class="btn btn-ghost lg" href="#/online">${ic('globe')}Слушать онлайн</a>
        </div>
        <div class="dropzone" data-act="add-music">${ic('note')}<span>или перетащите музыку сюда</span></div>
        <p class="privacy">Файлы никуда не загружаются — всё остаётся в вашем браузере.</p>
      </div>`;
  }

  /* ---------- Онлайн: бесплатная музыка Audius ---------- */
  const Audius = (() => {
    const API = 'https://api.audius.co/v1';
    const APP = 'MP3UP';
    async function get(path, params) {
      const u = new URL(API + path);
      for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.searchParams.set(k, v);
      u.searchParams.set('app_name', APP);
      const r = await fetch(u);
      if (!r.ok) throw new Error('Audius ' + r.status);
      return (await r.json()).data || [];
    }
    const playable = (a) => a && a.is_streamable !== false && !a.is_stream_gated && a.access?.stream !== false && !a.is_delete && a.is_available !== false;
    function toTrack(a) {
      const id = 'au:' + a.id;
      const known = S.tracks.get(id) || S.remote.get(id);
      if (known) return known;
      const art = a.artwork || {};
      const t = {
        id, source: 'audius', audiusId: a.id,
        title: a.title || 'Без названия', artist: a.user?.name || '', album: '', albumArtist: '',
        genre: a.genre || '', year: (a.release_date || '').slice(0, 4), trackNo: 0,
        duration: a.duration || 0,
        art: art['480x480'] || art['1000x1000'] || art['150x150'] || '',
        artSmall: art['150x150'] || art['480x480'] || '',
        permalink: a.permalink ? 'https://audius.co' + a.permalink : 'https://audius.co',
        cover: null, color: null, addedAt: 0, plays: 0, lastPlayed: 0, liked: false, likedAt: 0,
      };
      S.remote.set(id, t);
      return t;
    }
    return {
      streamUrl: (id) => `${API}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`,
      trending: async (genre) => (await get('/tracks/trending', { genre, time: 'week', limit: 60 })).filter(playable).map(toTrack),
      search: async (query) => (await get('/tracks/search', { query, limit: 60 })).filter(playable).map(toTrack),
    };
  })();

  /* Jamendo: независимые артисты под Creative Commons (нужен личный бесплатный Client ID) */
  const Jamendo = (() => {
    const API = 'https://api.jamendo.com/v3.0';
    const key = () => LS.get('jamendoId', '');
    async function get(path, params, clientId = key()) {
      const u = new URL(API + path);
      u.searchParams.set('client_id', clientId);
      u.searchParams.set('format', 'json');
      for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.searchParams.set(k, v);
      const d = await (await fetch(u)).json();
      if (d.headers?.status !== 'success') {
        const e = new Error(d.headers?.error_message || 'Jamendo');
        e.auth = d.headers?.code === 5;
        throw e;
      }
      return d.results || [];
    }
    function toTrack(a) {
      const id = 'jm:' + a.id;
      const known = S.tracks.get(id) || S.remote.get(id);
      if (known) return known;
      const t = {
        id, source: 'jamendo', cors: false, stream: a.audio,
        title: a.name || 'Без названия', artist: a.artist_name || '', album: '', albumArtist: '',
        genre: a.musicinfo?.tags?.genres?.[0] || '', year: (a.releasedate || '').slice(0, 4), trackNo: 0,
        duration: +a.duration || 0, art: a.album_image || a.image || '', artSmall: a.image || a.album_image || '',
        permalink: a.shareurl || `https://www.jamendo.com/track/${a.id}`,
        cover: null, color: null, addedAt: 0, plays: 0, lastPlayed: 0, liked: false, likedAt: 0,
      };
      S.remote.set(id, t);
      return t;
    }
    const base = { limit: 60, include: 'musicinfo', audioformat: 'mp32', imagesize: 300 };
    return {
      hasKey: () => !!key(),
      test: (clientId) => get('/tracks/', { limit: 1 }, clientId),
      trending: async (tag) => (await get('/tracks/', { ...base, order: 'popularity_week', fuzzytags: tag })).filter((a) => a.audio).map(toTrack),
      search: async (q) => (await get('/tracks/', { ...base, search: q, order: 'relevance' })).filter((a) => a.audio).map(toTrack),
    };
  })();

  /* Internet Archive: нетлейблы под Creative Commons, живые концерты, пластинки 78 об/мин */
  const Archive = (() => {
    const COLLECTIONS = {
      '': 'collection:(netlabels OR etree OR georgeblood)',
      netlabels: 'collection:netlabels', etree: 'collection:etree', georgeblood: 'collection:georgeblood',
    };
    const LABELS = { netlabels: 'Нетлейбл', etree: 'Живой концерт', georgeblood: 'Пластинка 78' };
    const items = new Map();
    const str = (v) => String((Array.isArray(v) ? v[0] : v) ?? '');
    const thumb = (id) => `https://archive.org/services/img/${encodeURIComponent(id)}`;
    const dl = (id, name) => `https://archive.org/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`;
    function parseLen(v) {
      if (!v) return 0;
      if (String(v).includes(':')) return String(v).split(':').reduce((a, x) => a * 60 + (+x || 0), 0);
      return +v || 0;
    }
    async function search(q, coll) {
      const clean = q.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
      const u = new URL('https://archive.org/advancedsearch.php');
      u.searchParams.set('q', (clean ? `(${clean}) AND ` : '') + 'mediatype:audio AND ' + (COLLECTIONS[coll] || COLLECTIONS['']));
      ['identifier', 'title', 'creator', 'year', 'collection'].forEach((f) => u.searchParams.append('fl[]', f));
      if (!clean) u.searchParams.append('sort[]', 'week desc');
      u.searchParams.set('rows', '48');
      u.searchParams.set('output', 'json');
      const r = await fetch(u);
      if (!r.ok) throw new Error('Archive ' + r.status);
      return ((await r.json()).response?.docs || []).map((d) => ({
        id: d.identifier, title: str(d.title) || d.identifier, creator: str(d.creator), year: str(d.year).slice(0, 4),
      }));
    }
    async function load(id) {
      const cur = items.get(id);
      if (cur?.item) return cur.item;
      if (cur?.loading) return cur.loading;
      const promise = (async () => {
        try {
          const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
          if (!r.ok) throw new Error('Archive ' + r.status);
          const d = await r.json();
          const md = d.metadata || {};
          const files = d.files || [];
          const RANK = ['VBR MP3', '128Kbps MP3', 'MP3', '64Kbps MP3'];
          const best = new Map();
          for (const f of files) {
            const rank = RANK.indexOf(f.format);
            if (rank < 0 || !/\.mp3$/i.test(f.name)) continue;
            const key = f.name.replace(/\.[^.]+$/, '').replace(/_(vbr|64kb|128kb)$/i, '');
            const prev = best.get(key);
            if (!prev || rank < prev.rank) best.set(key, { f, rank });
          }
          const coll = [].concat(md.collection || []).find((c) => LABELS[c]);
          const coverFile = files.find((f) => f.format === 'JPEG' && !/thumb/i.test(f.name));
          const art = coverFile ? dl(id, coverFile.name) : thumb(id);
          const album = str(md.title) || id;
          const creator = str(md.creator);
          const list = [...best.values()].map((x) => x.f)
            .sort((a, b) => (parseInt(a.track, 10) || 999) - (parseInt(b.track, 10) || 999) || collator.compare(a.name, b.name));
          const tracks = list.map((f, i) => {
            const tid = `ia:${id}/${f.name}`;
            const known = S.tracks.get(tid) || S.remote.get(tid);
            if (known) return known;
            const t = {
              id: tid, source: 'archive', iaId: id, stream: dl(id, f.name),
              title: str(f.title) || f.name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]*/, '').replace(/_/g, ' ') || f.name,
              artist: str(f.creator) || str(f.artist) || creator, album: '', albumArtist: '', iaAlbum: album,
              genre: LABELS[coll] || 'Internet Archive', year: str(md.year || md.date).slice(0, 4), trackNo: parseInt(f.track, 10) || i + 1,
              duration: parseLen(f.length), art, artSmall: thumb(id), permalink: `https://archive.org/details/${id}`,
              cover: null, color: null, addedAt: 0, plays: 0, lastPlayed: 0, liked: false, likedAt: 0,
            };
            S.remote.set(tid, t);
            return t;
          });
          const item = { id, title: album, creator, year: str(md.year || md.date).slice(0, 4), license: str(md.licenseurl), label: LABELS[coll] || '', art, tracks };
          items.set(id, { item });
          return item;
        } catch (e) {
          console.warn(e);
          items.set(id, { error: true });
          return null;
        }
      })();
      items.set(id, { loading: promise });
      return promise;
    }
    return { search, load, thumb, cached: (id) => items.get(id), forget: (id) => items.delete(id) };
  })();

  const SOURCES = {
    spotify: {
      name: 'Spotify', url: 'https://open.spotify.com', placeholder: 'Трек или исполнитель в Spotify', ext: true,
      note: 'ваша подписка Spotify, MP3UP работает через официальный API',
      genres: [['playlists', 'Мои плейлисты'], ['liked', 'Любимые треки']],
    },
    youtube: {
      name: 'YouTube', url: 'https://www.youtube.com', placeholder: 'Поиск на YouTube или ссылка на видео / плейлист', ext: true,
      note: 'видео играет во встроенном плеере YouTube — так требуют правила сервиса',
      genres: [['RU', 'Россия'], ['US', 'США'], ['GB', 'Великобритания'], ['KR', 'Корея'], ['JP', 'Япония'], ['DE', 'Германия']],
    },
    audius: {
      name: 'Audius', url: 'https://audius.co', placeholder: 'Трек или исполнитель',
      note: 'артисты сами выкладывают туда треки для бесплатного прослушивания',
      genres: [['', 'Все'], ['Electronic', 'Электроника'], ['Hip-Hop/Rap', 'Хип-хоп'], ['Pop', 'Поп'], ['Rock', 'Рок'],
        ['Alternative', 'Альтернатива'], ['Lo-Fi', 'Lo-Fi'], ['House', 'Хаус'], ['Techno', 'Техно'], ['Trap', 'Трэп'], ['R&B/Soul', 'R&B'],
        ['Drum & Bass', 'Драм-н-бэйс'], ['Ambient', 'Эмбиент'], ['Jazz', 'Джаз'], ['Classical', 'Классика'], ['Metal', 'Метал'], ['Soundtrack', 'Саундтреки']],
    },
    jamendo: {
      name: 'Jamendo', url: 'https://www.jamendo.com', placeholder: 'Трек или исполнитель',
      note: 'независимые артисты со всего мира, все треки под лицензиями Creative Commons',
      genres: [['', 'Все'], ['pop', 'Поп'], ['rock', 'Рок'], ['electronic', 'Электроника'], ['hiphop', 'Хип-хоп'], ['jazz', 'Джаз'],
        ['classical', 'Классика'], ['ambient', 'Эмбиент'], ['lounge', 'Лаунж'], ['chillout', 'Чилаут'], ['acoustic', 'Акустика'],
        ['metal', 'Метал'], ['soundtrack', 'Саундтреки'], ['relaxation', 'Релакс']],
    },
    archive: {
      name: 'Internet Archive', url: 'https://archive.org/details/audio', placeholder: 'Альбом, исполнитель или лейбл',
      note: 'альбомы нетлейблов под Creative Commons, записи живых концертов и оцифрованные пластинки',
      genres: [['', 'Все'], ['netlabels', 'Нетлейблы'], ['etree', 'Живые концерты'], ['georgeblood', 'Пластинки 78 об/мин']],
    },
  };
  const ON = {
    source: SOURCES[LS.get('onlineSource', 'audius')] ? LS.get('onlineSource', 'audius') : 'audius',
    genre: LS.get('onlineGenres', {}),
    results: new Map(),
  };
  const ONLINE_TTL = 15 * 60e3;
  const curGenre = (src = ON.source) => ON.genre[src] || SOURCES[src].genres[0][0];
  const onlineKey = (q, src = ON.source, genre = curGenre(src)) => `${src}|` + (q ? 'q:' + norm(q) : 'g:' + genre);
  const onlineQuery = () => (S.view?.name === 'online' ? (S.view.param || '').trim() : '');

  async function loadOnline(q, src = ON.source, genre = curGenre(src)) {
    if (src === 'jamendo' && !Jamendo.hasKey()) return;
    if (src === 'spotify' && !Spotify.loggedIn()) return;
    if (src === 'youtube' && !YouTube.hasKey() && !YouTube.parseLink(q)) return;
    const key = onlineKey(q, src, genre);
    if (ON.results.get(key)?.loading) return;
    ON.results.set(key, { loading: true });
    try {
      let res;
      if (src === 'archive') res = { items: await Archive.search(q, genre) };
      else if (src === 'spotify') res = q ? { tracks: await Spotify.search(q) } : genre === 'liked' ? { tracks: await Spotify.liked() } : { items: await Spotify.playlists(), itemKind: 'sp' };
      else if (src === 'youtube') res = await YouTube.query(q, genre);
      else if (src === 'jamendo') res = { tracks: q ? await Jamendo.search(q) : await Jamendo.trending(genre) };
      else res = { tracks: q ? await Audius.search(q) : await Audius.trending(genre) };
      ON.results.set(key, { ...res, at: Date.now() });
    } catch (e) {
      console.warn(e);
      ON.results.set(key, { error: true, auth: !!e.auth, message: e.message });
    }
    fillOnline();
  }
  function onlineFresh(key) {
    const r = ON.results.get(key);
    return r && (r.loading || r.error || Date.now() - r.at < ONLINE_TTL);
  }
  const skeletonRows = () => `<div class="sk-list">${'<div class="sk-row"><i></i><span><b></b><b></b></span></div>'.repeat(8)}</div>`;
  const skeletonCards = () => '<div class="sk-card"><i></i><b></b><b></b></div>'.repeat(7);

  function jamendoSetupHTML(error) {
    return `<div class="setup-card">
      <h3>Подключите Jamendo — это бесплатно</h3>
      <p>Jamendo выдаёт каждому приложению личный ключ (Client ID). Получить его — пара минут:</p>
      <ol>
        <li>Зарегистрируйтесь на <a href="https://devportal.jamendo.com" target="_blank" rel="noopener">devportal.jamendo.com</a>.</li>
        <li>В личном кабинете создайте приложение — название любое, например «MP3UP».</li>
        <li>Скопируйте <b>Client ID</b> и вставьте его сюда.</li>
      </ol>
      <div class="setup-row">
        <input class="input" id="jamendoKey" placeholder="Client ID" value="${esc(LS.get('jamendoId', ''))}" autocomplete="off" spellcheck="false">
        <button class="btn btn-primary" data-act="jamendo-save">Подключить</button>
      </div>
      ${error ? `<p class="setup-error">${esc(error)}</p>` : ''}
      <p class="dim">Ключ хранится только на этом устройстве.</p>
    </div>`;
  }
  const archiveCard = (it) => card({
    href: `#/ia/${encodeURIComponent(it.id)}`,
    cover: `<img class="cover" src="${esc(Archive.thumb(it.id))}" alt="" loading="lazy" draggable="false">`,
    title: it.title, sub: esc([it.creator, it.year].filter(Boolean).join(' · ')), play: `ia:${it.id}`,
  });

  function onlineResultsHTML(q) {
    const src = ON.source;
    if (src === 'jamendo' && !Jamendo.hasKey()) return jamendoSetupHTML();
    if (src === 'spotify' && !Spotify.hasClient()) return Spotify.setupHTML();
    if (src === 'spotify' && !Spotify.loggedIn()) return Spotify.loginHTML();
    if (src === 'youtube' && !YouTube.hasKey() && !YouTube.parseLink(q)) return YouTube.setupHTML() + (q ? servicesHTML(q) : '');
    const r = ON.results.get(onlineKey(q));
    if (!r || r.loading) return src === 'archive' ? `<div class="grid">${skeletonCards()}</div>` : skeletonRows();
    if (r.error) {
      if (r.auth && src === 'jamendo') return jamendoSetupHTML('Jamendo не принял ключ — проверьте Client ID.');
      if (r.auth && src === 'spotify') return Spotify.loginHTML(r.message);
      if (r.auth && src === 'youtube') return YouTube.setupHTML(r.message);
      if (r.message && (src === 'spotify' || src === 'youtube')) {
        return emptyBlock('globe', 'Не удалось загрузить', esc(r.message), `<button class="btn btn-primary" data-act="online-retry">Повторить</button>`);
      }
      return emptyBlock('globe', 'Не удалось загрузить',
        navigator.onLine ? `${SOURCES[src].name} сейчас не отвечает. Попробуйте ещё раз чуть позже.` : 'Нет подключения к интернету. Музыка из медиатеки по-прежнему доступна.',
        `<button class="btn btn-primary" data-act="online-retry">Повторить</button>`);
    }
    const more = q ? servicesHTML(q) : '';
    if (r.items) {
      if (!r.items.length && !r.tracks?.length) return emptyBlock('search', 'Ничего не нашлось', 'Попробуйте другое название, исполнителя или лейбл.') + more;
      const cardFn = r.itemKind === 'sp' ? Spotify.playlistCard : r.itemKind === 'yt' ? YouTube.listCard : archiveCard;
      return `<div class="grid">${r.items.map(cardFn).join('')}</div>`
        + (r.tracks?.length ? `<div class="section">${trackList(r.tracks, { label: SOURCES[src].name, key: 'online:' + onlineKey(q) })}</div>` : '') + more;
    }
    if (!r.tracks.length) return emptyBlock('search', 'Ничего не нашлось', 'Попробуйте другое название или имя исполнителя.') + more;
    const name = SOURCES[src].name;
    return trackList(r.tracks, { label: q ? `${name}: ${q}` : `${name}: в тренде`, key: 'online:' + onlineKey(q) }) + more;
  }
  function homeOnlineHTML(trigger) {
    const key = onlineKey('', 'audius', '');
    if (trigger && !onlineFresh(key)) setTimeout(() => loadOnline('', 'audius', ''), 0);
    const r = ON.results.get(key);
    if (!r || r.loading) return skeletonCards();
    if (r.error) return `<p class="dim shelf-note">${navigator.onLine ? 'Audius сейчас не отвечает' : 'Нет подключения к интернету'}</p>`;
    const list = r.tracks.slice(0, 16);
    const lid = regList(list.map((t) => t.id), 'Audius: в тренде', 'online:' + key);
    return list.map((t, i) => card({ href: '#/online', cover: coverHTML(t), title: t.title, sub: esc(artistOf(t)), play: `list:${lid}:${i}` })).join('');
  }
  function fillOnline() {
    const status = $('#extStatus');
    if (status) status.innerHTML = Spotify.statusHTML();
    const box = $('#onlineResults');
    if (box && S.view?.name === 'online') box.innerHTML = onlineResultsHTML(onlineQuery());
    const home = $('#homeOnline');
    if (home) home.innerHTML = homeOnlineHTML(false);
    updatePlayState();
  }
  const onlineTitle = (q) => (q ? `Результаты по запросу «${q}»`
    : ON.source === 'archive' ? 'Популярное за неделю'
      : ON.source === 'spotify' ? (curGenre() === 'liked' ? 'Любимые треки' : 'Мои плейлисты')
        : ON.source === 'youtube' ? 'Популярная музыка' : 'В тренде за неделю');
  function setOnlineQuery(q) {
    S.view = { name: 'online', param: q || null };
    history.replaceState(null, '', '#/online' + (q ? '/' + encodeURIComponent(q) : ''));
    const genres = $('#onlineGenres');
    if (genres) genres.hidden = !!q;
    const title = $('#onlineTitle');
    if (title) title.textContent = onlineTitle(q);
    if (!onlineFresh(onlineKey(q))) loadOnline(q);
    fillOnline();
  }

  async function saveJamendoKey() {
    const input = $('#jamendoKey');
    const id = input?.value.trim();
    if (!id) { input?.classList.remove('err'); void input?.offsetWidth; input?.classList.add('err'); return; }
    const t = toast('Проверяем ключ…', 'load', 0);
    try {
      await Jamendo.test(id);
      LS.set('jamendoId', id);
      for (const k of [...ON.results.keys()]) if (k.startsWith('jamendo|')) ON.results.delete(k);
      t.close();
      toast('Jamendo подключён', 'ok');
      render();
    } catch (e) {
      t.close();
      toast(e.auth ? 'Ключ не подошёл — проверьте Client ID' : 'Не удалось связаться с Jamendo. Проверьте интернет', 'warn', 4000);
    }
  }

  /* Альбом Internet Archive: запустить или перемешать */
  function playArchive(id, { shuffle = false } = {}) {
    const spec = 'ia:' + id;
    const start = (it) => {
      if (!it || !it.tracks.length) { toast(it ? 'В этом альбоме нет MP3' : 'Не удалось загрузить альбом', 'warn'); return; }
      if (shuffle && !S.shuffle) { S.shuffle = true; LS.set('shuffle', true); updateControls(); }
      playIds(it.tracks.map((t) => t.id), 0, it.title, { key: spec, randomStart: shuffle });
    };
    const st = Archive.cached(id);
    if (st?.item) { start(st.item); return; }
    const tl = toast('Загружаем альбом…', 'load', 0);
    Archive.load(id).then((it) => { tl.close(); start(it); });
  }

  /* ---------- Другие сервисы: только ссылки (у них нет открытого API) ---------- */
  const OTHER_SERVICES = [
    ['Яндекс Музыка', (q) => `https://music.yandex.ru/search?text=${q}`],
    ['КИОН Музыка', (q) => `https://music.mts.ru/search?text=${q}`],
    ['VK Музыка', (q) => `https://vk.com/audio?q=${q}&section=search`],
    ['Звук', (q) => `https://zvuk.com/search?query=${q}`],
    ['Spotify', (q) => `https://open.spotify.com/search/${q}`],
    ['YouTube Music', (q) => `https://music.youtube.com/search?q=${q}`],
    ['Apple Music', (q) => `https://music.apple.com/ru/search?term=${q}`],
  ];
  const serviceLinks = (query) => OTHER_SERVICES.map(([name, url]) => ({ name, url: url(encodeURIComponent(query)) }));
  const servicesHTML = (query) => `<div class="svc"><span>Искать «${esc(query)}» в:</span>${serviceLinks(query)
    .map((sv) => `<a class="chip" href="${esc(sv.url)}" target="_blank" rel="noopener">${esc(sv.name)}</a>`).join('')}</div>`;

  /* ---------- Внешние движки: когда играет Spotify или YouTube, кнопки управляют ими ---------- */
  function doPlay() {
    if (ext) { ext.play(); return; }
    if (!S.current) return;
    ensureAudioGraph();
    if (!audio.src) loadIndex(S.qi);
    else audio.play().catch(() => {});
  }
  function doPause() { if (ext) ext.pause(); else audio.pause(); }
  function doSeek(sec) {
    if (ext) ext.seek(sec);
    else if (S.current && isFinite(sec)) audio.currentTime = sec;
  }
  function activateExt(engine) {
    if (ext && ext !== engine) ext.stop();
    loadToken++; // отменяем загрузку локального трека
    audio.pause();
    ext = engine;
    document.body.classList.add('ext-mode');
    ext.setVolume(audio.muted ? 0 : audio.volume);
  }
  function deactivateExt() {
    if (!ext) return;
    const e = ext;
    ext = null;
    e.stop();
    document.body.classList.remove('ext-mode');
    S.current = S.queue[S.qi] || null;
    updateNowPlaying();
    renderQueue();
  }
  function onExtState() {
    if (!ext) return;
    const id = ext.trackId();
    if (id && id !== S.current) {
      S.current = id;
      const t = getTrack(id);
      if (t) colorizeRemote(t);
      updateNowPlaying();
      renderQueue();
    } else updatePlayState();
  }
  const setupStep = (html) => `<li>${html}</li>`;
  const copyField = (value) => `<span class="copy-field"><code>${esc(value)}</code><button class="link-btn" data-copy="${esc(value)}">Копировать</button></span>`;

  /* ---------- Spotify: официальный Web API + Web Playback SDK ---------- */
  const Spotify = (() => {
    const AUTH = 'https://accounts.spotify.com';
    const API = 'https://api.spotify.com/v1';
    const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state',
      'user-read-currently-playing', 'user-library-read', 'playlist-read-private', 'playlist-read-collaborative'].join(' ');
    const redirectUri = () => (Native ? 'mp3up://spotify-callback' : location.origin + location.pathname);
    const clientId = () => LS.get('spotifyClientId', '');
    let tok = LS.get('spotifyToken', null);
    const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const randomStr = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); };
    const authError = (msg) => Object.assign(new Error(msg), { auth: true });

    /* --- вход (Authorization Code + PKCE, без сервера) --- */
    async function login() {
      if (!crypto.subtle) { toast('Вход в Spotify работает только по https или http://127.0.0.1', 'warn', 5000); return; }
      const verifier = randomStr(64);
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const state = randomStr(16);
      LS.set('spotifyPkce', { verifier, state, redirect: redirectUri() });
      const u = new URL(AUTH + '/authorize');
      Object.entries({
        client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(),
        code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state,
      }).forEach(([k, v]) => u.searchParams.set(k, v));
      location.href = u.toString(); // в Android-приложении откроется браузер
    }
    async function tokenRequest(params) {
      const r = await fetch(AUTH + '/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId(), ...params }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw authError(d.error_description || d.error || 'Spotify не выдал доступ');
      tok = { access: d.access_token, refresh: d.refresh_token || tok?.refresh, exp: Date.now() + (d.expires_in || 3600) * 1000 };
      LS.set('spotifyToken', tok);
      return tok.access;
    }
    async function handleCallback(href) {
      const u = new URL(href);
      const pk = LS.get('spotifyPkce', null);
      if (!pk || u.searchParams.get('state') !== pk.state) return false;
      LS.set('spotifyPkce', null);
      const code = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      if (err || !code) {
        toast(err === 'access_denied' ? 'Вход в Spotify отменён' : `Spotify не дал войти: ${err || 'нет кода'}`, 'warn', 5000);
        return true;
      }
      try {
        await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: pk.redirect, code_verifier: pk.verifier });
        toast('Spotify подключён', 'ok');
      } catch (e) {
        toast(`Не удалось войти в Spotify: ${e.message}`, 'warn', 6000);
      }
      return true;
    }
    async function access() {
      if (!tok) throw authError('Войдите в Spotify');
      if (Date.now() < tok.exp - 60e3) return tok.access;
      if (!tok.refresh) { logout(); throw authError('Сессия Spotify истекла — войдите снова'); }
      try { return await tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh }); } catch (e) { logout(); throw e; }
    }
    function logout() {
      if (ext === engine) deactivateExt();
      tok = null;
      LS.set('spotifyToken', null);
      for (const k of [...ON.results.keys()]) if (k.startsWith('spotify|')) ON.results.delete(k);
    }
    async function api(path, { method = 'GET', query, body } = {}) {
      const u = new URL(API + path);
      if (query) for (const [k, v] of Object.entries(query)) if (v !== '' && v != null) u.searchParams.set(k, v);
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(u, {
          method,
          headers: { Authorization: 'Bearer ' + await access(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (r.status === 401 && attempt === 0 && tok) { tok.exp = 0; continue; }
        const text = await r.text();
        let d = null;
        try { d = text ? JSON.parse(text) : null; } catch { /* пустой ответ */ }
        if (!r.ok) {
          const e = new Error(d?.error?.message || `Spotify ответил ${r.status}`);
          e.status = r.status;
          e.reason = d?.error?.reason || '';
          if (r.status === 401) e.auth = true;
          throw e;
        }
        return d;
      }
      throw authError('Войдите в Spotify снова');
    }

    /* --- данные --- */
    function toTrack(a) {
      if (!a || !a.id || (a.type && a.type !== 'track')) return null;
      const id = 'sp:' + a.id;
      const known = S.remote.get(id);
      if (known) return known;
      const imgs = a.album?.images || [];
      const t = {
        id, source: 'spotify', uri: a.uri || `spotify:track:${a.id}`,
        title: a.name || 'Без названия', artist: (a.artists || []).map((x) => x.name).join(', '), album: '', albumArtist: '',
        genre: a.album?.name || 'Spotify', duration: (a.duration_ms || 0) / 1000,
        art: imgs[0]?.url || '', artSmall: (imgs[imgs.length - 1] || imgs[0])?.url || '',
        permalink: a.external_urls?.spotify || `https://open.spotify.com/track/${a.id}`,
        cover: null, color: null, addedAt: 0, plays: 0, lastPlayed: 0, liked: false, likedAt: 0,
      };
      S.remote.set(id, t);
      return t;
    }
    async function search(q) {
      // с февраля 2026 Spotify отдаёт не больше 10 треков за запрос — берём три страницы
      const pages = await Promise.all([0, 10, 20].map((offset) => api('/search', { query: { q, type: 'track', limit: 10, offset } })
        .catch((e) => { if (offset === 0) throw e; return null; })));
      const seen = new Set();
      return pages.flatMap((p) => p?.tracks?.items || []).map(toTrack).filter((t) => t && !seen.has(t.id) && seen.add(t.id));
    }
    async function liked() {
      const out = [];
      for (let offset = 0; offset < 300; offset += 50) {
        const d = await api('/me/tracks', { query: { limit: 50, offset } });
        out.push(...(d?.items || []).map((x) => toTrack(x.track || x.item)));
        if (!d?.next) break;
      }
      return out.filter(Boolean);
    }
    async function playlists() {
      const d = await api('/me/playlists', { query: { limit: 50 } });
      return (d?.items || []).filter(Boolean).map((p) => {
        const total = p.items?.total ?? p.tracks?.total;
        return { id: p.id, title: p.name || 'Плейлист', art: p.images?.[0]?.url || '', sub: [p.owner?.display_name, total != null ? tracksWord(total) : ''].filter(Boolean).join(' · ') };
      });
    }
    const plState = new Map();
    function playlistState(id) {
      const st = plState.get(id);
      if (st) return st;
      plState.set(id, { loading: true });
      (async () => {
        try {
          const meta = await api(`/playlists/${encodeURIComponent(id)}`, { query: { fields: 'name,uri,images,owner(display_name)' } });
          const tracks = [];
          try {
            for (let offset = 0; offset < 500; offset += 100) {
              const d = await api(`/playlists/${encodeURIComponent(id)}/items`, { query: { limit: 100, offset } });
              tracks.push(...(d?.items || []).map((x) => toTrack(x.item || x.track)));
              if (!d?.next) break;
            }
          } catch (e) { if (e.auth) throw e; /* чужой плейлист — Spotify не отдаёт треки */ }
          plState.set(id, { pl: { id, title: meta?.name || 'Плейлист', art: meta?.images?.[0]?.url || '', owner: meta?.owner?.display_name || '', tracks: tracks.filter(Boolean) } });
        } catch (e) {
          plState.set(id, { error: e.message });
        }
        if (S.view?.name === 'sp' && S.view.param === id) render();
      })();
      return plState.get(id);
    }
    const playlistCard = (p) => card({
      href: `#/sp/${encodeURIComponent(p.id)}`,
      cover: p.art ? `<img class="cover" src="${esc(p.art)}" alt="" loading="lazy" draggable="false">` : `<div class="cover ph" style="--h:${hashHue(p.title)}">${ic('list')}</div>`,
      title: p.title, sub: esc(p.sub), play: `sp-pl:${p.id}`,
    });

    /* --- воспроизведение --- */
    let sdkPlayer = null;
    let sdkDevice = null;
    let sdkState = 'idle'; // idle | loading | ready | failed
    const st = { playing: false, pos: 0, dur: 0, at: 0, trackId: null, device: '' };
    let poll = null;
    let lastPlay = null;
    const canSDK = () => !Native && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) && 'requestMediaKeySystemAccess' in navigator;
    const sdkActive = () => !!sdkDevice && st.device === 'MP3UP';

    function loadSDK() {
      if (!canSDK() || sdkState !== 'idle' || !tok) return;
      sdkState = 'loading';
      window.onSpotifyWebPlaybackSDKReady = () => {
        sdkPlayer = new window.Spotify.Player({
          name: 'MP3UP',
          getOAuthToken: (cb) => { access().then(cb).catch(() => {}); },
          volume: audio.muted ? 0 : audio.volume,
        });
        sdkPlayer.addListener('ready', ({ device_id: id }) => { sdkDevice = id; sdkState = 'ready'; fillOnline(); });
        sdkPlayer.addListener('not_ready', () => { sdkDevice = null; });
        const fail = ({ message }) => { console.warn('Spotify SDK:', message); sdkState = 'failed'; sdkDevice = null; fillOnline(); };
        sdkPlayer.addListener('initialization_error', fail);
        sdkPlayer.addListener('authentication_error', fail);
        sdkPlayer.addListener('account_error', fail);
        sdkPlayer.addListener('player_state_changed', (s) => {
          if (ext !== engine || !s || st.device !== 'MP3UP') return;
          applyState({ playing: !s.paused, pos: s.position / 1000, dur: s.duration / 1000, track: s.track_window?.current_track });
        });
        sdkPlayer.connect();
      };
      const sc = document.createElement('script');
      sc.src = 'https://sdk.scdn.co/spotify-player.js';
      sc.onerror = () => { sdkState = 'failed'; fillOnline(); };
      document.head.append(sc);
    }
    function statusHTML() {
      if (!tok) return '';
      let text;
      if (sdkState === 'ready') text = 'Музыка играет прямо в MP3UP.';
      else if (sdkState === 'loading') text = 'Подключаем плеер Spotify…';
      else if (sdkState === 'failed') text = 'Встроенный плеер Spotify недоступен (нужен Premium) — MP3UP будет управлять приложением Spotify на ваших устройствах.';
      else text = 'MP3UP управляет приложением Spotify на ваших устройствах — оно должно быть запущено.';
      return `${ic('globe')}<span>${text}${st.device && ext === engine ? ` Сейчас играет на: <b>${esc(st.device)}</b>.` : ''}</span><button class="link-btn" data-act="spotify-logout">Выйти</button>`;
    }

    function applyState({ playing, pos, dur, track, device }) {
      st.playing = playing;
      st.pos = pos;
      if (dur) st.dur = dur;
      st.at = performance.now();
      if (device != null) st.device = device;
      const t = track ? toTrack(track) : null;
      if (t) { st.trackId = t.id; if (dur) t.duration = dur; }
      onExtState();
    }
    async function refresh() {
      try {
        const s = await api('/me/player');
        if (ext !== engine) return;
        if (!s) { applyState({ playing: false, pos: st.pos, dur: st.dur }); return; }
        applyState({ playing: !!s.is_playing, pos: (s.progress_ms || 0) / 1000, dur: (s.item?.duration_ms || 0) / 1000, track: s.item, device: s.device?.name || '' });
      } catch (e) {
        if (e.auth) { deactivateExt(); render(); }
      }
    }
    function stopPoll() { clearInterval(poll); poll = null; }
    function startPoll() {
      stopPoll();
      poll = setInterval(() => { if (!document.hidden || Native) refresh(); }, sdkActive() ? 15000 : 2500);
    }
    function handleErr(e) {
      if (e.auth) { toast(e.message, 'warn', 4000); logout(); render(); return; }
      if (e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') { noDevice(); return; }
      if (e.status === 403) { toast('Для управления воспроизведением Spotify нужен Premium', 'warn', 5000); return; }
      toast(`Spotify: ${e.message}`, 'warn', 4000);
    }
    function noDevice() {
      const openUrl = Native ? 'spotify:' : 'https://open.spotify.com';
      const m = openModal(`
        <div class="modal-head"><h3>Где играть музыку?</h3><button class="icon-btn round" data-m="close" aria-label="Закрыть">${ic('close')}</button></div>
        <p class="m-text">${canSDK() ? 'Встроенный плеер Spotify не запустился. ' : ''}Откройте приложение Spotify на телефоне или компьютере (достаточно просто запустить его) и нажмите «Повторить» — MP3UP будет им управлять.</p>
        <div class="modal-actions">
          <a class="btn btn-ghost" href="${openUrl}" target="_blank" rel="noopener">${ic('share')}Открыть Spotify</a>
          <button class="btn btn-primary" data-m="retry">Повторить</button>
        </div>`);
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-m="close"]')) m.close();
        if (e.target.closest('[data-m="retry"]')) { m.close(true); retry(); }
      });
    }
    async function pickDevice() {
      if (sdkDevice) return { id: sdkDevice, name: 'MP3UP' };
      const d = await api('/me/player/devices');
      const list = (d?.devices || []).filter((x) => !x.is_restricted);
      return list.find((x) => x.is_active) || list.find((x) => x.type === 'Smartphone') || list[0] || null;
    }
    async function start(body, trackId, label, key, { shuffle = false } = {}) {
      lastPlay = [body, trackId, label, key, { shuffle }];
      let dev;
      try { dev = await pickDevice(); } catch (e) { handleErr(e); return; }
      if (!dev) { noDevice(); return; }
      activateExt(engine);
      S.ctxLabel = label;
      S.ctxKey = key;
      st.device = dev.name;
      try {
        if (shuffle) await api('/me/player/shuffle', { method: 'PUT', query: { state: true, device_id: dev.id } }).catch(() => {});
        await api('/me/player/play', { method: 'PUT', query: { device_id: dev.id }, body });
      } catch (e) {
        deactivateExt();
        handleErr(e);
        return;
      }
      st.trackId = trackId || st.trackId;
      applyState({ playing: true, pos: 0, dur: getTrack(trackId)?.duration || 0 });
      if (!sdkActive()) toast(`Играет в Spotify на «${dev.name}»`, 'ok', 2500);
      startPoll();
      setTimeout(refresh, 900);
    }
    const retry = () => { if (lastPlay) start(...lastPlay); };
    function playTracks(ids, idx, label, key) {
      const list = ids.map(getTrack).filter((t) => t?.source === 'spotify');
      const first = list[idx] || list[0];
      if (!first) return;
      if (key?.startsWith('sp-pl:')) {
        start({ context_uri: `spotify:playlist:${key.slice(6)}`, offset: { uri: first.uri } }, first.id, label, key);
        return;
      }
      const win = list.slice(Math.max(0, list.indexOf(first)), list.indexOf(first) + 100);
      start({ uris: win.map((t) => t.uri) }, first.id, label, key);
    }
    function playPlaylist(id, { shuffle = false } = {}) {
      const pl = plState.get(id)?.pl;
      start({ context_uri: `spotify:playlist:${id}` }, null, pl?.title || 'Плейлист Spotify', 'sp-pl:' + id, { shuffle });
    }
    function cmd(fn, optimistic) {
      if (optimistic) {
        if ('playing' in optimistic) { st.pos = engine.position(); st.at = performance.now(); st.playing = optimistic.playing; }
        if ('pos' in optimistic) { st.pos = optimistic.pos; st.at = performance.now(); }
        onExtState();
      }
      Promise.resolve().then(fn).then(() => setTimeout(refresh, 700)).catch(handleErr);
    }
    let volTimer;
    const engine = {
      name: 'spotify',
      label: 'Spotify',
      playing: () => st.playing,
      position: () => Math.min(st.dur || Infinity, st.pos + (st.playing ? (performance.now() - st.at) / 1000 : 0)),
      duration: () => st.dur,
      trackId: () => st.trackId,
      toggle() { if (st.playing) this.pause(); else this.play(); },
      play() { cmd(() => (sdkActive() ? sdkPlayer.resume() : api('/me/player/play', { method: 'PUT' })), { playing: true }); },
      pause() { cmd(() => (sdkActive() ? sdkPlayer.pause() : api('/me/player/pause', { method: 'PUT' })), { playing: false }); },
      next() { cmd(() => (sdkActive() ? sdkPlayer.nextTrack() : api('/me/player/next', { method: 'POST' }))); },
      prev() { cmd(() => (sdkActive() ? sdkPlayer.previousTrack() : api('/me/player/previous', { method: 'POST' }))); },
      seek(sec) {
        sec = clamp(sec, 0, st.dur || 0);
        cmd(() => (sdkActive() ? sdkPlayer.seek(Math.round(sec * 1000)) : api('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(sec * 1000) } })), { pos: sec });
      },
      setVolume(v) {
        clearTimeout(volTimer);
        volTimer = setTimeout(() => {
          if (sdkActive()) sdkPlayer.setVolume(v).catch(() => {});
          else if (tok && ext === engine) api('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(v * 100) } }).catch(() => {});
        }, 300);
      },
      stop() {
        stopPoll();
        if (st.playing) Promise.resolve().then(() => (sdkActive() ? sdkPlayer.pause() : api('/me/player/pause', { method: 'PUT' }))).catch(() => {});
        st.playing = false;
      },
    };

    /* --- настройка --- */
    function setupHTML(error) {
      const fileMode = location.protocol === 'file:';
      const localhost = location.hostname === 'localhost';
      return `<div class="setup-card">
        <h3>Подключите свой Spotify</h3>
        <p>MP3UP работает через официальный API Spotify. Нужны <b>Spotify Premium</b> и ваш личный бесплатный ключ приложения (Client ID):</p>
        ${fileMode ? '<p class="setup-error">Сейчас MP3UP открыт как файл — Spotify так не пустит. Откройте плеер через сайт, start.bat / start.sh или Android-приложение.</p>' : ''}
        ${localhost ? `<p class="setup-error">Spotify не принимает адрес «localhost». Откройте MP3UP по адресу <b>${esc(location.href.replace('localhost', '127.0.0.1'))}</b>.</p>` : ''}
        <ol>
          ${setupStep('Откройте <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a>, войдите и нажмите <b>Create app</b>.')}
          ${setupStep(`Название и описание — любые. В поле <b>Redirect URIs</b> добавьте адрес: ${copyField(redirectUri())}${Native ? '' : ' Если пользуетесь и Android-приложением, добавьте ещё ' + copyField('mp3up://spotify-callback')}`)}
          ${setupStep('В пункте <b>APIs used</b> отметьте <b>Web API</b> и <b>Web Playback SDK</b>, сохраните.')}
          ${setupStep('Откройте настройки приложения, скопируйте <b>Client ID</b> и вставьте сюда.')}
        </ol>
        <div class="setup-row">
          <input class="input" id="spotifyKey" placeholder="Client ID" value="${esc(clientId())}" autocomplete="off" spellcheck="false">
          <button class="btn btn-primary" data-act="spotify-save">Сохранить</button>
        </div>
        ${error ? `<p class="setup-error">${esc(error)}</p>` : ''}
        <p class="dim">Spotify официально не работает в России — нужен действующий аккаунт с Premium. Ключ хранится только на этом устройстве.</p>
      </div>`;
    }
    function loginHTML(error) {
      return `<div class="setup-card">
        <h3>Войдите в Spotify</h3>
        <p>Откроется страница Spotify — войдите и разрешите доступ. После этого здесь появятся ваши плейлисты, «Любимые треки» и поиск.</p>
        ${error ? `<p class="setup-error">${esc(error)}</p>` : ''}
        <div class="setup-row"><button class="btn btn-primary lg" data-act="spotify-login">${ic('user')}Войти через Spotify</button></div>
        <p class="dim">Не получается? Проверьте, что в настройках приложения Spotify указан Redirect URI ${copyField(redirectUri())} <button class="link-btn" data-act="spotify-client-reset">Сменить Client ID</button></p>
      </div>`;
    }
    function saveClient() {
      const input = $('#spotifyKey');
      const id = input?.value.trim();
      if (!id || !/^[0-9a-f]{32}$/i.test(id)) {
        toast('Client ID — это 32 символа из цифр и букв a–f', 'warn', 4000);
        input?.classList.remove('err'); void input?.offsetWidth; input?.classList.add('err');
        return;
      }
      LS.set('spotifyClientId', id);
      render();
    }
    function resetClient() { logout(); LS.set('spotifyClientId', ''); }

    return {
      hasClient: () => !!clientId(), loggedIn: () => !!tok && !!clientId(),
      login, logout, handleCallback, saveClient, resetClient, setupHTML, loginHTML, statusHTML,
      search, liked, playlists, playlistState, forgetPlaylist: (id) => plState.delete(id), playlistCard,
      loadSDK, playTracks, playPlaylist, retry, engine,
    };
  })();

  /* ---------- YouTube: официальный встроенный плеер (IFrame API) ---------- */
  const YouTube = (() => {
    const API = 'https://www.googleapis.com/youtube/v3';
    const key = () => LS.get('youtubeKey', '');
    const decode = (s) => { const el = document.createElement('textarea'); el.innerHTML = s || ''; return el.value; };
    function isoDur(v) {
      const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(v || '');
      return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
    }
    function toTrack(v) {
      const id = 'yt:' + v.id;
      const known = S.remote.get(id);
      if (known) { if (!known.duration && v.duration) known.duration = v.duration; return known; }
      const t = {
        id, source: 'youtube', videoId: v.id,
        title: decode(v.title) || 'Видео YouTube', artist: decode(v.channel).replace(/ - Topic$/, ''), album: '', albumArtist: '',
        genre: 'YouTube', duration: v.duration || 0,
        art: v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, artSmall: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        permalink: `https://www.youtube.com/watch?v=${v.id}`,
        cover: null, color: null, addedAt: 0, plays: 0, lastPlayed: 0, liked: false, likedAt: 0,
      };
      S.remote.set(id, t);
      return t;
    }
    async function get(path, params, apiKey = key()) {
      const u = new URL(API + path);
      for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.searchParams.set(k, v);
      u.searchParams.set('key', apiKey);
      const r = await fetch(u);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const reason = d?.error?.errors?.[0]?.reason || '';
        const msg = reason === 'quotaExceeded' ? 'Дневной лимит запросов YouTube исчерпан — поиск снова заработает завтра. Ссылки работают и сейчас.'
          : reason === 'accessNotConfigured' ? 'В проекте Google не включён YouTube Data API v3 — включите его и попробуйте снова.'
            : /API key/i.test(d?.error?.message || '') || reason === 'keyInvalid' ? 'YouTube не принял ключ — проверьте его.'
              : d?.error?.message || `YouTube ответил ${r.status}`;
        throw Object.assign(new Error(msg), { auth: reason === 'keyInvalid' || reason === 'accessNotConfigured' || /API key/i.test(d?.error?.message || '') });
      }
      return d;
    }
    const mapVideo = (v) => toTrack({
      id: v.id, title: v.snippet?.title, channel: v.snippet?.channelTitle,
      thumb: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url, duration: isoDur(v.contentDetails?.duration),
    });
    async function details(ids) {
      if (!ids.length) return [];
      const d = await get('/videos', { part: 'snippet,contentDetails', id: ids.join(','), maxResults: 50 });
      const byId = new Map((d.items || []).map((v) => [v.id, v]));
      return ids.map((id) => byId.get(id)).filter(Boolean).map(mapVideo);
    }
    function parseLink(s) {
      if (!s || !/youtu/i.test(s)) return null;
      try {
        const u = new URL(s.trim().startsWith('http') ? s.trim() : 'https://' + s.trim());
        if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) return null;
        let v = u.searchParams.get('v');
        if (/youtu\.be$/i.test(u.hostname)) v = u.pathname.slice(1, 12);
        const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/);
        if (m) v = m[2];
        const list = u.searchParams.get('list');
        v = v && /^[\w-]{11}$/.test(v) ? v : null;
        return v || list ? { v, list } : null;
      } catch { return null; }
    }
    async function oembed(id) {
      try {
        const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
        const d = await r.json();
        return toTrack({ id, title: d.title, channel: d.author_name, thumb: d.thumbnail_url });
      } catch { return toTrack({ id, title: 'Видео YouTube', channel: '' }); }
    }
    async function query(q, region) {
      const link = parseLink(q);
      if (link) {
        const tracks = link.v ? [key() ? (await details([link.v]).catch(() => []))[0] || await oembed(link.v) : await oembed(link.v)] : [];
        const items = link.list ? [{ list: link.list, title: 'Плейлист YouTube', sub: 'Включить весь плейлист' }] : [];
        return items.length ? { items, itemKind: 'yt', tracks } : { tracks };
      }
      if (!q) {
        const d = await get('/videos', { part: 'snippet,contentDetails', chart: 'mostPopular', videoCategoryId: '10', regionCode: region || 'RU', maxResults: 40 });
        return { tracks: (d.items || []).map(mapVideo) };
      }
      const d = await get('/search', { part: 'snippet', type: 'video', maxResults: 30, q, regionCode: region || 'RU' });
      return { tracks: await details((d.items || []).map((x) => x.id?.videoId).filter(Boolean)) };
    }
    const listCard = (it) => card({
      href: `https://www.youtube.com/playlist?list=${encodeURIComponent(it.list)}`,
      cover: `<div class="cover ph" style="--h:0">${ic('list')}</div>`, title: it.title, sub: esc(it.sub), play: `yt-list:${it.list}`,
    });

    /* --- плеер --- */
    let yt = null;
    let apiReady = null;
    let box = null;
    const st = { playing: false, trackId: null };
    function ensureBox() {
      if (box) return box;
      box = document.createElement('div');
      box.className = 'yt-box';
      box.innerHTML = `<div class="yt-head"><svg class="ic"><use href="#i-play"/></svg><span id="ytTitle">YouTube</span>
        <button class="icon-btn sm" data-act="yt-big" title="Крупнее / мельче" aria-label="Крупнее">${ic('expand')}</button>
        <button class="icon-btn sm" data-act="yt-close" title="Остановить YouTube" aria-label="Закрыть">${ic('close')}</button></div>
        <div class="yt-video"><div id="ytFrame"></div></div>`;
      document.body.append(box);
      return box;
    }
    function loadAPI() {
      if (apiReady) return apiReady;
      apiReady = new Promise((resolve, reject) => {
        if (window.YT?.Player) { resolve(); return; }
        window.onYouTubeIframeAPIReady = () => resolve();
        const sc = document.createElement('script');
        sc.src = 'https://www.youtube.com/iframe_api';
        sc.onerror = () => { apiReady = null; reject(new Error('Не удалось загрузить плеер YouTube — проверьте интернет')); };
        document.head.append(sc);
      });
      return apiReady;
    }
    async function ensurePlayer() {
      ensureBox();
      await loadAPI();
      if (yt) return yt;
      return new Promise((resolve) => {
        const vars = { playsinline: 1, rel: 0, fs: 0, modestbranding: 1 };
        if (location.protocol.startsWith('http')) vars.origin = location.origin;
        yt = new window.YT.Player('ytFrame', {
          width: '100%', height: '100%', playerVars: vars,
          events: {
            onReady: () => resolve(yt),
            onStateChange: (e) => onState(e.data),
            onError: (e) => {
              const blocked = e.data === 101 || e.data === 150;
              toast(blocked ? 'Автор запретил показывать это видео вне YouTube — пропускаем' : 'YouTube не смог воспроизвести видео', 'warn', 3500);
              setTimeout(() => { try { yt.nextVideo(); } catch { /* конец списка */ } }, 1200);
            },
          },
        });
      });
    }
    function currentTrack() {
      const vd = yt?.getVideoData?.() || {};
      if (!vd.video_id) return null;
      const t = getTrack('yt:' + vd.video_id) || toTrack({ id: vd.video_id, title: vd.title, channel: vd.author });
      if ((t.title === 'Видео YouTube' || !t.title) && vd.title) t.title = vd.title;
      if (!t.artist && vd.author) t.artist = vd.author;
      const d = yt.getDuration?.();
      if (d) t.duration = d;
      return t;
    }
    function onState(s) {
      if (ext !== engine) return;
      st.playing = s === 1 || s === 3;
      const t = currentTrack();
      if (t) {
        st.trackId = t.id;
        const title = $('#ytTitle');
        if (title) title.textContent = `${t.artist ? t.artist + ' — ' : ''}${t.title}`;
      }
      onExtState();
    }
    async function begin(load, label, key) {
      activateExt(engine);
      S.ctxLabel = label;
      S.ctxKey = key;
      ensureBox().classList.add('show');
      try {
        await ensurePlayer();
        if (ext !== engine) return;
        load(yt);
        engine.setVolume(audio.muted ? 0 : audio.volume);
      } catch (e) {
        toast(e.message, 'warn', 4000);
        deactivateExt();
      }
    }
    function playTracks(ids, idx, label, key) {
      const list = ids.map(getTrack).filter((t) => t?.source === 'youtube').slice(0, 200);
      if (!list.length) return;
      st.trackId = list[idx]?.id || list[0].id;
      begin((p) => p.loadPlaylist(list.map((t) => t.videoId), clamp(idx, 0, list.length - 1)), label || 'YouTube', key);
    }
    function playList(listId) {
      begin((p) => p.loadPlaylist({ list: listId, listType: 'playlist', index: 0 }), 'Плейлист YouTube', 'yt-list:' + listId);
    }
    const call = (fn) => { try { return yt && fn(yt); } catch { return undefined; } };
    const engine = {
      name: 'youtube',
      label: 'YouTube',
      playing: () => st.playing,
      position: () => call((p) => p.getCurrentTime()) || 0,
      duration: () => call((p) => p.getDuration()) || getTrack(st.trackId)?.duration || 0,
      trackId: () => st.trackId,
      toggle() { if (st.playing) this.pause(); else this.play(); },
      play() { call((p) => p.playVideo()); },
      pause() { call((p) => p.pauseVideo()); },
      next() { call((p) => p.nextVideo()); },
      prev() { call((p) => (p.getCurrentTime() > 3 ? p.seekTo(0, true) : p.previousVideo())); },
      seek(sec) { call((p) => p.seekTo(Math.max(0, sec), true)); },
      setVolume(v) { call((p) => { p.setVolume(Math.round(v * 100)); if (v === 0) p.mute(); else p.unMute(); }); },
      stop() {
        call((p) => p.pauseVideo());
        st.playing = false;
        box?.classList.remove('show', 'big');
      },
    };

    /* --- настройка --- */
    function setupHTML(error) {
      return `<div class="setup-card">
        <h3>YouTube в MP3UP</h3>
        <p><b>Ссылки работают сразу:</b> вставьте в строку поиска выше ссылку на видео или плейлист YouTube — и он заиграет.</p>
        <p>Для поиска и чартов нужен бесплатный ключ YouTube Data API:</p>
        <ol>
          ${setupStep('Откройте <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">YouTube Data API v3 в Google Cloud</a>, создайте проект (если попросит) и нажмите <b>Enable</b>.')}
          ${setupStep('Перейдите в <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials</a> → <b>Create credentials</b> → <b>API key</b>.')}
          ${setupStep('Скопируйте ключ и вставьте сюда.')}
        </ol>
        <div class="setup-row">
          <input class="input" id="youtubeKey" placeholder="API key" value="${esc(key())}" autocomplete="off" spellcheck="false">
          <button class="btn btn-primary" data-act="yt-save">Подключить</button>
        </div>
        ${error ? `<p class="setup-error">${esc(error)}</p>` : ''}
        <p class="dim">Бесплатно — около 100 поисков в день. Ключ хранится только на этом устройстве. Видео играет во встроенном плеере YouTube — так требуют правила сервиса.</p>
      </div>`;
    }
    async function saveKey() {
      const input = $('#youtubeKey');
      const k = input?.value.trim();
      if (!k) { input?.classList.remove('err'); void input?.offsetWidth; input?.classList.add('err'); return; }
      const t = toast('Проверяем ключ…', 'load', 0);
      try {
        await get('/videos', { part: 'id', id: 'dQw4w9WgXcQ' }, k);
        LS.set('youtubeKey', k);
        for (const x of [...ON.results.keys()]) if (x.startsWith('youtube|')) ON.results.delete(x);
        t.close();
        toast('YouTube подключён', 'ok');
        render();
      } catch (e) {
        t.close();
        toast(e.message, 'warn', 5000);
      }
    }
    return {
      hasKey: () => !!key(), parseLink, query, listCard, setupHTML, saveKey,
      resetKey: () => { LS.set('youtubeKey', ''); for (const x of [...ON.results.keys()]) if (x.startsWith('youtube|')) ON.results.delete(x); },
      playTracks, playList, toggleBig: () => box?.classList.toggle('big'), engine,
    };
  })();

  /* ---------- Экраны ---------- */
  const views = {
    home() {
      const all = allTracks();
      if (!all.length) return { html: welcome() };
      const h = new Date().getHours();
      const greet = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
      const liked = likedTracks();
      const albums = getAlbums();
      const artists = getArtists();
      const playlists = [...S.playlists.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const tiles = [];
      if (liked.length) tiles.push({ href: '#/liked', cover: likedCover(), name: 'Любимые треки', play: 'liked' });
      playlists.slice(0, 3).forEach((p) => tiles.push({ href: `#/playlist/${p.id}`, cover: playlistCover(p), name: p.name, play: `playlist:${p.id}` }));
      [...albums].sort((a, b) => b.plays - a.plays || b.addedAt - a.addedAt).slice(0, 6 - tiles.length)
        .forEach((a) => tiles.push({ href: `#/album/${encodeURIComponent(a.name)}`, cover: coverHTML(a.coverTrack), name: a.name, play: `album:${a.key}` }));
      if (tiles.length < 6) [...artists].sort((a, b) => b.plays - a.plays).slice(0, 6 - tiles.length)
        .forEach((a) => tiles.push({ href: `#/artist/${encodeURIComponent(a.name)}`, cover: coverHTML(a.coverTrack), name: a.name, play: `artist:${a.key}` }));

      const recent = sortTracks(all, 'added').slice(0, 14);
      const recentLid = regList(recent.map((t) => t.id), 'Недавно добавленные', 'recent');
      const top = sortTracks(all.filter((t) => t.plays), 'plays').slice(0, 5);
      const topAlbums = [...albums].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
      const topArtists = [...artists].sort((a, b) => b.plays - a.plays || b.tracks.length - a.tracks.length).slice(0, 12);

      const html = `
        <h1 class="greet">${greet}</h1>
        ${tiles.length >= 2 ? `<div class="quick">${tiles.map((t) => `
          <a class="tile" href="${t.href}">${t.cover}<span class="tile-name">${esc(t.name)}</span>
          <button class="card-play" data-play="${esc(t.play)}" aria-label="Слушать">${ic('play')}</button></a>`).join('')}</div>` : ''}

        <section class="wave">
          <div class="wave-blobs"><i></i><i></i><i></i></div>
          <div class="wave-content">
            <div class="wave-label">${ic('wave')} Моя волна</div>
            <h2>Бесконечный поток вашей музыки</h2>
            <p>Нажмите — и слушайте без остановки. Любимые и часто слушаемые треки звучат чаще, недавние — реже.</p>
            <button class="btn btn-white lg" data-play="wave">${ic('play')}<span data-off="Запустить волну" data-on="Пауза">Запустить волну</span></button>
          </div>
        </section>

        <section class="section">
          <div class="sec-head"><h2>Недавно добавленные</h2><a href="#/library/tracks">Показать все</a></div>
          <div class="shelf">${recent.map((t, i) => card({ href: t.album ? `#/album/${encodeURIComponent(t.album)}` : `#/artist/${encodeURIComponent(artistOf(t))}`, cover: coverHTML(t), title: t.title, sub: esc(artistOf(t)), play: `list:${recentLid}:${i}` })).join('')}</div>
        </section>

        <section class="section">
          <div class="sec-head"><h2>В тренде на Audius</h2><a href="#/online">Показать все</a></div>
          <div class="shelf" id="homeOnline">${homeOnlineHTML(true)}</div>
        </section>

        ${top.length ? `<section class="section">
          <div class="sec-head"><h2>Часто слушаете</h2><a href="#/library/tracks" data-sort="plays">Показать все</a></div>
          ${trackList(top, { label: 'Часто слушаете', key: 'top', compact: true })}
        </section>` : ''}

        ${topAlbums.length ? `<section class="section">
          <div class="sec-head"><h2>Альбомы</h2><a href="#/library/albums">Показать все</a></div>
          <div class="shelf">${topAlbums.map(albumCard).join('')}</div>
        </section>` : ''}

        <section class="section">
          <div class="sec-head"><h2>Исполнители</h2><a href="#/library/artists">Показать все</a></div>
          <div class="shelf">${topArtists.map(artistCard).join('')}</div>
        </section>`;
      return { html, color: recent[0] ? colorOf(recent[0]) : null };
    },

    search() {
      const all = allTracks();
      const q = S.q.trim();
      const onlineBtn = q ? `<a class="btn btn-primary" href="#/online/${encodeURIComponent(q)}">${ic('globe')}Искать «${esc(q)}» в Audius</a>` : `<a class="btn btn-primary" href="#/online">${ic('globe')}Слушать онлайн</a>`;
      if (!all.length) return { html: emptyBlock('search', 'В медиатеке пока пусто', 'Добавьте свои MP3 или найдите музыку онлайн.', onlineBtn) + (q ? servicesHTML(q) : '') };
      if (!q) {
        const genres = new Map();
        all.forEach((t) => { if (t.genre) { const k = norm(t.genre); const g = genres.get(k) || { name: t.genre, n: 0 }; g.n++; genres.set(k, g); } });
        const gl = [...genres.values()].sort((a, b) => b.n - a.n).slice(0, 18);
        const artists = getArtists().sort((a, b) => collator.compare(a.name, b.name));
        return { html: `
          <div class="page-head"><h1>Поиск</h1></div>
          ${gl.length ? `<section class="section" style="margin-top:0"><div class="sec-head"><h2>Жанры</h2></div>
            <div class="genres">${gl.map((g) => `<button class="genre" style="--h:${hashHue(g.name)}" data-play="genre:${esc(g.name)}">${esc(g.name)}<small>${tracksWord(g.n)}</small></button>`).join('')}</div></section>` : ''}
          <section class="section" ${gl.length ? '' : 'style="margin-top:0"'}><div class="sec-head"><h2>Все исполнители</h2></div>
            <div class="grid">${artists.map(artistCard).join('')}</div></section>` };
      }
      const tracks = filterTracks(all, q);
      const nq = norm(q);
      const artists = getArtists().filter((a) => norm(a.name).includes(nq));
      const albums = getAlbums().filter((a) => norm(a.name).includes(nq) || norm(a.artist).includes(nq));
      if (!tracks.length && !artists.length && !albums.length) {
        return { html: emptyBlock('search', `В медиатеке нет «${esc(q)}»`, 'Зато можно поискать среди бесплатных треков онлайн.', onlineBtn) + servicesHTML(q) };
      }
      const bestArtist = artists.find((a) => norm(a.name).startsWith(nq));
      let best = '';
      if (bestArtist) {
        best = `<a class="best round" href="#/artist/${encodeURIComponent(bestArtist.name)}">${coverHTML(bestArtist.coverTrack)}<h3>${esc(bestArtist.name)}</h3><span class="badge">Исполнитель</span><button class="card-play" data-play="artist:${esc(bestArtist.key)}" aria-label="Слушать">${ic('play')}</button></a>`;
      } else if (tracks[0]) {
        const t = tracks[0];
        const lid = regList(tracks.map((x) => x.id), `Поиск: ${q}`);
        best = `<a class="best" href="#/artist/${encodeURIComponent(artistOf(t))}">${coverHTML(t)}<h3>${esc(t.title)}</h3><span class="t2">${esc(artistOf(t))}</span><br><span class="badge">Трек</span><button class="card-play" data-play="list:${lid}:0" aria-label="Слушать">${ic('play')}</button></a>`;
      }
      return { html: `
        <div class="search-top">
          <section><div class="sec-head"><h2>Лучший результат</h2></div>${best}</section>
          ${tracks.length ? `<section><div class="sec-head"><h2>Треки</h2></div>${trackList(tracks.slice(0, 5), { label: `Поиск: ${q}`, compact: true })}</section>` : ''}
        </div>
        ${tracks.length > 5 ? `<section class="section"><div class="sec-head"><h2>Все треки · ${tracks.length}</h2></div>${trackList(tracks.slice(0, 200), { label: `Поиск: ${q}` })}</section>` : ''}
        ${artists.length ? `<section class="section"><div class="sec-head"><h2>Исполнители</h2></div><div class="shelf">${artists.slice(0, 20).map(artistCard).join('')}</div></section>` : ''}
        ${albums.length ? `<section class="section"><div class="sec-head"><h2>Альбомы</h2></div><div class="shelf">${albums.slice(0, 20).map(albumCard).join('')}</div></section>` : ''}
        <div class="online-cta">${onlineBtn}</div>
        ${servicesHTML(q)}` };
    },

    online(q) {
      q = (q || '').trim();
      const src = SOURCES[ON.source];
      if (!onlineFresh(onlineKey(q))) setTimeout(() => loadOnline(q), 0);
      const needsKey = (ON.source === 'jamendo' && !Jamendo.hasKey()) || (ON.source === 'spotify' && !Spotify.loggedIn());
      if (ON.source === 'spotify' && Spotify.loggedIn()) Spotify.loadSDK();
      return { html: `
        <div class="page-head"><div><h1>Онлайн</h1><p class="page-sub">Бесплатная и легальная музыка — без подписки и рекламы</p></div></div>
        <div class="tabs source-tabs">${Object.entries(SOURCES).map(([k, x]) => `<button class="tab ${k === ON.source ? 'active' : ''}" data-source="${k}">${x.name}</button>`).join('')}</div>
        ${ON.source === 'spotify' && Spotify.loggedIn() ? `<div class="ext-status" id="extStatus">${Spotify.statusHTML()}</div>` : ''}
        ${needsKey ? '' : `<label class="online-search">${ic('search')}<input id="onlineQ" type="search" placeholder="${esc(src.placeholder)}" value="${esc(q)}" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
        <div class="chips" id="onlineGenres" ${q ? 'hidden' : ''}>${src.genres.map(([g, l]) => `<button class="chip ${g === curGenre() ? 'active' : ''}" data-genre="${esc(g)}">${l}</button>`).join('')}</div>`}
        <section class="section online-section">
          ${needsKey ? '' : `<div class="sec-head"><h2 id="onlineTitle">${esc(onlineTitle(q))}</h2></div>`}
          <div id="onlineResults">${onlineResultsHTML(q)}</div>
        </section>
        <p class="online-note">${ic('globe')}<span>Музыку предоставляет <a href="${src.url}" target="_blank" rel="noopener">${src.name}</a> — ${src.note}. Нужен интернет.${src.ext ? '' : ' Нажмите ♥, чтобы сохранить трек в медиатеку.'}${ON.source === 'youtube' && YouTube.hasKey() ? ' <button class="link-btn" data-act="yt-reset">Сменить ключ</button>' : ''}${ON.source === 'jamendo' ? ' Для треков Jamendo не работают эквалайзер и визуализатор — их сервер это не разрешает.' : ''}${ON.source === 'jamendo' && Jamendo.hasKey() ? ' <button class="link-btn" data-act="jamendo-reset">Сменить ключ</button>' : ''}</span></p>`,
      color: { h: 268, s: 62, l: 50 } };
    },

    sp(id) {
      if (!Spotify.loggedIn()) {
        return { html: emptyBlock('globe', 'Войдите в Spotify', 'Плейлисты Spotify доступны после входа в разделе «Онлайн».', '<a class="btn btn-primary" href="#/online">Перейти</a>') };
      }
      const st = Spotify.playlistState(id);
      if (!st || st.loading) return { html: `<div class="hero"><div class="hero-cover"><div class="sk-card"><i></i></div></div></div>${skeletonRows()}` };
      if (st.error) return { html: emptyBlock('globe', 'Не удалось загрузить плейлист', esc(st.error), `<button class="btn btn-primary" data-act="spotify-pl-retry" data-id="${esc(id)}">Повторить</button>`) };
      const pl = st.pl;
      const total = pl.tracks.reduce((a, t) => a + (t.duration || 0), 0);
      const extra = `<span class="spacer"></span><a class="btn btn-ghost" href="https://open.spotify.com/playlist/${encodeURIComponent(id)}" target="_blank" rel="noopener">${ic('share')}<span>Открыть в Spotify</span></a>`;
      return { html: `
        ${hero({ kind: 'Плейлист · Spotify', title: pl.title, cover: pl.art ? `<img class="cover" src="${esc(pl.art)}" alt="">` : `<div class="cover ph" style="--h:${hashHue(pl.title)}">${ic('list')}</div>`,
          sub: [pl.owner && `<b>${esc(pl.owner)}</b>`, pl.tracks.length && `${tracksWord(pl.tracks.length)}, ${fmtLong(total)}`].filter(Boolean).join(' · '), spec: 'sp-pl:' + id, count: 1, extra })}
        ${pl.tracks.length ? trackList(pl.tracks, { label: pl.title, key: 'sp-pl:' + id })
          : emptyBlock('list', 'Spotify не показывает треки этого плейлиста', 'Так Spotify ограничивает доступ к чужим плейлистам. Но его можно включить целиком кнопкой ▶ выше.')}`,
      color: { h: 141, s: 55, l: 38 } };
    },

    ia(id) {
      const st = id && Archive.cached(id);
      if (!st) setTimeout(() => Archive.load(id).then(() => { if (S.view?.name === 'ia' && S.view.param === id) render(); }), 0);
      if (!st || st.loading) return { html: `<div class="hero"><div class="hero-cover"><div class="sk-card"><i></i></div></div></div>${skeletonRows()}` };
      if (st.error) {
        return { html: emptyBlock('globe', 'Не удалось загрузить альбом', navigator.onLine ? 'Internet Archive сейчас не отвечает. Попробуйте ещё раз.' : 'Нет подключения к интернету.', `<button class="btn btn-primary" data-act="ia-retry" data-id="${esc(id)}">Повторить</button>`) };
      }
      const it = st.item;
      const total = it.tracks.reduce((a, t) => a + (t.duration || 0), 0);
      const extra = `<span class="spacer"></span>
        ${it.tracks.length ? `<button class="btn btn-ghost" data-act="ia-save" data-id="${esc(id)}">${ic('library')}<span>Сохранить в медиатеку</span></button>` : ''}
        <a class="icon-btn round" href="https://archive.org/details/${encodeURIComponent(id)}" target="_blank" rel="noopener" title="Открыть на archive.org" aria-label="Открыть на archive.org">${ic('share')}</a>`;
      const sub = [it.creator && `<b>${esc(it.creator)}</b>`, esc(it.year), it.tracks.length && `${tracksWord(it.tracks.length)}${total ? ', ' + fmtLong(total) : ''}`,
        it.license && `<a href="${esc(it.license)}" target="_blank" rel="noopener">лицензия</a>`].filter(Boolean).join(' · ');
      return { html: `
        ${hero({ kind: `Альбом · Internet Archive${it.label ? ' · ' + esc(it.label) : ''}`, title: it.title, cover: `<img class="cover" src="${esc(it.art)}" alt="">`, sub, spec: 'ia:' + id, count: it.tracks.length, extra })}
        ${it.tracks.length ? trackList(it.tracks, { label: it.title, key: 'ia:' + id, numbers: false })
          : emptyBlock('disc', 'В этом альбоме нет MP3', 'Попробуйте открыть его на archive.org.')}`,
      color: { h: hashHue(id), s: 50, l: 42 } };
    },

    library(tab) {
      const all = allTracks();
      if (!all.length && tab !== 'playlists') return { html: welcome() };
      tab = ['tracks', 'albums', 'artists', 'playlists'].includes(tab) ? tab : 'tracks';
      const albums = getAlbums();
      const artists = getArtists();
      const pls = [...S.playlists.values()].sort((a, b) => b.createdAt - a.createdAt);
      const tabs = [['tracks', 'Треки', all.length], ['albums', 'Альбомы', albums.length], ['artists', 'Исполнители', artists.length], ['playlists', 'Плейлисты', pls.length]];
      let body = '';
      if (tab === 'tracks') {
        const sorted = sortTracks(all, S.libSort);
        const total = all.reduce((s, t) => s + (t.duration || 0), 0);
        body = `
          <div class="toolbar">
            <button class="play-big" data-play="all" aria-label="Слушать всё" title="Слушать всё">${ic('play')}</button>
            <button class="btn btn-ghost" data-shuffle="all">${ic('shuffle')}<span>Перемешать</span></button>
            <span class="dim">${tracksWord(all.length)} · ${fmtLong(total)}</span>
            <span class="spacer"></span>
            <label>Сортировка
              <select class="select" id="libSort">
                ${[['added', 'Недавно добавленные'], ['title', 'По названию'], ['artist', 'По исполнителю'], ['plays', 'Часто слушаемые'], ['duration', 'По длительности']]
                  .map(([v, l]) => `<option value="${v}" ${S.libSort === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </label>
          </div>
          ${trackList(sorted, { label: 'Медиатека', key: 'all' })}`;
      } else if (tab === 'albums') {
        body = albums.length ? `<div class="grid">${albums.sort((a, b) => collator.compare(a.name, b.name)).map(albumCard).join('')}</div>`
          : emptyBlock('disc', 'Альбомов пока нет', 'Альбомы появятся, если в тегах ваших MP3 указано название альбома. Его можно задать вручную: «⋯» → «Изменить название».');
      } else if (tab === 'artists') {
        body = `<div class="grid">${artists.sort((a, b) => collator.compare(a.name, b.name)).map(artistCard).join('')}</div>`;
      } else {
        body = `<div class="grid">
          ${card({ href: '#/liked', cover: likedCover(), title: 'Любимые треки', sub: `Плейлист · ${tracksWord(likedTracks().length)}`, play: 'liked' })}
          ${pls.map(playlistCard).join('')}
          <a class="card new-card" href="#" data-act="new-playlist"><div class="card-cover"><div class="cover">${ic('plus')}</div></div><div class="card-title">Новый плейлист</div><div class="card-sub">Соберите свою подборку</div></a>
        </div>`;
      }
      return { html: `
        <div class="page-head"><h1>Медиатека</h1>
          <div class="page-actions">
            <button class="btn btn-ghost" data-act="add-folder">${ic('folder')}<span>Папка</span></button>
            <button class="btn btn-primary" data-act="add-music">${ic('upload')}<span>Добавить</span></button>
          </div>
        </div>
        <div class="tabs">${tabs.map(([k, l, n]) => `<a class="tab ${k === tab ? 'active' : ''}" href="#/library/${k}">${l}<span>${n}</span></a>`).join('')}</div>
        ${body}` };
    },

    liked() {
      const list = likedTracks();
      const total = list.reduce((s, t) => s + (t.duration || 0), 0);
      return { html: `
        ${hero({ kind: 'Плейлист', title: 'Любимые треки', cover: likedCover(), sub: list.length ? `<b>${tracksWord(list.length)}</b> · ${fmtLong(total)}` : 'Здесь соберутся треки, которым вы поставили ♥', spec: 'liked', count: list.length })}
        ${list.length ? trackList(list, { label: 'Любимые треки', key: 'liked' })
          : emptyBlock('heart', 'Пока пусто', 'Нажмите ♥ рядом с треком или в плеере — и он появится здесь.', '<a class="btn btn-primary" href="#/library/tracks">Перейти к трекам</a>')}`,
      color: { h: 280, s: 65, l: 50 } };
    },

    playlist(id) {
      const p = S.playlists.get(id);
      if (!p) return { html: emptyBlock('list', 'Плейлист не найден', 'Возможно, он был удалён.', '<a class="btn btn-primary" href="#/library/playlists">Все плейлисты</a>') };
      const list = playlistTracks(p);
      const total = list.reduce((s, t) => s + (t.duration || 0), 0);
      const first = list.find((t) => t.cover || t.art) || list[0];
      const extra = `
        <span class="spacer"></span>
        <button class="btn btn-ghost" data-act="pl-add" data-id="${p.id}">${ic('plus')}<span>Добавить треки</span></button>
        <button class="icon-btn round" data-act="pl-rename" data-id="${p.id}" title="Переименовать" aria-label="Переименовать">${ic('edit')}</button>
        <button class="icon-btn round" data-act="pl-delete" data-id="${p.id}" title="Удалить плейлист" aria-label="Удалить плейлист">${ic('trash')}</button>`;
      return { html: `
        ${hero({ kind: 'Плейлист', title: p.name, cover: playlistCover(p), sub: list.length ? `<b>${tracksWord(list.length)}</b> · ${fmtLong(total)}` : 'Пустой плейлист', spec: `playlist:${p.id}`, count: list.length, extra })}
        ${list.length ? trackList(list, { label: p.name, key: `playlist:${p.id}`, playlistId: p.id })
          : emptyBlock('list', 'В плейлисте пока нет треков', 'Нажмите «Добавить треки» или используйте меню «⋯» у любого трека → «Добавить в плейлист».', `<button class="btn btn-primary" data-act="pl-add" data-id="${p.id}">${ic('plus')}Добавить треки</button>`)}`,
      color: first ? colorOf(first) : { h: hashHue(p.name), s: 55, l: 45 } };
    },

    album(name) {
      const a = name && findAlbum(name);
      if (!a) return { html: emptyBlock('disc', 'Альбом не найден', 'Возможно, его треки были удалены.', '<a class="btn btn-primary" href="#/library/albums">Все альбомы</a>') };
      const total = a.tracks.reduce((s, t) => s + (t.duration || 0), 0);
      const artistLinks = [...a.artists.keys()].slice(0, 2).map((n) => `<a href="#/artist/${encodeURIComponent(n)}"><b>${esc(n)}</b></a>`).join(', ');
      return { html: `
        ${hero({ kind: 'Альбом', title: a.name, cover: coverHTML(a.coverTrack), sub: `${a.artists.size > 2 ? '<b>Разные исполнители</b>' : artistLinks}${a.year ? ` · ${esc(a.year)}` : ''} · ${tracksWord(a.tracks.length)}, ${fmtLong(total)}`, spec: `album:${a.key}`, count: a.tracks.length })}
        ${trackList(a.tracks, { label: a.name, key: `album:${a.key}`, numbers: false })}`,
      color: colorOf(a.coverTrack) };
    },

    artist(name) {
      const a = name && findArtist(name);
      if (!a) return { html: emptyBlock('user', 'Исполнитель не найден', 'Возможно, его треки были удалены.', '<a class="btn btn-primary" href="#/library/artists">Все исполнители</a>') };
      const popular = sortTracks(a.tracks, 'plays');
      const albums = getAlbums().filter((al) => al.tracks.some((t) => norm(artistOf(t)) === a.key || norm(t.albumArtist) === a.key));
      return { html: `
        ${hero({ kind: 'Исполнитель', title: a.name, cover: coverHTML(a.coverTrack), round: true, sub: `${tracksWord(a.tracks.length)}${albums.length ? ` · ${albums.length} ${plural(albums.length, 'альбом', 'альбома', 'альбомов')}` : ''}`, spec: `artist:${a.key}`, count: a.tracks.length })}
        <section><div class="sec-head"><h2>Треки</h2></div>${trackList(popular, { label: a.name, key: `artist:${a.key}` })}</section>
        ${albums.length ? `<section class="section"><div class="sec-head"><h2>Альбомы</h2></div><div class="shelf">${albums.map(albumCard).join('')}</div></section>` : ''}`,
      color: colorOf(a.coverTrack) };
    },
  };

  /* ---------- Отрисовка ---------- */
  function render() {
    const v = parseHash();
    if (v.name === 'wave') { // ярлык «Моя волна» у установленного приложения
      history.replaceState(null, '', '#/home');
      setTimeout(startWave, 0);
      render();
      return;
    }
    const changed = !S.view || v.name !== S.view.name || v.param !== S.view.param;
    S.view = v;
    lists = new Map();
    document.body.dataset.view = v.name;
    const fn = views[v.name] || views.home;
    let out;
    try { out = fn(v.param); } catch (e) {
      console.error(e);
      out = { html: emptyBlock('close', 'Что-то пошло не так', 'Попробуйте обновить страницу.') };
    }
    const view = $('#view');
    view.innerHTML = out.html;
    if (changed) {
      view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
      $('#main').scrollTop = 0;
    }
    $('#main').style.setProperty('--view-c', out.color ? cssColor(out.color) : 'var(--accent)');
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === v.name || (v.name === 'liked' && a.dataset.nav === 'liked')));
    renderSidebar();
    updatePlayState();
  }

  function renderSidebar() {
    const v = S.view || {};
    const pls = [...S.playlists.values()].sort((a, b) => b.createdAt - a.createdAt);
    const likedN = likedTracks().length;
    $('#sidebarPlaylists').innerHTML = `
      <a class="sp-item ${v.name === 'liked' ? 'active' : ''}" href="#/liked" data-key="liked">${likedCover()}<div class="tt"><div class="t1">Любимые треки</div><div class="t2">${tracksWord(likedN)}</div></div></a>
      ${pls.map((p) => `<a class="sp-item ${v.name === 'playlist' && v.param === p.id ? 'active' : ''}" href="#/playlist/${p.id}" data-key="playlist:${p.id}">${playlistCover(p)}<div class="tt"><div class="t1">${esc(p.name)}</div><div class="t2">Плейлист · ${tracksWord(playlistTracks(p).length)}</div></div></a>`).join('')}
      ${pls.length ? '' : `<button class="sp-create" data-act="new-playlist">${ic('plus')}Создать плейлист</button>`}`;
    const total = allTracks().reduce((s, t) => s + (t.duration || 0), 0);
    $('#libStats').textContent = S.tracks.size ? `В медиатеке ${tracksWord(S.tracks.size)} · ${fmtLong(total)}` : 'Медиатека пуста';
    $$('.sp-item').forEach((el) => el.classList.toggle('playing', !!S.current && el.dataset.key === S.ctxKey));
  }

  function renderAll() {
    render();
    updateNowPlaying();
    renderQueue();
  }

  /* ---------- Тема ---------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    LS.set('theme', theme);
    $$('[data-act="theme"]').forEach((b) => setIcon(b, theme === 'dark' ? 'sun' : 'moon'));
    $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#0b0b10' : '#f8f8fb');
    try { Native?.theme(theme); } catch { /* мост недоступен */ }
  }

  const openFilePicker = () => $('#fileInput').click();

  /* ---------- События ---------- */
  function bindUI() {
    // Клики: всё через делегирование
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#menu')) {
        const b = t.closest('.menu-item');
        if (!b) return;
        const it = menuItems[+b.dataset.i];
        const r = it?.action?.();
        if (r !== 'keep') closeMenu();
        return;
      }
      if (t.closest('.modal-back')) return;

      const playBtn = t.closest('[data-play]');
      if (playBtn) { e.preventDefault(); e.stopPropagation(); ensureAudioGraph(); handlePlaySpec(playBtn.dataset.play); return; }
      const shufBtn = t.closest('[data-shuffle]');
      if (shufBtn) { e.preventDefault(); ensureAudioGraph(); handleShuffleSpec(shufBtn.dataset.shuffle); return; }

      const ctl = t.closest('[data-ctl]');
      if (ctl) {
        switch (ctl.dataset.ctl) {
          case 'play': togglePlay(); break;
          case 'next': ensureAudioGraph(); next(); break;
          case 'prev': ensureAudioGraph(); prev(); break;
          case 'shuffle': toggleShuffle(); break;
          case 'repeat': cycleRepeat(); break;
          case 'like': toggleLike(); break;
          case 'mute': toggleMute(); break;
          case 'queue': setQueueOpen(!S.queueOpen); break;
          case 'eq': openEq(); break;
          case 'np': setNp(!S.npOpen); break;
        }
        return;
      }

      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        const row = act.closest('.row');
        switch (a) {
          case 'like': e.preventDefault(); toggleLike(row?.dataset.id); return;
          case 'more': {
            e.preventDefault();
            const reg = lists.get(row.closest('[data-list]')?.dataset.list);
            const r = act.getBoundingClientRect();
            trackMenu(row.dataset.id, r.left - 200, r.bottom + 4, { playlistId: reg?.playlistId });
            return;
          }
          case 'row-play': break; // обработается как клик по строке
          case 'add-music': e.preventDefault(); openFilePicker(); return;
          case 'add-folder': e.preventDefault(); $('#folderInput').click(); return;
          case 'new-playlist': e.preventDefault(); newPlaylistFlow(); return;
          case 'pl-add': openTrackPicker(act.dataset.id); return;
          case 'pl-rename': renamePlaylist(act.dataset.id); return;
          case 'pl-delete': deletePlaylist(act.dataset.id); return;
          case 'queue-remove': e.stopPropagation(); removeQueueAt(+act.dataset.qi); return;
          case 'queue-clear': clearUpcoming(); return;
          case 'theme': applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); return;
          case 'help': openHelp(); return;
          case 'install': installApp(); return;
          case 'back': history.back(); return;
          case 'forward': history.forward(); return;
          case 'np-artist': {
            const tr = getTrack(S.current);
            if (!tr) return;
            setNp(false);
            if (isRemote(tr) && !S.tracks.has(tr.id)) { if (SOURCES[tr.source]) ON.source = tr.source; go('online', artistOf(tr)); } else go('artist', artistOf(tr));
            return;
          }
        }
      }

      const sourceBtn = t.closest('[data-source]');
      if (sourceBtn) {
        ON.source = sourceBtn.dataset.source;
        LS.set('onlineSource', ON.source);
        render();
        return;
      }
      const copyBtn = t.closest('[data-copy]');
      if (copyBtn) {
        navigator.clipboard?.writeText(copyBtn.dataset.copy).then(() => toast('Скопировано', 'ok', 1500), () => toast('Не удалось скопировать — выделите текст вручную', 'warn'));
        return;
      }
      const extAct = t.closest('[data-act^="spotify-"], [data-act^="yt-"]');
      if (extAct) {
        const a = extAct.dataset.act;
        if (a === 'spotify-save') Spotify.saveClient();
        if (a === 'spotify-login') Spotify.login();
        if (a === 'spotify-logout') { Spotify.logout(); render(); }
        if (a === 'spotify-client-reset') { Spotify.resetClient(); render(); }
        if (a === 'spotify-devices') Spotify.retry();
        if (a === 'spotify-pl-retry') { Spotify.forgetPlaylist(extAct.dataset.id); render(); }
        if (a === 'yt-save') YouTube.saveKey();
        if (a === 'yt-reset') { YouTube.resetKey(); render(); }
        if (a === 'yt-close') deactivateExt();
        if (a === 'yt-big') YouTube.toggleBig();
        return;
      }
      const ia = t.closest('[data-act^="ia-"], [data-act^="jamendo-"]');
      if (ia) {
        const a = ia.dataset.act;
        if (a === 'jamendo-save') saveJamendoKey();
        if (a === 'jamendo-reset') { LS.set('jamendoId', ''); render(); }
        if (a === 'ia-retry') { Archive.forget(ia.dataset.id); render(); }
        if (a === 'ia-save') { const st = Archive.cached(ia.dataset.id); if (st?.item) saveRemote(st.item.tracks.map((x) => x.id)); }
        return;
      }
      const genreBtn = t.closest('[data-genre]');
      if (genreBtn) {
        ON.genre[ON.source] = genreBtn.dataset.genre;
        LS.set('onlineGenres', ON.genre);
        $$('[data-genre]').forEach((b) => b.classList.toggle('active', b === genreBtn));
        if (!onlineFresh(onlineKey(''))) loadOnline('');
        fillOnline();
        return;
      }
      if (t.closest('[data-act="online-retry"]')) {
        ON.results.delete(onlineKey(onlineQuery()));
        loadOnline(onlineQuery());
        fillOnline();
        return;
      }

      const sortLink = t.closest('[data-sort]');
      if (sortLink) { S.libSort = sortLink.dataset.sort; LS.set('libSort', S.libSort); }

      const qr = t.closest('.qrow');
      if (qr) { ensureAudioGraph(); const qi = +qr.dataset.qi; if (qi === S.qi) togglePlay(); else loadIndex(qi); return; }

      const row = t.closest('.row');
      if (row && !t.closest('a')) {
        const reg = lists.get(row.closest('[data-list]')?.dataset.list);
        if (!reg) return;
        ensureAudioGraph();
        const i = +row.dataset.i;
        if (row.dataset.id === S.current) togglePlay();
        else playIds(reg.ids, i, reg.label, { key: reg.key });
      }
    });

    // Битая обложка (сервер недоступен) — показываем заглушку
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('cover')) return;
      const ph = document.createElement('div');
      ph.className = img.className + ' ph';
      ph.style.setProperty('--h', hashHue(img.getAttribute('src')));
      ph.innerHTML = ic('note');
      img.replaceWith(ph);
    }, true);

    // Правый клик по треку
    document.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.row');
      if (!row) return;
      e.preventDefault();
      const reg = lists.get(row.closest('[data-list]')?.dataset.list);
      trackMenu(row.dataset.id, e.clientX, e.clientY, { playlistId: reg?.playlistId });
    });

    document.addEventListener('mousedown', (e) => { if (menuOpen() && !e.target.closest('#menu')) closeMenu(); });
    $('#main').addEventListener('scroll', () => {
      closeMenu();
      $('#topbar').classList.toggle('scrolled', $('#main').scrollTop > 10);
    }, { passive: true });
    window.addEventListener('resize', closeMenu);

    // Поиск онлайн
    let onlineTimer;
    document.addEventListener('input', (e) => {
      if (e.target.id !== 'onlineQ') return;
      clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => setOnlineQuery(e.target.value.trim()), 450);
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.id === 'jamendoKey' && e.key === 'Enter') saveJamendoKey();
      if (e.target.id === 'spotifyKey' && e.key === 'Enter') Spotify.saveClient();
      if (e.target.id === 'youtubeKey' && e.key === 'Enter') YouTube.saveKey();
      if (e.target.id === 'onlineQ' && e.key === 'Enter') { clearTimeout(onlineTimer); setOnlineQuery(e.target.value.trim()); e.target.blur(); }
    });

    // Сортировка медиатеки
    document.addEventListener('change', (e) => {
      if (e.target.id === 'libSort') { S.libSort = e.target.value; LS.set('libSort', S.libSort); render(); }
    });

    // Поиск
    const search = $('#topSearch');
    search.addEventListener('input', () => {
      S.q = search.value;
      if (S.view?.name !== 'search') go('search');
      else render();
    });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; S.q = ''; render(); search.blur(); } });

    // Файлы
    $('#fileInput').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });
    $('#folderInput').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });

    // Перетаскивание
    let dragDepth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const overlay = $('#dropOverlay');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; overlay.classList.add('show'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.classList.remove('show'); });
    window.addEventListener('drop', async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      overlay.classList.remove('show');
      importFiles(await filesFromDrop(e.dataTransfer));
    });

    // Перемотка и громкость
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.classList.contains('seek')) {
        seeking = true;
        const d = ext ? ext.duration() : (audio.duration || getTrack(S.current)?.duration || 0);
        el.style.setProperty('--p', el.value / 10 + '%');
        $$('.t-cur').forEach((x) => { x.textContent = fmt((el.value / 1000) * d); });
      } else if (el.classList.contains('vol')) {
        setVolume(el.value / 100);
      }
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.classList.contains('seek')) {
        if (ext) ext.seek((el.value / 1000) * ext.duration());
        else if (S.current && isFinite(audio.duration)) audio.currentTime = (el.value / 1000) * audio.duration;
        seeking = false;
        lastProgress = -1;
      }
    });

    // Аудио: слушаем оба элемента, реагируем только на активный
    function onAudio(type, fn) {
      for (const el of [audioMain, audioRaw]) el.addEventListener(type, (e) => { if (e.target === audio) fn(e); });
    }
    onAudio('play', updatePlayState);
    onAudio('pause', () => { updatePlayState(); saveSession(); });
    onAudio('ended', () => next(true));
    onAudio('error', () => {
      if (!S.current || !audio.getAttribute('src')) return;
      const t = getTrack(S.current);
      toast(isRemote(t) && !navigator.onLine ? 'Нет интернета — онлайн-трек не загрузится' : `Не удалось воспроизвести «${t?.title || 'трек'}»`, 'warn', 3500);
      if (S.qi < S.queue.length - 1) setTimeout(() => next(true), 1200);
    });
    onAudio('loadedmetadata', () => {
      const t = getTrack(S.current);
      if (t && isFinite(audio.duration) && Math.abs((t.duration || 0) - audio.duration) > 1) {
        t.duration = audio.duration;
        if (S.tracks.has(t.id)) DB.put('tracks', t).catch(() => {});
      }
    });
    onAudio('timeupdate', () => {
      const t = getTrack(S.current);
      if (t && !S.counted && !audio.paused && audio.currentTime > Math.min(30, (audio.duration || 60) * 0.5)) {
        S.counted = true;
        t.plays = (t.plays || 0) + 1;
        t.lastPlayed = Date.now();
        if (S.tracks.has(t.id)) DB.put('tracks', t).catch(() => {});
      }
      if (Date.now() - lastSessionSave > 5000) saveSession();
      if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(audio.duration)) {
        try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch { /* ок */ }
      }
    });
    window.addEventListener('pagehide', saveSession);
    onAudio('seeked', () => notifyNative(true));

    // Системные кнопки (наушники, экран блокировки)
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* не поддерживается */ } };
      set('play', doPlay);
      set('pause', doPause);
      set('previoustrack', prev);
      set('nexttrack', () => next());
      set('seekbackward', () => seekBy(-10));
      set('seekforward', () => seekBy(10));
      set('seekto', (d) => { if (isFinite(d.seekTime)) doSeek(d.seekTime); });
    }

    // Web Audio можно запустить только после действия пользователя
    const unlock = () => { if (S.current || S.tracks.size) ensureAudioGraph(); };
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });

    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
      const el = e.target;
      const typing = (el.tagName === 'INPUT' && el.type !== 'range') || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if (e.key === 'Escape') {
        if (menuOpen()) closeMenu();
        else if (modalStack.length) modalStack[modalStack.length - 1].close();
        else if (S.queueOpen) setQueueOpen(false);
        else if (S.npOpen) setNp(false);
        return;
      }
      if (typing || modalStack.length || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el.type === 'range' && e.code.startsWith('Arrow')) return;
      const vol = audio.muted ? 0 : audio.volume;
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); if (e.shiftKey) next(); else seekBy(5); break;
        case 'ArrowLeft': e.preventDefault(); if (e.shiftKey) prev(); else seekBy(-5); break;
        case 'ArrowUp': e.preventDefault(); setVolume(vol + 0.05); break;
        case 'ArrowDown': e.preventDefault(); setVolume(vol - 0.05); break;
        case 'KeyM': toggleMute(); break;
        case 'KeyL': toggleLike(); break;
        case 'KeyS': toggleShuffle(); break;
        case 'KeyR': cycleRepeat(); break;
        case 'KeyF': setNp(!S.npOpen); break;
        case 'KeyQ': setQueueOpen(!S.queueOpen); break;
        case 'KeyE': openEq(); break;
        case 'Slash':
          e.preventDefault();
          if (e.shiftKey) { openHelp(); break; }
          if (S.npOpen) setNp(false);
          if (S.view?.name !== 'search') go('search');
          setTimeout(() => search.focus(), 0);
          break;
      }
    });

    window.addEventListener('hashchange', () => {
      closeMenu();
      if (S.npOpen) setNp(false);
      if (MOBILE() && S.queueOpen) setQueueOpen(false);
      render();
      if (S.view.name === 'search' && !MOBILE()) search.focus();
      if (S.view.name === 'search' && MOBILE() && !S.q) setTimeout(() => search.focus(), 50);
    });

    // Свайп вниз закрывает полноэкранный плеер на телефоне
    let touchY = null;
    $('#np').addEventListener('touchstart', (e) => { touchY = e.target.closest('.range') ? null : e.touches[0].clientY; }, { passive: true });
    $('#np').addEventListener('touchend', (e) => {
      if (touchY != null && e.changedTouches[0].clientY - touchY > 90) setNp(false);
      touchY = null;
    }, { passive: true });
  }

  /* ---------- Запуск ---------- */
  async function init() {
    applyTheme(LS.get('theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
    audioMain.crossOrigin = 'anonymous';
    audio.volume = clamp(LS.get('vol', 0.8), 0, 1);
    audio.muted = LS.get('muted', false);
    syncAudioSettings();
    bindUI();
    try {
      const [tracks, pls] = await Promise.all([DB.all('tracks'), DB.all('playlists')]);
      tracks.forEach((t) => S.tracks.set(t.id, t));
      pls.forEach((p) => S.playlists.set(p.id, p));
    } catch (e) {
      console.error(e);
      toast('Браузер не дал доступ к хранилищу — медиатека не сохранится после закрытия', 'warn', 7000);
    }
    restoreSession();
    if (/[?&](code|error)=/.test(location.search)) { // вернулись со страницы входа Spotify
      const href = location.href;
      history.replaceState(null, '', location.pathname + '#/online');
      if (await Spotify.handleCallback(href)) { ON.source = 'spotify'; LS.set('onlineSource', 'spotify'); }
    }
    window.mp3upSpotifyCallback = async (href) => {
      if (await Spotify.handleCallback(href)) { ON.source = 'spotify'; LS.set('onlineSource', 'spotify'); go('online'); }
    };
    render();
    updateNowPlaying();
    updateControls();
    updateVolumeUI();
    requestAnimationFrame(progressTick);
    $('#app').classList.add('ready');
    try { Native?.ready(); } catch { /* мост недоступен */ }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !Native) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Установка как приложение
    updateInstallUI();
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; updateInstallUI(); });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      updateInstallUI();
      toast('MP3UP установлен! Его значок — на рабочем столе и в списке приложений', 'ok', 6000);
    });
    matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallUI);

    // «Открыть с помощью MP3UP» для аудиофайлов (установленное приложение на компьютере)
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(async (params) => {
        if (!params.files || !params.files.length) return;
        const files = (await Promise.all(params.files.map((h) => h.getFile().catch(() => null)))).filter(Boolean);
        const ids = await importFiles(files);
        if (ids.length) playIds(ids, 0, 'Открытые файлы');
      });
    }
  }

  init();
})();
