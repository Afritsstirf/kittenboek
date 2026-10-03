// Kittenboek — alles wordt bewaard in de browser van dit toestel (IndexedDB).
(() => {
'use strict';

// ---------- vaste inhoud ----------
const CAT_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="var(--accent)" d="M12 8l12 12h16l12-12v26c0 13-9 22-20 22S12 47 12 34z"/><circle cx="24" cy="34" r="3.5" fill="var(--surface)"/><circle cx="40" cy="34" r="3.5" fill="var(--surface)"/><path d="M29 42l3 3 3-3" stroke="var(--surface)" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';
const TYPES = {
  diary:  { label: 'Dagboek',    cls: 't-diary' },
  weight: { label: 'Gewicht',    cls: 't-weight' },
  vet:    { label: 'Dierenarts', cls: 't-vet' },
  event:  { label: 'Agenda',     cls: 't-event' },
  photo:  { label: 'Foto',       cls: 't-photo' }
};
const MOODS = [['😸','Blij'],['🐾','Speels'],['😻','Knuffelig'],['🙀','Ondeugend'],['😴','Slaperig'],['🤒','Niet lekker']];
const MILESTONES = [
  ['night','Eerste nacht thuis'],['litter','Kattenbak gebruikt'],['purr','Eerste keer gespind'],
  ['lap','Op schoot geslapen'],['name','Reageert op naam'],['toy','Lievelingsspeeltje'],
  ['vet1','Eerste dierenartsbezoek'],['claws','Nagels geknipt'],['scratch','Krabpaal ontdekt'],['outside','Eerste keer in de tuin']
];
// [titel, uitleg, aantal dagen na vandaag/aankomst]
const SUGGEST = [
  ['Kennismaking dierenarts + check-up', 'binnen de eerste week', 7],
  ['Vaccinatie kattenziekte & niesziekte', 'rond 9 weken, 2e prik rond 12 weken', 14],
  ['Ontworming', 'jonge kittens meestal elke 2–4 weken', 14],
  ['Vlooienbehandeling', 'maandelijks, vraag welk middel', 30],
  ['Chip & registratie controleren', 'staat het chipnummer op jouw naam?', 7],
  ['Sterilisatie / castratie bespreken', 'meestal rond 5–6 maanden', 120]
];
const ACTIONS = {
  diary:  ['Dagboek', 'diary', 'Nieuw dagboekstukje'],
  weight: ['Gewicht', 'weight', 'Gewicht noteren'],
  vet:    ['Dierenarts', 'vet', 'Bezoek noteren'],
  photos: ['Fotoalbum', 'photo', 'Foto toevoegen'],
  agenda: ['Agenda', 'event', 'Afspraak toevoegen']
};

// ---------- hulpfuncties ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const fmtDate = (s, opt) => new Date(s + 'T12:00:00').toLocaleDateString('nl-BE', opt || { weekday: 'short', day: 'numeric', month: 'short' });
const fmtG = g => g >= 1000 ? (g / 1000).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg' : Math.round(g) + ' g';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function toast(msg, ms) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms || 2200);
}
function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- opslag in de browser (IndexedDB) ----------
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('kittenboek', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('entries', { keyPath: 'id' });
        d.createObjectStore('kv');
        d.createObjectStore('photos');
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  run(storeName, mode, fn) {
    return new Promise((res, rej) => {
      if (!this.db) return res(undefined); // opslag niet beschikbaar: alleen in het geheugen
      const t = this.db.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  all: (s) => idb.run(s, 'readonly', st => st.getAll()),
  get: (s, k) => idb.run(s, 'readonly', st => st.get(k)),
  put: (s, v, k) => idb.run(s, 'readwrite', st => k === undefined ? st.put(v) : st.put(v, k)),
  del: (s, k) => idb.run(s, 'readwrite', st => st.delete(k)),
  clear: (s) => idb.run(s, 'readwrite', st => st.clear())
};

// ---------- toestand ----------
const EMPTY_PROFILE = { name: '', arrived: today(), born: '', colour: '', chip: '', vetName: '', vetPhone: '', milestones: {}, avatar: '', background: '', hideDemo: false, lastBackup: '' };
let entries = [];
let profile = { ...EMPTY_PROFILE };
let storageOk = true;
let tab = ls.get('kb-tab', 'home');
let selecting = false, confirmDel = false;
const selected = new Set();
let homeLimit = 15;

const store = {
  async add(data) {
    data.id = uid(); data.created = Date.now();
    entries.push(data);
    await idb.put('entries', data);
    render();
  },
  async update(id, patch) {
    const e = entries.find(x => x.id === id); if (!e) return;
    Object.assign(e, patch);
    await idb.put('entries', e);
    render();
  },
  async remove(id) {
    entries = entries.filter(x => x.id !== id);
    await idb.del('entries', id);
    render();
  },
  async saveProfile() {
    await idb.put('kv', profile, 'profile');
    render();
  }
};

// ---------- foto's ----------
const photoUrls = new Map(); // foto-id → tijdelijke adres om te tonen
async function savePhoto(file) {
  const blob = await shrink(file, 1600);
  const id = uid();
  await idb.put('photos', blob, id);
  photoUrls.set(id, URL.createObjectURL(blob));
  return id;
}
async function deletePhoto(id) {
  if (!id) return;
  await idb.del('photos', id);
  const u = photoUrls.get(id); if (u) { URL.revokeObjectURL(u); photoUrls.delete(id); }
}
async function shrink(file, max) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.85));
  } catch { throw { code: 'unsupported_type' }; }
}
const imgTag = (id, extra) => '<img alt="" data-pid="' + esc(id) + '"' + (extra || '') + '>';
// Vult alle <img data-pid> in nadat de pagina getekend is.
async function hydratePhotos() {
  for (const img of document.querySelectorAll('img[data-pid]')) {
    const id = img.dataset.pid;
    if (!photoUrls.has(id)) {
      const blob = await idb.get('photos', id).catch(() => null);
      if (!blob) continue;
      photoUrls.set(id, URL.createObjectURL(blob));
    }
    img.src = photoUrls.get(id);
  }
}

