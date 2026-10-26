const API_URL = 'https://gewseee--6d662ceed07a11f194b21607ee4eb77e.web.val.run';   // адрес твоего val в Val Town
const MIN = 60000, DAY = 86400000;
const RING = 603.2;             // длина окружности кольца (2π·96)
const SCREENS = ['login', 'keys', 'form', 'plan', 'tips'];
const LABEL = { start: 'Начать приём', stop: 'Закончить приём', going: 'идёт приём', next: 'до следующего приёма' };
// Первый выбор меняет только формулировки вопросов в форме.
const ASK = {
  none:  { freq: 'Как часто тянет?', dur: 'Сколько это обычно длится?' },
  vape:  { freq: 'Как часто тянет парить?', dur: 'Сколько обычно длится одно парение?' },
  cig:   { freq: 'Как часто хочется курить?', dur: 'Сколько обычно длится одна сигарета?' },
  snus:  { freq: 'Как часто тянет взять снюс?', dur: 'Как долго обычно держишь одну порцию?' },
  other: { freq: 'Как часто тянет принять никотин?', dur: 'Сколько обычно длится один приём?' }
};
const SOS_TOTAL = 5 * MIN, SOS_BREATH = MIN;
const SOS_STEPS = [
  'Выпей стакан воды маленькими глотками.',
  'Встань и пройдись: хотя бы до окна и обратно.',
  'Умойся или помой руки.',
  'Напиши кому-нибудь или позвони.',
  'Пожуй жвачку или съешь что-нибудь.'
];

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const $ = id => document.getElementById(id);
const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

let code = localStorage.getItem('syncCode');
let plan = readJSON('plan');
let dirty = localStorage.getItem('dirty') === '1';
let sessionEnd = Number(localStorage.getItem('sessionEnd')) || 0;
let editing = false, keysFirst = false, offline = false;
let calMin = new Date(), calMonth = new Date();   // первая доступная дата и показанный месяц

