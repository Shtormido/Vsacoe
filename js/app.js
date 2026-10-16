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

  /* ---------- Состояние ---------- */
  const S = {
    tracks: new Map(),
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

  const audio = $('#audio');
  const coverCache = new Map();

  /* ---------- Данные медиатеки ---------- */
  const artistOf = (t) => t.artist || UNKNOWN_ARTIST;
  const allTracks = () => [...S.tracks.values()];
  const likedTracks = () => allTracks().filter((t) => t.liked).sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0));

  function coverUrl(t) {
    if (!t || !t.cover) return null;
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
    const u = coverUrl(t);
    if (u) return `<img class="cover ${cls}" src="${u}" alt="" loading="lazy" draggable="false">`;
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
      a.coverTrack = a.tracks.find((t) => t.cover) || a.tracks[0];
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
      a.coverTrack = a.tracks.find((t) => t.cover) || a.tracks[0];
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
      if (!t.cover || seen.has(k)) continue;
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

  function trackMenu(id, x, y, ctx = {}) {
    const t = S.tracks.get(id);
    if (!t) return;
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
    items.push({ icon: 'edit', label: 'Изменить название…', action: () => editTrack(id) });
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
    const t = S.tracks.get(id || S.current);
    if (!t) return;
    t.liked = !t.liked;
    t.likedAt = t.liked ? Date.now() : 0;
    await DB.put('tracks', t);
    toast(t.liked ? 'Добавлено в «Любимые треки»' : 'Убрано из «Любимых треков»', t.liked ? 'ok' : 'info', 1800);
    if (S.view?.name === 'liked' || S.view?.name === 'home') render();
    else updateLikeUI();
    renderSidebar();
  }

  async function deleteTracks(ids) {
    const t = S.tracks.get(ids[0]);
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

  function editTrack(id) {
    const t = S.tracks.get(id);
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
          <button class="pk-add ${inSet.has(t.id) ? 'on' : ''}" data-pk="${t.id}" aria-label="${inSet.has(t.id) ? 'Убрать' : 'Добавить'}">${ic(inSet.has(t.id) ? 'check' : 'plus')}</button>
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
      const src = actx.createMediaElementSource(audio);
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
    S.qi = i;
    const id = S.queue[i];
    const t = S.tracks.get(id);
    const token = ++loadToken;
    if (!t) { removeQueueAt(i); return; }
    S.current = id;
    S.counted = false;
    updateNowPlaying();
    renderQueue();
    let rec;
    try { rec = await DB.get('files', id); } catch (e) { console.error(e); }
    if (token !== loadToken) return;
    if (!rec || !rec.blob) { toast('Файл трека не найден', 'warn'); return; }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(rec.blob);
    audio.src = objectUrl;
    if (startAt > 0) audio.addEventListener('loadedmetadata', () => { audio.currentTime = Math.min(startAt, (audio.duration || startAt) - 1); }, { once: true });
    saveSession();
    if (autoplay) {
      ensureAudioGraph();
      try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') console.warn(e); }
    }
    updatePlayState();
  }

  function playIds(ids, start = 0, label = '', { key = '', wave = false, randomStart = false } = {}) {
    ids = ids.filter((id) => S.tracks.has(id));
    if (!ids.length) return;
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
    if (!S.queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    let i = S.qi - 1;
    if (i < 0) i = S.repeat === 'all' ? S.queue.length - 1 : 0;
    loadIndex(i);
  }

  function seekBy(sec) {
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
    ids = ids.filter((id) => S.tracks.has(id));
    if (!ids.length) return;
    if (!S.queue.length) { playIds(ids, 0, 'Очередь'); return; }
    S.queue.push(...ids);
    S.baseQueue.push(...ids);
    toast(ids.length > 1 ? `В очереди: +${tracksWord(ids.length)}` : 'Добавлено в очередь', 'ok', 1800);
    saveSession(); renderQueue();
  }
  function queueNext(ids) {
    ids = ids.filter((id) => S.tracks.has(id));
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
    const r = resolveSpec(spec);
    if (!r || !r.ids.length) { toast('Здесь пока нет треков', 'info'); return; }
    playIds(r.ids, 0, r.label, { key: spec });
  }
  function handleShuffleSpec(spec) {
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
    });
  }
  function restoreSession() {
    const s = LS.get('session', null);
    if (!s || !Array.isArray(s.queue)) return;
    const queue = s.queue.filter((id) => S.tracks.has(id));
    if (!queue.length) return;
    const curId = s.queue[s.qi];
    S.queue = queue;
    S.baseQueue = (s.baseQueue || queue).filter((id) => S.tracks.has(id));
    S.qi = Math.max(0, queue.indexOf(curId));
    S.ctxKey = s.key || '';
    S.ctxLabel = s.label || '';
    S.wave = !!s.wave;
    loadIndex(S.qi, { autoplay: false, startAt: queue[S.qi] === curId ? s.time : 0 });
  }

  /* ---------- Обновление интерфейса плеера ---------- */
  function setIcon(btn, name) { btn.querySelector('use')?.setAttribute('href', '#i-' + name); }

  function updatePlayState() {
    const playing = !audio.paused && !!S.current;
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
    if (S.current) $$(`.row[data-id="${S.current}"]`).forEach((r) => r.classList.add('playing'));
    $$('.sp-item').forEach((el) => el.classList.toggle('playing', !!S.current && el.dataset.key === S.ctxKey));
    const t = S.tracks.get(S.current);
    document.title = t ? `${playing ? '▶ ' : ''}${t.title} — ${artistOf(t)} · MP3UP` : 'MP3UP — твоя музыка';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = S.current ? (playing ? 'playing' : 'paused') : 'none';
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
    const t = S.tracks.get(S.current);
    $$('[data-ctl="like"]').forEach((b) => {
      const on = !!t?.liked;
      b.classList.toggle('on', on);
      setIcon(b, on ? 'heart-fill' : 'heart');
      b.setAttribute('aria-label', on ? 'Убрать из любимых' : 'Нравится');
    });
    $$('[data-like]').forEach((b) => {
      const tr = S.tracks.get(b.dataset.like);
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
    updateVolumeUI();
  }
  function toggleMute() {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      if (audio.volume === 0) audio.volume = 0.5;
    } else audio.muted = true;
    LS.set('muted', audio.muted);
    LS.set('vol', audio.volume);
    updateVolumeUI();
  }

  function updateNowPlaying() {
    const t = S.tracks.get(S.current);
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
    updateLikeUI();
    updatePlayState();
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title, artist: artistOf(t), album: t.album || '',
          artwork: u ? [{ src: u, sizes: '512x512', type: t.cover.type || 'image/jpeg' }] : [],
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
    const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (S.tracks.get(S.current)?.duration || 0);
    const c = audio.currentTime || 0;
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
    const cur = S.tracks.get(S.queue[S.qi]);
    if (!S.queue.length || !cur) {
      body.innerHTML = `<div class="q-empty">${ic('queue')}<p>Очередь пуста</p><span>Включите любой трек, альбом или «Мою волну» — здесь появится то, что будет играть дальше.</span></div>`;
      return;
    }
    const upcoming = [];
    for (let k = S.qi + 1; k < S.queue.length && upcoming.length < 150; k++) {
      const t = S.tracks.get(S.queue[k]);
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
      <p class="eq-note">${actx ? 'Двигайте ползунки — изменения слышны сразу' : 'Эквалайзер недоступен в этом браузере'}</p>`, { cls: 'wide' });
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
    $$('[data-act="install"]').forEach((b) => { b.hidden = isStandalone(); });
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
      <div class="row ${t.id === S.current ? 'playing' : ''}" data-id="${t.id}" data-i="${i}">
        <span class="num"><span class="n">${numbers ? i + 1 : (t.trackNo || i + 1)}</span><button class="row-play" data-act="row-play" aria-label="Слушать">${ic('play')}</button><span class="bars"><i></i><i></i><i></i></span></span>
        <span class="ti">${coverHTML(t, 'sm')}<span class="tt"><span class="t1">${esc(t.title)}</span><a class="t2" href="#/artist/${encodeURIComponent(artistOf(t))}">${esc(artistOf(t))}</a></span></span>
        <span class="al">${t.album ? `<a href="#/album/${encodeURIComponent(t.album)}">${esc(t.album)}</a>` : '<span class="dim">—</span>'}</span>
        <button class="icon-btn like ${t.liked ? 'on' : ''}" data-act="like" data-like="${t.id}" aria-label="Нравится" title="Нравится">${ic(t.liked ? 'heart-fill' : 'heart')}</button>
        <span class="dur">${fmt(t.duration)}</span>
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
        </div>
        <div class="dropzone" data-act="add-music">${ic('note')}<span>или перетащите музыку сюда</span></div>
        <p class="privacy">Файлы никуда не загружаются — всё остаётся в вашем браузере.</p>
      </div>`;
  }

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
      if (!all.length) return { html: emptyBlock('search', 'Пока нечего искать', 'Добавьте музыку — и здесь можно будет мгновенно найти любой трек, альбом или исполнителя.', `<button class="btn btn-primary" data-act="add-music">${ic('upload')}Добавить музыку</button>`) };
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
        return { html: emptyBlock('search', `Ничего не нашлось по запросу «${esc(q)}»`, 'Проверьте написание или попробуйте искать по исполнителю или альбому.') };
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
        ${albums.length ? `<section class="section"><div class="sec-head"><h2>Альбомы</h2></div><div class="shelf">${albums.slice(0, 20).map(albumCard).join('')}</div></section>` : ''}` };
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
      const first = list.find((t) => t.cover) || list[0];
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
          case 'np-artist': { const tr = S.tracks.get(S.current); if (tr) { setNp(false); go('artist', artistOf(tr)); } return; }
        }
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
        const d = audio.duration || S.tracks.get(S.current)?.duration || 0;
        el.style.setProperty('--p', el.value / 10 + '%');
        $$('.t-cur').forEach((x) => { x.textContent = fmt((el.value / 1000) * d); });
      } else if (el.classList.contains('vol')) {
        setVolume(el.value / 100);
      }
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.classList.contains('seek')) {
        if (S.current && isFinite(audio.duration)) audio.currentTime = (el.value / 1000) * audio.duration;
        seeking = false;
        lastProgress = -1;
      }
    });

    // Аудио
    audio.addEventListener('play', updatePlayState);
    audio.addEventListener('pause', () => { updatePlayState(); saveSession(); });
    audio.addEventListener('ended', () => next(true));
    audio.addEventListener('error', () => {
      if (!S.current || !audio.getAttribute('src')) return;
      const t = S.tracks.get(S.current);
      toast(`Не удалось воспроизвести «${t?.title || 'трек'}»`, 'warn', 3500);
      if (S.qi < S.queue.length - 1) setTimeout(() => next(true), 1200);
    });
    audio.addEventListener('loadedmetadata', () => {
      const t = S.tracks.get(S.current);
      if (t && isFinite(audio.duration) && Math.abs((t.duration || 0) - audio.duration) > 1) {
        t.duration = audio.duration;
        DB.put('tracks', t).catch(() => {});
      }
    });
    audio.addEventListener('timeupdate', () => {
      const t = S.tracks.get(S.current);
      if (t && !S.counted && !audio.paused && audio.currentTime > Math.min(30, (audio.duration || 60) * 0.5)) {
        S.counted = true;
        t.plays = (t.plays || 0) + 1;
        t.lastPlayed = Date.now();
        DB.put('tracks', t).catch(() => {});
      }
      if (Date.now() - lastSessionSave > 5000) saveSession();
      if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(audio.duration)) {
        try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch { /* ок */ }
      }
    });
    window.addEventListener('pagehide', saveSession);

    // Системные кнопки (наушники, экран блокировки)
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* не поддерживается */ } };
      set('play', () => { if (S.current) audio.play().catch(() => {}); });
      set('pause', () => audio.pause());
      set('previoustrack', prev);
      set('nexttrack', () => next());
      set('seekbackward', () => seekBy(-10));
      set('seekforward', () => seekBy(10));
      set('seekto', (d) => { if (isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
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
    audio.volume = clamp(LS.get('vol', 0.8), 0, 1);
    audio.muted = LS.get('muted', false);
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
    render();
    updateNowPlaying();
    updateControls();
    updateVolumeUI();
    requestAnimationFrame(progressTick);
    $('#app').classList.add('ready');

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
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