// Toont de achtergrondfoto uit het profiel (of verbergt ze).
async function showBackground() {
  const el = $('#bgphoto'), id = profile.background;
  if (!id) { el.hidden = true; el.style.backgroundImage = ''; return; }
  if (!photoUrls.has(id)) {
    const blob = await idb.get('photos', id).catch(() => null);
    if (!blob) { el.hidden = true; return; }
    photoUrls.set(id, URL.createObjectURL(blob));
  }
  el.style.backgroundImage = 'url("' + photoUrls.get(id) + '")';
  el.hidden = false;
}

// ---------- agenda: Google Agenda-link en .ics-bestand ----------
const compact = s => s.replace(/[-:]/g, '');
function eventTimes(e) {
  if (!e.time) return { allDay: true, start: compact(e.date), end: compact(addDays(e.date, 1)) };
  const start = new Date(e.date + 'T' + e.time + ':00');
  const end = new Date(start.getTime() + 3600e3);
  const local = d => compact(iso(d)) + 'T' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '00';
  return { allDay: false, start: local(start), end: local(end) };
}
const eventTitle = e => (profile.name ? profile.name + ': ' : 'Kitten: ') + (e.title || 'Afspraak');
function gcalUrl(e) {
  const t = eventTimes(e);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: eventTitle(e), dates: t.start + '/' + t.end, details: (e.text ? e.text + '\n\n' : '') + 'Uit Kittenboek' });
  if (!t.allDay && TZ) p.set('ctz', TZ);
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
function icsFile(e) {
  const t = eventTimes(e);
  const txt = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kittenboek//NL', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', 'UID:' + e.id + '@kittenboek', 'DTSTAMP:' + stamp,
    t.allDay ? 'DTSTART;VALUE=DATE:' + t.start : 'DTSTART:' + t.start,
    t.allDay ? 'DTEND;VALUE=DATE:' + t.end : 'DTEND:' + t.end,
    'SUMMARY:' + txt(eventTitle(e)),
    'DESCRIPTION:' + txt((e.text ? e.text + '\n\n' : '') + 'Uit Kittenboek'),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + txt(eventTitle(e)),
    'TRIGGER:' + (t.allDay ? '-PT15H' : '-PT1H'), 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

// ---------- back-up ----------
const blobToDataUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
async function exportBackup() {
  const photos = {};
  const ids = new Set(entries.map(e => e.photo).filter(Boolean));
  if (profile.avatar) ids.add(profile.avatar);
  if (profile.background) ids.add(profile.background);
  for (const id of ids) {
    const b = await idb.get('photos', id).catch(() => null);
    if (b) photos[id] = await blobToDataUrl(b);
  }
  profile.lastBackup = today();
  await idb.put('kv', profile, 'profile');
  const data = { app: 'kittenboek', version: 1, exported: new Date().toISOString(), profile, entries, photos };
  const name = 'kittenboek-' + (profile.name ? profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' : '') + today() + '.json';
  download(name, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  render();
}
async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (!data || data.app !== 'kittenboek' || !Array.isArray(data.entries)) throw new Error('geen kittenboek-back-up');
  await idb.clear('entries'); await idb.clear('photos');
  for (const [id, url] of Object.entries(data.photos || {})) {
    const blob = await (await fetch(url)).blob();
    await idb.put('photos', blob, id);
  }
  for (const e of data.entries) await idb.put('entries', e);
  await idb.put('kv', { ...EMPTY_PROFILE, ...data.profile }, 'profile');
  photoUrls.forEach(u => URL.revokeObjectURL(u)); photoUrls.clear();
  await loadAll();
}
async function wipeAll() {
  await idb.clear('entries'); await idb.clear('photos'); await idb.clear('kv');
  photoUrls.forEach(u => URL.revokeObjectURL(u)); photoUrls.clear();
  entries = []; profile = { ...EMPTY_PROFILE };
  render();
}

// ---------- voorbeelden (alleen zolang er niets genoteerd is) ----------
function demoEntries() {
  const t = today();
  return [
    { id: 'd1', demo: 1, type: 'weight', date: addDays(t, -21), grams: 980 },
    { id: 'd2', demo: 1, type: 'weight', date: addDays(t, -14), grams: 1090, text: 'Eet goed, droog + natvoer' },
    { id: 'd3', demo: 1, type: 'vet', date: addDays(t, -12), title: 'Eerste check-up', grams: 1120, text: 'Oortjes en oogjes proper. Eerste vaccinatie gekregen. Volgende prik over 3 weken.' },
    { id: 'd4', demo: 1, type: 'weight', date: addDays(t, -7), grams: 1210 },
    { id: 'd5', demo: 1, type: 'diary', date: addDays(t, -6), mood: '🙀', who: 'Emma', text: 'In de wasmand gekropen en een sok gestolen!' },
    { id: 'd6', demo: 1, type: 'diary', date: addDays(t, -2), mood: '😻', who: 'Papa', text: 'Voor het eerst op schoot in slaap gevallen tijdens de film.' },
    { id: 'd7', demo: 1, type: 'weight', date: t, grams: 1310 },
    { id: 'd8', demo: 1, type: 'event', date: addDays(t, 9), time: '17:30', title: 'Tweede vaccinatie', text: 'Boekje meenemen' },
    { id: 'd9', demo: 1, type: 'event', date: addDays(t, 4), title: 'Ontwormingspil geven' }
  ];
}
const isDemo = () => entries.length === 0 && !profile.hideDemo;
const all = () => isDemo() ? demoEntries() : entries;
const byDateDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || (b.created || 0) - (a.created || 0);
const weights = () => all().filter(e => e.grams > 0).sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));