/* ---------- Синхронизация ---------- */
async function api(method, body) {
  const headers = { Authorization: 'Bearer ' + code, 'Content-Type': 'application/json' };
  const invite = sessionStorage.getItem('invite');
  if (invite) headers['X-Invite'] = invite;
  const res = await fetch(API_URL, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw Object.assign(new Error('Ошибка сервера ' + res.status), { status: res.status });
  return res.json();
}

function markDirty(v) {
  dirty = v;
  v ? localStorage.setItem('dirty', '1') : localStorage.removeItem('dirty');
}

// Сначала сохраняем на устройстве — приложение работает и без сети.
async function save() {
  localStorage.setItem('plan', JSON.stringify(plan));
  markDirty(true);
  await sync();
}

// Есть несохранённые правки — отправляем, иначе забираем свежую версию с сервера.
async function sync() {
  if (!code) return;
  try {
    if (dirty && isValid(plan)) {
      await api('PUT', { plan });
      markDirty(false);
    } else {
      const r = await api('GET');
      if (r.plan) { plan = r.plan; localStorage.setItem('plan', JSON.stringify(plan)); }
    }
    offline = false;
  } catch (e) {
    if (e.status === 403) {
      const v = prompt('Нужен пароль регистрации — спроси его у администратора:');
      if (v) { sessionStorage.setItem('invite', v.trim()); return sync(); }
    } else if (e.status === 401) toast('Код входа выглядит неверно');
    else if (!offline) { offline = true; toast('Нет связи — данные сохранены на устройстве'); }
  }
}

/* ---------- Логика плана ---------- */
const isValid = p => p && p.frequency > 0 && p.duration > 0 && p.start && p.end;

// Пауза растёт с каждым приёмом: исходная + число приёмов × шаг (шаг не меньше минуты).
// Срыв сдвигает дату окончания, но шаг не меняет — поэтому relapses вычитаем.
const baseDays = p => Math.max(1, Math.round((+new Date(p.end) - +new Date(p.start)) / DAY) - (p.relapses || 0));
const stepOf = p => Math.max(1, p.frequency / baseDays(p));
const intervalOf = p => p.frequency + (p.sessions || 0) * stepOf(p);
const waitLeft = () => plan.lastVapeTime ? +new Date(plan.lastVapeTime) + intervalOf(plan) * MIN - Date.now() : 0;

const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dateStr = d => new Date(+d - d.getTimezoneOffset() * MIN).toISOString().slice(0, 10);
const pad = n => String(n).padStart(2, '0');

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function plural(n, one, few, many) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} ${one}`;
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return `${n} ${few}`;
  return `${n} ${many}`;
}

function fmtInterval(min) {
  const m = Math.round(min);
  return m >= 120 ? `${Math.round(m / 60)} ч` : `${m} мин`;
}

// Своё окно подтверждения вместо системного.
function ask(text, ok = 'Да') {
  return new Promise(res => {
    $('dialog-text').textContent = text;
    $('dialog-ok').textContent = ok;
    $('dialog').classList.remove('hidden');
    const done = v => { $('dialog').classList.add('hidden'); res(v); };
    $('dialog-ok').onclick = () => done(true);
    $('dialog-no').onclick = () => done(false);
  });
}

/* ---------- Экраны ---------- */
function show(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('logout').classList.toggle('hidden', id === 'login');
  $('sync-link').classList.toggle('hidden', id === 'login');
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

const visibleSection = () => SCREENS.find(s => !$(s).classList.contains('hidden'));

// Решаем, какой экран показать по текущему состоянию.
function route() {
  const cur = visibleSection();
  if (!code) return show('login');
  if (cur === 'keys') return;
  if (!isValid(plan)) { if (cur !== 'form') openForm(false); return; }
  if (cur === 'login' || (cur === 'form' && !editing)) { show('plan'); render(); }
}

/* ---------- Форма: карточки выбора ---------- */
const chip = n => document.querySelector(`.chips[data-name="${n}"]`);
const getChip = n => { const b = chip(n).querySelector('.on'); return b && b.dataset.v; };

function setChip(n, v) {
  const btns = [...chip(n).children];
  let best = btns.find(b => b.dataset.v === String(v));
  if (!best && !isNaN(v)) best = btns.reduce((a, b) => Math.abs(+b.dataset.v - v) < Math.abs(+a.dataset.v - v) ? b : a);
  btns.forEach(b => b.classList.toggle('on', b === best));
}

const clearChip = n => chip(n).querySelectorAll('button').forEach(b => b.classList.remove('on'));

function openForm(isEdit) {
  editing = isEdit;
  $('form-title').textContent = isEdit ? 'Изменить план' : 'Настроим план';
  $('form-lead').classList.toggle('hidden', isEdit);
  $('save-plan').textContent = isEdit ? 'Сохранить' : 'Создать план';
  $('cancel-edit').classList.toggle('hidden', !isEdit);
  calMin = parseDate(dateStr(new Date(isEdit ? +new Date(plan.start) + DAY : Date.now() + DAY)));
  if (isEdit) {
    setChip('substance', plan.substance || 'vape');
    setChip('frequency', plan.frequency);
    setChip('duration', plan.duration);
    $('end-date').value = dateStr(new Date(plan.end));
  } else {
    ['substance', 'frequency', 'duration'].forEach(clearChip);
    $('end-date').value = '';
  }
  const chosen = $('end-date').value ? parseDate($('end-date').value) : calMin;
  calMonth = new Date(chosen.getFullYear(), chosen.getMonth(), 1);
  renderCal();
  updatePreview();
  show('form');
}

// Вопросы открываются по порядку, формулировки зависят от первого выбора.
function updatePreview() {
  const sub = getChip('substance'), fr = getChip('frequency'), f = +fr, e = $('end-date').value;
  const done = [sub, fr, getChip('duration'), e];
  document.querySelectorAll('.q[data-step]').forEach(q => {
    const lock = !done.slice(0, +q.dataset.step - 1).every(Boolean);
    q.classList.toggle('locked', lock);
    q.toggleAttribute('inert', lock);
  });
  const a = ASK[sub] || ASK.none;
  $('q-freq').textContent = '2. ' + a.freq;
  $('q-dur').textContent = '3. ' + a.dur;

  const startMs = editing ? +new Date(plan.start) : Date.now();
  const days = e ? Math.ceil((+parseDate(e) - startMs) / DAY) : 0;
  $('until').textContent = !e ? '' : days >= 1 ? `Это через ${plural(days, 'день', 'дня', 'дней')}` : 'Выбери дату позже начала.';
  $('save-plan').disabled = !(done.every(Boolean) && days >= 1);

  const ok = f > 0 && days >= 1, step = Math.max(1, f / days);
  $('preview-box').classList.toggle('hidden', !ok);
  $('preview').innerHTML = ok
    ? [[fmtInterval(f), 'Сейчас'], ['+' + fmtInterval(step), 'за каждый приём'], [fmtInterval(f + 100 * step), 'после 100 приёмов']]
        .map(([v, l]) => `<span><b>${v}</b>${l}</span>`).join('')
    : '';
}

/* ---------- Календарь ---------- */
function renderCal() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $('cal-title').textContent = `${MONTHS[m]} ${y}`;
  const offset = (new Date(y, m, 1).getDay() + 6) % 7, count = new Date(y, m + 1, 0).getDate();
  const sel = $('end-date').value, today = dateStr(new Date());
  let html = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<i>${d}</i>`).join('') + '<span></span>'.repeat(offset);
  for (let d = 1; d <= count; d++) {
    const dt = new Date(y, m, d), ds = dateStr(dt);
    html += `<button type="button" data-d="${ds}" class="${ds === sel ? 'on' : ''} ${ds === today ? 'today' : ''}"${dt < calMin ? ' disabled' : ''}>${d}</button>`;
  }
  $('cal-grid').innerHTML = html;
  $('cal-prev').disabled = new Date(y, m, 1) <= new Date(calMin.getFullYear(), calMin.getMonth(), 1);
}

