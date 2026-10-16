/* MP3UP — чтение тегов ID3 (v1, v2.2, v2.3, v2.4): название, исполнитель, альбом, обложка */
'use strict';

const Tags = (() => {
  const TEXT_FRAMES = {
    TIT2: 'title', TT2: 'title',
    TPE1: 'artist', TP1: 'artist',
    TPE2: 'albumArtist', TP2: 'albumArtist',
    TALB: 'album', TAL: 'album',
    TYER: 'year', TYE: 'year', TDRC: 'year',
    TCON: 'genre', TCO: 'genre',
    TRCK: 'track', TRK: 'track',
  };

  const ID3V1_GENRES = ['Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise', 'Alternative Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock'];

  const decoders = {};
  const decoder = (label) => (decoders[label] ||= new TextDecoder(label));

  // Однобайтовая кодировка: в русских MP3 часто лежит windows-1251 под видом latin-1
  function decodeSingleByte(bytes) {
    const hasHigh = bytes.some((b) => b > 0x7f);
    if (!hasHigh) return decoder('iso-8859-1').decode(bytes);
    try {
      const utf = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return utf;
    } catch { /* не UTF-8 */ }
    const cyr = decoder('windows-1251').decode(bytes);
    // если в результате много кириллицы — это почти наверняка 1251
    const cyrCount = (cyr.match(/[А-яЁё]/g) || []).length;
    return cyrCount >= bytes.filter((b) => b > 0x7f).length * 0.6 ? cyr : decoder('iso-8859-1').decode(bytes);
  }

  function decodeText(bytes, enc) {
    let text;
    if (enc === 1 || enc === 2) {
      let label = enc === 2 ? 'utf-16be' : 'utf-16le';
      if (bytes[0] === 0xfe && bytes[1] === 0xff) { label = 'utf-16be'; bytes = bytes.subarray(2); }
      else if (bytes[0] === 0xff && bytes[1] === 0xfe) { label = 'utf-16le'; bytes = bytes.subarray(2); }
      text = decoder(label).decode(bytes);
    } else if (enc === 3) {
      text = decoder('utf-8').decode(bytes);
    } else {
      text = decodeSingleByte(bytes);
    }
    // в v2.4 несколько значений разделяются нулём — берём первое
    return text.split('\0').find((s) => s.trim())?.trim() || '';
  }

  function findTerminator(bytes, start, enc) {
    if (enc === 1 || enc === 2) {
      for (let i = start; i + 1 < bytes.length; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
      return bytes.length;
    }
    for (let i = start; i < bytes.length; i++) if (bytes[i] === 0) return i;
    return bytes.length;
  }

  const synchsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
  const uint32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  function cleanGenre(g) {
    if (!g) return '';
    const m = g.match(/^\((\d+)\)(.*)$/);
    if (m) return m[2].trim() || ID3V1_GENRES[+m[1]] || '';
    if (/^\d+$/.test(g)) return ID3V1_GENRES[+g] || '';
    return g;
  }

  function readFrame(id, data, tags) {
    const key = TEXT_FRAMES[id];
    if (key) {
      if (!tags[key] && data.length > 1) tags[key] = decodeText(data.subarray(1), data[0]);
      return;
    }
    if (id !== 'APIC' && id !== 'PIC') return;
    const enc = data[0];
    let p = 1;
    let mime;
    if (id === 'PIC') {
      const fmt = String.fromCharCode(data[1], data[2], data[3]).toLowerCase();
      mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      p = 4;
    } else {
      const end = findTerminator(data, 1, 0);
      mime = decoder('iso-8859-1').decode(data.subarray(1, end)).toLowerCase() || 'image/jpeg';
      if (!mime.includes('/')) mime = 'image/' + (mime === 'jpg' ? 'jpeg' : mime);
      p = end + 1;
    }
    const pictureType = data[p++];
    const descEnd = findTerminator(data, p, enc);
    p = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
    if (p >= data.length) return;
    // предпочитаем лицевую обложку (тип 3), иначе первую попавшуюся
    if (!tags.picture || (pictureType === 3 && !tags.pictureIsFront)) {
      tags.picture = new Blob([data.slice(p)], { type: mime });
      tags.pictureIsFront = pictureType === 3;
    }
  }

  async function readID3v2(file, tags) {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return false;
    const version = head[3];
    const flags = head[5];
    const size = synchsafe(head, 6);
    if (version < 2 || version > 4 || size <= 0) return false;

    let b = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    // глобальная «рассинхронизация» (старые теги v2.2/v2.3)
    if (flags & 0x80 && version < 4) {
      const out = [];
      for (let i = 0; i < b.length; i++) {
        out.push(b[i]);
        if (b[i] === 0xff && b[i + 1] === 0x00) i++;
      }
      b = new Uint8Array(out);
    }

    let p = 0;
    if (flags & 0x40 && version > 2) p = version === 4 ? synchsafe(b, 0) : uint32(b, 0) + 4;

    const idLen = version === 2 ? 3 : 4;
    const headerLen = version === 2 ? 6 : 10;
    while (p + headerLen <= b.length) {
      const id = String.fromCharCode(...b.subarray(p, p + idLen));
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      let frameSize;
      if (version === 2) frameSize = (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5];
      else if (version === 4) frameSize = synchsafe(b, p + 4);
      else frameSize = uint32(b, p + 4);
      const start = p + headerLen;
      const end = start + frameSize;
      if (frameSize <= 0 || end > b.length) break;
      let data = b.subarray(start, end);
      if (version === 4) {
        const fflags = b[p + 9];
        if (fflags & 0x01) data = data.subarray(4); // индикатор длины данных
      }
      try { readFrame(id, data, tags); } catch { /* битый кадр — пропускаем */ }
      p = end;
    }
    return true;
  }

  async function readID3v1(file, tags) {
    if (file.size < 128) return;
    const b = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
    if (b[0] !== 0x54 || b[1] !== 0x41 || b[2] !== 0x47) return; // "TAG"
    const str = (from, len) => {
      const part = b.subarray(from, from + len);
      const end = part.indexOf(0);
      return decodeSingleByte(end >= 0 ? part.subarray(0, end) : part).trim();
    };
    tags.title ||= str(3, 30);
    tags.artist ||= str(33, 30);
    tags.album ||= str(63, 30);
    tags.year ||= str(93, 4);
    if (b[125] === 0 && b[126]) tags.track ||= String(b[126]);
    if (!tags.genre && b[127] < ID3V1_GENRES.length) tags.genre = ID3V1_GENRES[b[127]];
  }

  async function parse(file) {
    const tags = {};
    try { await readID3v2(file, tags); } catch (e) { console.warn('ID3v2', file.name, e); }
    if (!tags.title || !tags.artist) {
      try { await readID3v1(file, tags); } catch (e) { console.warn('ID3v1', file.name, e); }
    }
    tags.genre = cleanGenre(tags.genre);
    if (tags.year) tags.year = String(tags.year).slice(0, 4);
    delete tags.pictureIsFront;
    return tags;
  }

  return { parse };
})();