// ---------- tekenen ----------
function render() {
  renderHeader();
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  const banners = [];
  if (!profile.name && tab === 'home') banners.push('<div class="card welcome"><h2>Welkom bij Kittenboek!</h2><p style="margin:0 0 10px">Begin met de naam en de gegevens van je kitten. Alles wat je noteert, blijft <b>alleen op dit toestel</b> bewaard. Er gaat niets naar het internet.</p><button class="btn pink" type="button" data-profile="1">Mijn kitten invullen</button></div>');
  if (!storageOk) banners.push('<div class="banner"><b>Let op.</b> Deze browser laat niet toe dat er iets bewaard wordt (misschien een privévenster). Wat je nu noteert, is weg als je de pagina sluit.</div>');
  if (isDemo()) banners.push('<div class="banner"><b>Voorbeeld.</b> Dit zijn verzonnen voorbeelden zodat je ziet hoe het werkt. Ze verdwijnen zodra je zelf iets noteert met de roze knop in een rubriek.<div><button class="btn soft" type="button" data-hidedemo="1">Voorbeelden nu wegdoen</button></div></div>');
  const views = { home: viewHome, diary: viewDiary, weight: viewWeight, vet: viewVet, photos: viewPhotos, agenda: viewAgenda };
  const a = ACTIONS[tab];
  const selBtn = !isDemo() ? '<button class="btn soft" data-selmode="' + (selecting ? 'off' : 'on') + '" type="button">' + (selecting ? 'Klaar' : 'Selecteren') + '</button>' : '';
  const bar = a ? '<div class="actionbar"><h2>' + a[0] + '</h2><div class="row">' + selBtn + (!selecting ? '<button class="btn pink" data-add="' + a[1] + '" type="button">+ ' + a[2] + '</button>' : '') + '</div></div>' +
    (selecting ? '<p class="muted" style="margin:0">Vink aan wat weg mag en druk dan onderaan op Verwijderen.</p>' : '') : '';
  $('#view').innerHTML = '<div class="section">' + bar + banners.join('') + (views[tab] || viewHome)() + '</div>';
  renderSelbar();
  hydratePhotos();
}