/* ---------- Отрисовка плана (раз в секунду) ---------- */
function render() {
  if (!isValid(plan)) return;
  const now = Date.now(), start = +new Date(plan.start), end = +new Date(plan.end);
  const ring = document.querySelector('.ring-wrap'), banner = $('banner');
  const btn = $('vape-btn');
  const setRing = f => $('bar').style.strokeDashoffset = RING * (1 - Math.min(1, Math.max(0, f)));
  banner.classList.add('hidden');
  ring.classList.remove('ready');
  btn.classList.remove('stop');
  $('grow').textContent = '+' + fmtInterval(intervalOf(plan) - plan.frequency);

  const total = end - start;
  $('progress').textContent = Math.round(Math.min(1, Math.max(0, (now - start) / total)) * 100) + '%';

  if (now < start) {
    $('big').textContent = fmt(start - now);
    $('caption').textContent = 'до старта курса';
    $('days-left').textContent = plural(Math.ceil(total / DAY), 'день', 'дня', 'дней');
    $('interval').textContent = fmtInterval(plan.frequency);
    setRing(0); btn.classList.add('hidden');
    return;
  }
  if (now >= end) {
    $('big').textContent = '🌿';
    $('caption').textContent = 'курс завершён';
    banner.textContent = 'Ты дошёл до конца. Теперь пауза — целые сутки и дальше.';
    banner.classList.remove('hidden');
    $('days-left').textContent = '0 дней';
    $('interval').textContent = 'сутки+';
    setRing(1); btn.classList.add('hidden');
    return;
  }

  btn.classList.remove('hidden');
  const interval = intervalOf(plan);
  $('days-left').textContent = plural(Math.ceil((end - now) / DAY), 'день', 'дня', 'дней');
  $('interval').textContent = fmtInterval(interval);

  if (sessionEnd) {
    const left = sessionEnd - now;
    if (left <= 0) return finishSession();
    $('big').textContent = fmt(left);
    $('caption').textContent = LABEL.going;
    btn.textContent = LABEL.stop;
    btn.classList.add('stop');
    setRing(left / (plan.duration * MIN));
    return;
  }

  btn.textContent = LABEL.start;
  const wait = waitLeft();
  if (wait <= 0) {
    $('big').textContent = 'Можно';
    $('caption').textContent = 'но можно и подождать';
    ring.classList.add('ready');
    setRing(1);
  } else {
    $('big').textContent = fmt(wait);
    $('caption').textContent = LABEL.next;
    setRing(1 - wait / (interval * MIN));
  }
}

/* ---------- Действия ---------- */
function startSession() {
  sessionEnd = Date.now() + plan.duration * MIN;
  localStorage.setItem('sessionEnd', sessionEnd);
  render();
}

async function finishSession() {
  sessionEnd = 0;
  localStorage.removeItem('sessionEnd');
  plan.lastVapeTime = new Date().toISOString();
  plan.sessions = (plan.sessions || 0) + 1;
  render();
  await save();
}

async function relapse() {
  if (!await ask('Отметить срыв? Конец плана сдвинется на один день.', 'Да, отметить')) return;
  plan.end = new Date(+new Date(plan.end) + DAY).toISOString();
  plan.relapses = (plan.relapses || 0) + 1;
  render();
  await save();
  toast('Бывает. План сдвинут на день — продолжаем.');
}

async function savePlan() {
  const start = editing ? new Date(plan.start) : new Date();
  const end = parseDate($('end-date').value);
  if (end <= start) return toast('Дата отказа должна быть позже начала');
  plan = {
    ...(editing ? plan : {}),
    substance: getChip('substance'),
    frequency: +getChip('frequency'),
    duration: +getChip('duration'),
    start: start.toISOString(),
    end: end.toISOString(),
    lastVapeTime: editing ? plan.lastVapeTime : null
  };
  show('plan'); render();
  await save();
}

/* ---------- Тяга: минута дыхания и простые шаги ---------- */
let sosTimer = null, sosEnd = 0;

function openSos() {
  sosEnd = Date.now() + SOS_TOTAL;
  $('sos').classList.remove('hidden');
  clearInterval(sosTimer);
  sosTimer = setInterval(() => {
    const left = sosEnd - Date.now(), t = SOS_TOTAL - left;
    if (left <= 0) return closeSos(true);
    const breathing = t < SOS_BREATH;
    $('breath').classList.toggle('calm', !breathing);
    $('sos-text').classList.toggle('small', !breathing);
    $('sos-text').textContent = breathing
      ? (t % 10000 < 4000 ? 'Вдох' : 'Выдох')
      : SOS_STEPS[Math.floor((t - SOS_BREATH) / 45000) % SOS_STEPS.length];
    $('sos-time').textContent = fmt(left);
  }, 200);
}

async function closeSos(won) {
  clearInterval(sosTimer);
  $('sos').classList.add('hidden');
  if (!won) return;
  plan.cravings = (plan.cravings || 0) + 1;
  render();
  toast(plan.cravings > 1 ? `Переждал тягу. Это уже ${plan.cravings}-й раз.` : 'Переждал тягу. Это победа.');
  await save();
}

/* ---------- Код входа ---------- */
async function setCode(c, first) {
  code = c; plan = null;
  localStorage.setItem('syncCode', c);
  localStorage.removeItem('plan');
  markDirty(false);
  await sync();
  first ? showKeys(true) : route();
}

function showKeys(first) {
  keysFirst = first;
  $('code-box').value = code;
  $('keys-done').textContent = first ? 'Понятно, дальше' : 'Назад';
  show('keys');
}

$('login-btn').onclick = () => {
  const c = $('sync-code').value.trim().toLowerCase();
  /^[a-f0-9]{32}$/.test(c) ? setCode(c, false) : toast('Код — 32 символа: цифры и буквы a–f');
};
$('sync-code').onkeydown = e => e.key === 'Enter' && $('login-btn').click();
$('new-btn').onclick = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  setCode([...b].map(x => x.toString(16).padStart(2, '0')).join(''), true);
};
$('copy-code').onclick = async () => {
  $('code-box').select();
  try { await navigator.clipboard.writeText(code); } catch { document.execCommand('copy'); }
  const btn = $('copy-code');
  btn.textContent = 'Скопировано ✓';
  setTimeout(() => btn.textContent = 'Скопировать код', 1800);
};
$('keys-done').onclick = () => { show('plan'); route(); render(); };
$('sync-link').onclick = () => showKeys(false);
$('logout').onclick = async () => {
  if (!await ask('Выйти? Без кода входа вернуться не получится.\nТвой код: ' + code, 'Выйти')) return;
  ['syncCode', 'plan', 'dirty', 'sessionEnd'].forEach(k => localStorage.removeItem(k));
  code = plan = null; dirty = false; sessionEnd = 0;
  show('login');
};

/* ---------- Обработчики ---------- */
document.querySelectorAll('.chips').forEach(g => g.onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  setChip(g.dataset.name, b.dataset.v);
  updatePreview();
});
$('cal-grid').onclick = e => {
  const d = e.target.closest('button[data-d]');
  if (!d || d.disabled) return;
  $('end-date').value = d.dataset.d;
  renderCal();
  updatePreview();
};
$('cal-prev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); };
$('cal-next').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); };
$('vape-btn').onclick = async () => {
  if (sessionEnd) {
    const next = fmtInterval(intervalOf(plan) + stepOf(plan));
    if (await ask(`Закончить приём? Следующая пауза будет ${next}.`, 'Закончить')) finishSession();
    return;
  }
  const w = waitLeft();
  const early = w > 0 ? `Пауза ещё не прошла: осталось ${fmt(w)}. ` : '';
  if (await ask(`${early}Начать приём? После него пауза станет длиннее на ${fmtInterval(stepOf(plan))}.`, 'Начать')) startSession();
};
$('relapse').onclick = relapse;
$('edit').onclick = () => openForm(true);
$('save-plan').onclick = savePlan;
$('cancel-edit').onclick = () => { show('plan'); render(); };
$('tips-btn').onclick = () => show('tips');
$('back').onclick = () => { show('plan'); render(); };
$('sos-btn').onclick = openSos;
$('sos-done').onclick = () => closeSos(true);
$('sos-close').onclick = () => closeSos(false);

setInterval(() => { if (!$('plan').classList.contains('hidden')) render(); }, 1000);
// Вернулся на вкладку или появилась сеть — подтягиваем изменения с других устройств.
const resync = async () => { if (document.visibilityState !== 'hidden') { await sync(); route(); render(); } };
document.addEventListener('visibilitychange', resync);
window.addEventListener('online', resync);

(async () => {
  route();
  await sync();
  route();
})();