function renderHeader() {
  $('#kname').textContent = profile.name || 'Mijn kitten';
  document.title = profile.name ? profile.name + ' · Kittenboek' : 'Kittenboek';
  $('#avatar').innerHTML = profile.avatar ? imgTag(profile.avatar) : CAT_SVG;
  showBackground();
  const days = daysBetween(profile.arrived || today(), today());
  const sub = [days < 0 ? 'Komt op ' + fmtDate(profile.arrived) : days === 0 ? 'Vandaag aangekomen!' : 'Dag ' + (days + 1) + ' bij ons'];
  if (profile.colour) sub.push(profile.colour);
  $('#ksub').textContent = profile.name ? sub.join(' · ') : 'Tik op Profiel om te beginnen';

  const w = weights();
  const last = w[w.length - 1], prev = w[w.length - 2];
  let age = '—', ageSub = 'geboortedatum onbekend';
  if (profile.born) {
    const d = daysBetween(profile.born, today());
    age = d < 7 * 16 ? Math.floor(d / 7) + ' wk' : Math.floor(d / 30.4) + ' mnd';
    ageSub = d < 7 * 16 ? (d % 7 === 0 ? 'precies' : (d % 7) + (d % 7 === 1 ? ' dag' : ' dagen') + ' extra') : 'geboren ' + fmtDate(profile.born, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  let delta = '';
  if (last && prev) {
    const diff = last.grams - prev.grams, per = daysBetween(prev.date, last.date) || 1;
    delta = '<small class="' + (diff >= 0 ? 'up' : 'down') + '">' + (diff >= 0 ? '+' : '−') + Math.abs(Math.round(diff)) + ' g in ' + per + ' d</small>';
  }
  const next = all().filter(e => e.type === 'event' && !e.done && e.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  $('#stats').innerHTML =
    '<div class="stat"><span>LEEFTIJD</span><b class="num">' + age + '</b><small class="muted">' + esc(ageSub) + '</small></div>' +
    '<div class="stat"><span>GEWICHT</span><b class="num">' + (last ? fmtG(last.grams) : '—') + '</b>' + (delta || '<small class="muted">' + (last ? 'gewogen op ' + fmtDate(last.date, { day: 'numeric', month: 'short' }) : 'nog niet gewogen') + '</small>') + '</div>' +
    '<div class="stat"><span>VOLGENDE</span><b style="font-size:20px">' + (next ? esc(next.title) : 'Niets gepland') + '</b><small class="muted">' + (next ? fmtDate(next.date) + (next.time ? ' · ' + esc(next.time) : '') : '') + '</small></div>';
}

function selBox(e) {
  if (!selecting || e.demo) return '';
  return '<input type="checkbox" class="sel" aria-label="Selecteren" data-sel="' + esc(e.id) + '"' + (selected.has(e.id) ? ' checked' : '') + '>';
}

function entryCard(e) {
  const T = TYPES[e.type] || TYPES.diary;
  let body = '';
  if (e.type === 'weight') body += '<h3 class="num">' + fmtG(e.grams) + '</h3>';
  if ((e.type === 'vet' || e.type === 'event' || e.type === 'photo') && e.title) body += '<h3>' + esc(e.title) + '</h3>';
  if (e.type === 'vet' && e.grams) body += '<div class="muted num">Gewogen: ' + fmtG(e.grams) + '</div>';
  if (e.text) body += '<p>' + esc(e.text) + '</p>';
  if (e.photo) body += imgTag(e.photo, ' loading="lazy"');
  return '<article class="entry' + (e.demo ? ' demo' : '') + (selected.has(e.id) ? ' picked' : '') + '"><div class="meta">' + selBox(e) +
    '<span class="pill ' + T.cls + '">' + T.label + '</span>' +
    '<span>' + fmtDate(e.date) + (e.time ? ' · ' + esc(e.time) : '') + '</span>' +
    (e.who ? '<span>· door ' + esc(e.who) + '</span>' : '') +
    (e.mood ? '<span class="mood" title="' + esc((MOODS.find(m => m[0] === e.mood) || [])[1] || '') + '">' + esc(e.mood) + '</span>' : '') +
    '</div>' + body + '</article>';
}

function viewHome() {
  const timeline = all().filter(e => e.type !== 'event' || e.date <= today()).sort(byDateDesc);
  const pics = all().filter(e => e.photo).sort(byDateDesc);
  const ms = profile.milestones || {};
  const done = MILESTONES.filter(m => ms[m[0]]).length;
  const needsBackup = entries.length >= 5 && (!profile.lastBackup || daysBetween(profile.lastBackup, today()) > 30);
  const backup = needsBackup
    ? '<div class="banner"><b>Tip:</b> ' + (profile.lastBackup ? 'je laatste back-up is van ' + fmtDate(profile.lastBackup, { day: 'numeric', month: 'long' }) + '.' : 'je hebt nog geen back-up gemaakt.') + ' Alles staat alleen op dit toestel. Maak een back-up zodat je niets kwijtraakt.<div><button class="btn soft" type="button" data-backup="1">Back-up downloaden</button></div></div>'
    : '';
  return backup +
    '<div class="card"><div class="row spread"><h2>Mijlpalen</h2><span class="muted num">' + done + ' / ' + MILESTONES.length + '</span></div>' +
      '<p class="muted" style="margin:0 0 10px">Tik op een kaartje als het gebeurd is. Dan wordt de datum bewaard.</p>' +
      '<div class="miles">' + MILESTONES.map(([k, l]) => '<button type="button" class="mile' + (ms[k] ? ' done' : '') + '" data-mile="' + k + '">' + l + '<small>' + (ms[k] ? fmtDate(ms[k], { day: 'numeric', month: 'long' }) : 'nog niet') + '</small></button>').join('') + '</div></div>' +
    (pics.length ? '<div class="card"><div class="row spread"><h2>Laatste foto</h2><button class="linkish" data-go="photos" type="button">Alle foto\'s</button></div>' + imgTag(pics[0].photo, ' style="border-radius:12px;width:100%;max-height:360px;object-fit:cover"') + '</div>' : '') +
    '<div><h2 style="font-size:22px">Alles op een rij</h2><p class="muted" style="margin:2px 0 0">Dagboek, gewicht, dierenarts, foto\'s en afspraken samen, nieuwste eerst.</p></div>' +
    '<div class="feed">' + (timeline.slice(0, homeLimit).map(entryCard).join('') || '<div class="empty">Nog niets genoteerd.</div>') + '</div>' +
    (timeline.length > homeLimit ? '<button class="btn soft" type="button" data-more="1">Toon meer</button>' : '');
}

function viewDiary() {
  const list = all().filter(e => e.type === 'diary').sort(byDateDesc);
  if (!list.length) return '<div class="empty">Het dagboek is nog leeg. Wat deed je kitten vandaag?</div>';
  let out = '', cur = '';
  for (const e of list) {
    if (e.date !== cur) { cur = e.date; out += '<div class="daygroup">' + fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' }) + '</div>'; }
    out += entryCard(e);
  }
  return '<div class="feed">' + out + '</div>';
}

function chartSVG(w) {
  const W = 640, H = 240, L = 52, R = 16, T = 16, B = 34;
  const d0 = w[0].date, dN = w[w.length - 1].date, span = Math.max(1, daysBetween(d0, dN));
  const gs = w.map(p => p.grams);
  let lo = Math.max(0, Math.floor((Math.min(...gs) - 50) / 100) * 100), hi = Math.ceil((Math.max(...gs) + 50) / 100) * 100;
  const step = (hi - lo) <= 500 ? 100 : (hi - lo) <= 1500 ? 250 : 500;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = s => L + daysBetween(d0, s) / span * (W - L - R);
  const y = g => T + (1 - (g - lo) / (hi - lo)) * (H - T - B);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gewichtscurve">';
  for (let g = lo; g <= hi; g += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="var(--line)"/><text x="' + (L - 8) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + (g >= 1000 ? (g / 1000).toLocaleString('nl-BE') + ' kg' : g + ' g') + '</text>';
  const pts = w.map(p => [x(p.date), y(p.grams)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  s += '<path d="' + line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - B) + ' L' + pts[0][0].toFixed(1) + ' ' + (H - B) + 'Z" fill="var(--mint-soft)"/>';
  s += '<path d="' + line + '" fill="none" stroke="var(--mint)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
  pts.forEach((p, i) => { const last = i === pts.length - 1; s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (last ? 6 : 4) + '" fill="' + (last ? 'var(--mint)' : 'var(--surface)') + '" stroke="var(--mint)" stroke-width="2.5"/>'; });
  s += '<text x="' + L + '" y="' + (H - 10) + '">' + fmtDate(d0, { day: 'numeric', month: 'short' }) + '</text>';
  s += '<text x="' + (W - R) + '" y="' + (H - 10) + '" text-anchor="end">' + fmtDate(dN, { day: 'numeric', month: 'short' }) + '</text>';
  return s + '</svg>';
}

function viewWeight() {
  const w = weights();
  let rate = '';
  if (w.length >= 2) {
    const a = w[0], b = w[w.length - 1], d = daysBetween(a.date, b.date);
    if (d > 0) {
      const perWeek = (b.grams - a.grams) / d * 7;
      rate = '<p style="margin:8px 0 0"><b class="num">' + (perWeek >= 0 ? '+' : '−') + Math.abs(Math.round(perWeek)) + ' g per week</b> <span class="muted">gemiddeld. Een gezond kitten groeit meestal zo\'n 70–120 g per week; twijfel je, vraag het de dierenarts.</span></p>';
    }
  }
  return '<div class="card"><h2>Groeicurve</h2>' +
      (w.length >= 2 ? '<div class="chartbox">' + chartSVG(w) + '</div>' + rate : '<div class="empty">Weeg minstens twee keer om een curve te zien. Tip: zet een bakje op de keukenweegschaal, druk op "tarra" en zet het kitten erin.</div>') +
    '</div>' +
    '<div class="card"><h2>Alle wegingen</h2>' +
      (w.length ? '<div class="chartbox"><table class="wtable"><thead><tr>' + (selecting ? '<th></th>' : '') + '<th>Datum</th><th>Gewicht</th><th>Verschil</th></tr></thead><tbody>' +
        w.slice().reverse().map((p, i, arr) => {
          const prev = arr[i + 1], diff = prev ? p.grams - prev.grams : null;
          return '<tr' + (selected.has(p.id) ? ' class="picked"' : '') + '>' +
            (selecting ? '<td>' + (p.type === 'weight' ? selBox(p) : '<small class="muted" title="Verwijder dit bij Dierenarts">arts</small>') + '</td>' : '') +
            '<td>' + fmtDate(p.date) + '</td><td>' + fmtG(p.grams) + '</td>' +
            '<td class="' + (diff == null ? 'muted' : diff >= 0 ? 'up' : 'down') + '">' + (diff == null ? '—' : (diff >= 0 ? '+' : '−') + Math.abs(Math.round(diff)) + ' g') + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' : '<div class="empty">Nog geen wegingen.</div>') + '</div>';
}

function viewVet() {
  const list = all().filter(e => e.type === 'vet').sort(byDateDesc);
  const contact = (profile.vetName || profile.vetPhone)
    ? '<p style="margin:0"><b>' + esc(profile.vetName || 'Dierenarts') + '</b>' + (profile.vetPhone ? '<br><a class="linkish num" href="tel:' + esc(profile.vetPhone.replace(/[^\d+]/g, '')) + '">' + esc(profile.vetPhone) + '</a>' : '') + '</p>'
    : '<p class="muted" style="margin:0">Nog geen dierenarts ingevuld. Doe dat bij Profiel.</p>';
  return '<div class="card"><h2>Onze dierenarts</h2>' + contact +
      (profile.chip ? '<p style="margin:10px 0 0" class="muted">Chipnummer: <span class="num" style="user-select:all;color:var(--ink)">' + esc(profile.chip) + '</span></p>' : '') + '</div>' +
    '<div class="feed">' + (list.map(entryCard).join('') || '<div class="empty">Nog geen bezoeken genoteerd.</div>') + '</div>';
}

function viewPhotos() {
  const pics = all().filter(e => e.photo).sort(byDateDesc);
  if (!pics.length) return '<div class="card empty">Nog geen foto\'s. Maak vandaag de eerste!</div>';
  return '<div class="photos">' + pics.map(p =>
    '<figure' + (selected.has(p.id) ? ' class="picked"' : '') + '>' + selBox(p) + imgTag(p.photo, ' loading="lazy"') +
    '<figcaption>' + fmtDate(p.date, { day: 'numeric', month: 'short' }) + (p.title ? ' · ' + esc(p.title) : '') + '</figcaption></figure>').join('') + '</div>';
}

function viewAgenda() {
  const ev = all().filter(e => e.type === 'event');
  const up = ev.filter(e => e.date >= today() && !e.done).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const past = ev.filter(e => e.date < today() || e.done).sort(byDateDesc);
  const row = e => '<div class="ag' + (e.done ? ' done' : '') + (selecting ? ' s' : '') + (selected.has(e.id) ? ' picked' : '') + '">' +
    (selecting ? (selBox(e) || '<span></span>') : '') +
    '<div class="date"><b class="num">' + new Date(e.date + 'T12:00:00').getDate() + '</b><span>' + fmtDate(e.date, { month: 'short' }) + '</span></div>' +
    '<div class="what"><b>' + esc(e.title) + '</b><div class="muted" style="font-size:14px">' + fmtDate(e.date, { weekday: 'long' }) + (e.time ? ' · ' + esc(e.time) : '') + (e.text ? ' · ' + esc(e.text) : '') + '</div></div>' +
    (e.demo ? '<span></span>' : '<input type="checkbox" aria-label="Gedaan" data-done="' + esc(e.id) + '"' + (e.done ? ' checked' : '') + '>') +
    (e.demo || e.done || e.date < today() ? '' :
      '<div class="cal"><a class="linkish" href="' + esc(gcalUrl(e)) + '" target="_blank" rel="noopener">+ Google Agenda</a>' +
      '<button type="button" class="linkish" data-ics="' + esc(e.id) + '">+ Andere agenda (.ics)</button></div>') +
    '</div>';
  return '<h3 style="font-size:20px">Wat komt eraan</h3>' +
    '<div class="agenda">' + (up.map(row).join('') || '<div class="empty">Niets gepland.</div>') + '</div>' +
    '<div class="card"><h2>Handig om te plannen</h2><p class="muted" style="margin:0 0 6px">Richtlijnen voor een nieuw kitten. De dierenarts bepaalt het echte schema.</p><div class="suggest">' +
      SUGGEST.map((s, i) => '<div class="sug"><div><b>' + s[0] + '</b><div class="muted" style="font-size:14px">' + s[1] + '</div></div><button class="btn soft" type="button" data-sug="' + i + '">Inplannen</button></div>').join('') +
    '</div></div>' +
    (past.length ? '<h2 style="font-size:20px" class="muted">Voorbij of gedaan</h2><div class="agenda">' + past.map(row).join('') + '</div>' : '');
}

// ---------- selecteren en verwijderen ----------
function renderSelbar() {
  const sb = $('#selbar');
  sb.hidden = !selecting;
  if (!selecting) return;
  const n = selected.size;
  const chosen = entries.filter(e => selected.has(e.id));
  const note = tab === 'photos' && chosen.some(e => e.type !== 'photo') ? 'Bij foto\'s uit het dagboek verdwijnt alleen de foto; de tekst blijft.'
    : chosen.some(e => e.type === 'event') ? 'Afspraken die je al in een agenda zette, moet je daar zelf verwijderen.' : '';
  sb.innerHTML = confirmDel
    ? '<span><b>' + n + ' item' + (n === 1 ? '' : 's') + ' definitief verwijderen?</b>' + (note ? '<br><small>' + note + '</small>' : '') + '</span><div class="row"><button class="btn soft" type="button" data-selact="no">Nee</button><button class="btn pink" type="button" data-selact="yes">Ja, verwijderen</button></div>'
    : '<span><b class="num">' + n + '</b> geselecteerd</span><button class="btn pink" type="button" data-selact="ask"' + (n ? '' : ' disabled') + '>Verwijderen</button>';
}
async function deleteSelected() {
  let fail = 0;
  $('#selbar').innerHTML = '<span>Bezig met verwijderen…</span>';
  for (const id of [...selected]) {
    const e = entries.find(x => x.id === id); if (!e) continue;
    try {
      await deletePhoto(e.photo);
      if (tab === 'photos' && e.type !== 'photo') await store.update(id, { photo: null });
      else await store.remove(id);
    } catch { fail++; }
  }
  resetSel(); render();
  toast(fail ? fail + ' item(s) konden niet verwijderd worden' : 'Verwijderd');
}
const resetSel = () => { selecting = false; confirmDel = false; selected.clear(); };

// ---------- invulvenster ----------
function closeSheet() { const r = $('#sheetRoot'); r.innerHTML = ''; r.onclick = r.onsubmit = r.onchange = null; }

function openSheet(type, preset) {
  const st = { type: type || 'diary', mood: '', who: ls.get('kb-who', ''), file: null, ...preset };
  const root = $('#sheetRoot');
  const draw = () => {
    const t = st.type, f = [];
    f.push('<label class="f">Datum<input id="f-date" type="date" value="' + esc(st.date || today()) + '"></label>');
    if (t === 'event') f.push('<label class="f">Uur (optioneel)<input id="f-time" type="time" value="' + esc(st.time || '') + '"></label>');
    if (t === 'vet' || t === 'event' || t === 'photo') f.push('<label class="f">' + (t === 'vet' ? 'Reden van het bezoek' : t === 'photo' ? 'Onderschrift' : 'Wat') + '<input id="f-title" type="text" value="' + esc(st.title || '') + '" placeholder="' + (t === 'vet' ? 'bv. eerste vaccinatie' : t === 'photo' ? 'bv. slapen in de doos' : 'bv. ontwormingspil') + '"></label>');
    if (t === 'weight' || t === 'vet') f.push('<label class="f">Gewicht in gram' + (t === 'vet' ? ' (optioneel)' : '') + '<input id="f-grams" type="number" inputmode="numeric" min="50" max="15000" step="1" placeholder="bv. 1250"></label>');
    if (t === 'diary') f.push('<div class="f" style="display:grid;gap:6px;font-weight:700;font-size:14px">Hoe was het vandaag?<div class="chips">' + MOODS.map(m => '<button type="button" class="chip" data-mood="' + m[0] + '" aria-pressed="' + (st.mood === m[0]) + '">' + m[0] + ' ' + m[1] + '</button>').join('') + '</div></div>');
    if (t !== 'weight') f.push('<label class="f">' + (t === 'diary' ? 'Wat is er gebeurd?' : t === 'vet' ? 'Wat zei de dierenarts?' : 'Notitie (optioneel)') + '<textarea id="f-text" placeholder="' + (t === 'diary' ? 'Vandaag heeft ze…' : '') + '">' + esc(st.text || '') + '</textarea></label>');
    if (t === 'diary' || t === 'vet') f.push('<label class="f">Wie schrijft?<input id="f-who" type="text" value="' + esc(st.who) + '" placeholder="bv. Mama, Papa of Emma"></label>');
    if (t !== 'weight' && t !== 'event') f.push('<label class="f">' + (t === 'photo' ? 'Foto' : 'Foto (optioneel)') + '<input id="f-file" type="file" accept="image/*"></label>');
    root.innerHTML = '<div class="overlay" id="ov"><form class="sheet" novalidate>' +
      '<div class="row spread"><h2 style="font-size:26px">Noteren</h2><button type="button" class="iconbtn" id="close">Sluiten</button></div>' +
      '<div class="types">' + Object.entries(TYPES).map(([k, v]) => '<button type="button" data-type="' + k + '" aria-pressed="' + (k === t) + '">' + v.label + '</button>').join('') + '</div>' +
      f.join('') + '<div class="err" id="err"></div><button class="btn pink" id="save" type="submit">Bewaren</button></form></div>';
  };
  const grab = () => {
    const g = id => { const el = $('#' + id); return el ? el.value : undefined; };
    st.date = g('f-date') || st.date; st.time = g('f-time') ?? st.time; st.title = g('f-title') ?? st.title;
    st.text = g('f-text') ?? st.text; st.who = g('f-who') ?? st.who;
    const fl = $('#f-file'); if (fl && fl.files[0]) st.file = fl.files[0];
  };
  draw();
  root.onclick = ev => {
    if (ev.target.id === 'ov') return closeSheet();
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'close') return closeSheet();
    if (b.dataset.type) { grab(); st.type = b.dataset.type; draw(); }
    if (b.dataset.mood) {
      st.mood = st.mood === b.dataset.mood ? '' : b.dataset.mood;
      root.querySelectorAll('[data-mood]').forEach(x => x.setAttribute('aria-pressed', x.dataset.mood === st.mood));
    }
  };
  root.onsubmit = async ev => {
    ev.preventDefault(); grab();
    const err = $('#err'), save = $('#save'); err.textContent = '';
    const t = st.type, grams = $('#f-grams') ? Number($('#f-grams').value) : 0;
    if (t === 'weight' && !(grams > 0)) return err.textContent = 'Vul het gewicht in gram in, bv. 1250.';
    if ((t === 'vet' || t === 'event') && !st.title?.trim()) return err.textContent = 'Geef het een korte titel.';
    if (t === 'diary' && !st.text?.trim() && !st.file) return err.textContent = 'Schrijf iets, of voeg een foto toe.';
    if (t === 'photo' && !st.file) return err.textContent = 'Kies eerst een foto.';
    const data = { type: t, date: st.date || today() };
    if (st.time) data.time = st.time;
    if (st.title?.trim()) data.title = st.title.trim();
    if (st.text?.trim()) data.text = st.text.trim();
    if (grams > 0) data.grams = grams;
    if (t === 'diary' && st.mood) data.mood = st.mood;
    if ((t === 'diary' || t === 'vet') && st.who?.trim()) { data.who = st.who.trim(); ls.set('kb-who', data.who); }
    save.disabled = true; save.textContent = 'Bewaren…';
    try {
      if (st.file) data.photo = await savePhoto(st.file);
      await store.add(data);
      closeSheet();
      toast(t === 'event' ? 'Bewaard. Zet het in je agenda met de link bij de afspraak.' : 'Bewaard', t === 'event' ? 4000 : 2200);
    } catch (e) {
      save.disabled = false; save.textContent = 'Bewaren';
      err.textContent = e && e.code === 'unsupported_type' ? 'Dit fotoformaat lukt niet. Kies een JPG of PNG.'
        : e && e.name === 'QuotaExceededError' ? 'Het toestel heeft geen plaats meer. Verwijder wat oude foto\'s.'
        : 'Bewaren lukte niet. Probeer het zo nog eens.';
    }
  };
}

// ---------- profielvenster (met back-up) ----------
function openProfile() {
  const p = profile, root = $('#sheetRoot');
  let wipeStep = 0, pendingImport = null;
  const inp = (id, label, val, type, ph) => '<label class="f">' + label + '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" placeholder="' + (ph || '') + '"></label>';
  root.innerHTML = '<div class="overlay" id="ov"><form class="sheet" novalidate>' +
    '<div class="row spread"><h2 style="font-size:26px">Profiel</h2><button type="button" class="iconbtn" id="close">Sluiten</button></div>' +
    inp('p-name', 'Naam', p.name, 'text', 'Hoe heet je kitten?') +
    '<div class="grid2">' + inp('p-arrived', 'Bij ons sinds', p.arrived, 'date') + inp('p-born', 'Geboren (ongeveer)', p.born, 'date') + '</div>' +
    inp('p-colour', 'Vacht / ras', p.colour, 'text', 'bv. rode kater, Europese korthaar') +
    inp('p-chip', 'Chipnummer', p.chip, 'text', '15 cijfers') +
    '<div class="grid2">' + inp('p-vet', 'Dierenarts', p.vetName, 'text', 'Naam praktijk') + inp('p-vetphone', 'Telefoon dierenarts', p.vetPhone, 'tel') + '</div>' +
    '<label class="f">Profielfoto<input id="p-avatar" type="file" accept="image/*"></label>' +
    '<label class="f">Achtergrondfoto' + (p.background ? ' (kies een nieuwe om te vervangen)' : '') + '<input id="p-bg" type="file" accept="image/*"></label>' +
    (p.background ? '<label class="check"><input id="p-bgoff" type="checkbox"> Achtergrondfoto weghalen</label>' : '') +
    '<div class="err" id="err"></div><button class="btn pink" id="save" type="submit">Bewaren</button>' +
    '<hr class="divider"><h3>Back-up</h3>' +
    '<p class="muted" style="margin:0">Alles staat alleen op dit toestel. Met een back-up zet je het over naar een ander toestel, of haal je het terug als er iets misgaat.' + (p.lastBackup ? ' Laatste back-up: ' + fmtDate(p.lastBackup, { day: 'numeric', month: 'long', year: 'numeric' }) + '.' : '') + '</p>' +
    '<div class="row"><button class="btn soft" type="button" id="b-export">Back-up downloaden</button>' +
    '<label class="btn soft" for="b-import" style="cursor:pointer">Back-up terugzetten</label><input id="b-import" type="file" accept="application/json,.json" hidden></div>' +
    '<div id="b-msg"></div>' +
    '<hr class="divider"><button class="btn danger" type="button" id="b-wipe">Alles wissen</button>' +
    '</form></div>';
  const msg = html => { $('#b-msg').innerHTML = html; };
  root.onclick = async ev => {
    if (ev.target.id === 'ov' || ev.target.id === 'close') return closeSheet();
    const id = ev.target.id;
    if (id === 'b-export') {
      try { await exportBackup(); msg('<p class="up" style="margin:0;font-weight:700">Back-up gedownload. Bewaar het bestand op een veilige plek.</p>'); }
      catch { msg('<p class="err">De back-up maken lukte niet.</p>'); }
    }
    if (id === 'b-import-yes' && pendingImport) {
      try { await importBackup(pendingImport); closeSheet(); toast('Back-up teruggezet'); }
      catch { msg('<p class="err">Dit bestand kon niet gelezen worden. Kies een back-up die met Kittenboek gemaakt is.</p>'); }
    }
    if (id === 'b-import-no') { pendingImport = null; $('#b-import').value = ''; msg(''); }
    if (id === 'b-wipe') {
      if (wipeStep === 0) { wipeStep = 1; ev.target.textContent = 'Zeker? Alles wordt definitief gewist'; return; }
      await wipeAll(); closeSheet(); toast('Alles gewist');
    }
  };
  root.onchange = ev => {
    if (ev.target.id !== 'b-import' || !ev.target.files[0]) return;
    pendingImport = ev.target.files[0];
    msg('<p style="margin:0 0 8px;font-weight:700">Dit vervangt alles wat nu in de app staat door de back-up. Doorgaan?</p><div class="row"><button class="btn soft" type="button" id="b-import-no">Nee</button><button class="btn pink" type="button" id="b-import-yes">Ja, terugzetten</button></div>');
  };
  root.onsubmit = async ev => {
    ev.preventDefault();
    const v = id => $('#' + id).value.trim();
    const next = { ...profile, name: v('p-name'), arrived: v('p-arrived') || today(), born: v('p-born'), colour: v('p-colour'), chip: v('p-chip'), vetName: v('p-vet'), vetPhone: v('p-vetphone') };
    const file = $('#p-avatar').files[0];
    const bgFile = $('#p-bg').files[0];
    const oldAvatar = profile.avatar, oldBg = profile.background;
    $('#save').disabled = true;
    try {
      if (file) next.avatar = await savePhoto(file);
      if (bgFile) next.background = await savePhoto(bgFile);
      else if ($('#p-bgoff')?.checked) next.background = '';
      profile = next; await store.saveProfile(); closeSheet(); toast('Profiel bewaard');
      // oude foto's pas opruimen als het nieuwe profiel bewaard is
      if (oldAvatar && oldAvatar !== next.avatar) await deletePhoto(oldAvatar);
      if (oldBg && oldBg !== next.background) await deletePhoto(oldBg);
    } catch { $('#save').disabled = false; $('#err').textContent = 'Bewaren lukte niet. Probeer het zo nog eens.'; }
  };
}

// ---------- klikken ----------
$('#tabs').onclick = e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  tab = b.dataset.tab; ls.set('kb-tab', tab); resetSel(); render(); window.scrollTo({ top: 0 });
};
$('#editProfile').onclick = openProfile;
$('#selbar').onclick = e => {
  const b = e.target.closest('[data-selact]'); if (!b) return;
  const a = b.dataset.selact;
  if (a === 'ask') { confirmDel = true; renderSelbar(); }
  else if (a === 'no') { confirmDel = false; renderSelbar(); }
  else if (a === 'yes') deleteSelected();
};
$('#view').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.go) { tab = d.go; ls.set('kb-tab', tab); resetSel(); render(); return; }
  if (d.profile) return openProfile();
  if (d.backup) { try { await exportBackup(); toast('Back-up gedownload'); } catch { toast('De back-up maken lukte niet'); } return; }
  if (d.hidedemo) { profile.hideDemo = true; await store.saveProfile(); toast('Voorbeelden weggedaan'); return; }
  if (d.more) { homeLimit += 15; render(); return; }
  if (d.selmode) { const on = d.selmode === 'on'; resetSel(); selecting = on; render(); return; }
  if (d.add) return openSheet(d.add);
  if (d.sug) {
    const s = SUGGEST[+d.sug];
    const base = profile.arrived > today() ? profile.arrived : today();
    return openSheet('event', { title: s[0], date: addDays(base, s[2]) });
  }
  if (d.mile) {
    profile.milestones = { ...(profile.milestones || {}) };
    if (profile.milestones[d.mile]) delete profile.milestones[d.mile]; else profile.milestones[d.mile] = today();
    try { await store.saveProfile(); } catch { toast('Bewaren lukte niet'); }
    return;
  }
  if (d.ics) {
    const ent = entries.find(x => x.id === d.ics); if (!ent) return;
    download('kittenboek-' + ent.date + '.ics', icsFile(ent));
  }
});
$('#view').addEventListener('change', async e => {
  const sid = e.target.dataset.sel;
  if (sid) {
    if (e.target.checked) selected.add(sid); else selected.delete(sid);
    confirmDel = false;
    const holder = e.target.closest('.entry, .ag, figure, tr');
    if (holder) holder.classList.toggle('picked', e.target.checked);
    renderSelbar(); return;
  }
  const id = e.target.dataset.done; if (!id) return;
  try { await store.update(id, { done: e.target.checked }); } catch { toast('Bewaren lukte niet'); }
});

// ---------- opstarten ----------
async function loadAll() {
  entries = (await idb.all('entries')) || [];
  profile = { ...EMPTY_PROFILE, ...((await idb.get('kv', 'profile')) || {}) };
  render();
}
(async () => {
  try {
    await idb.open();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { storageOk = false; }
  await loadAll().catch(() => { storageOk = false; render(); });
})();

// Offline gebruik en "installeren als app" (werkt enkel via http/https, niet als los bestand)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
