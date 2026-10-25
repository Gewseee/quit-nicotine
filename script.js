const API_URL = 'https://gewseee--6d662ceed07a11f194b21607ee4eb77e.web.val.run';   // адрес твоего val в Val Town
const MIN = 60000, DAY = 86400000;
const TARGET_INTERVAL = 1440;   // к дате отказа пауза между сеансами растёт до суток
const RING = 603.2;             // длина окружности кольца (2π·96)

const $ = id => document.getElementById(id);
const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

let code = localStorage.getItem('syncCode');
let plan = readJSON('plan');
let dirty = localStorage.getItem('dirty') === '1';
let sessionEnd = Number(localStorage.getItem('sessionEnd')) || 0;
let editing = false;

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
  } catch (e) {
    if (e.status === 403) {
      const v = prompt('Нужен пароль регистрации — спроси его у администратора:');
      if (v) { sessionStorage.setItem('invite', v.trim()); return sync(); }
    } else if (e.status === 401) toast('Код синхронизации выглядит неверно');
    else toast('Нет связи — данные сохранены на устройстве');
  }
}

/* ---------- Логика плана ---------- */
const isValid = p => p && p.frequency > 0 && p.duration > 0 && p.start && p.end;

// Пауза зависит только от времени: линейно растёт от исходной до суток к дате отказа.
function intervalAt(p, now) {
  const start = +new Date(p.start), end = +new Date(p.end);
  const k = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return p.frequency + (Math.max(TARGET_INTERVAL, p.frequency) - p.frequency) * k;
}

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

/* ---------- Экраны ---------- */
function show(id) {
  ['login', 'form', 'plan', 'tips'].forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('logout').classList.toggle('hidden', id === 'login');
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

function visibleSection() {
  return ['login', 'form', 'plan', 'tips'].find(s => !$(s).classList.contains('hidden'));
}

// Решаем, какой экран показать по текущему состоянию.
function route() {
  const cur = visibleSection();
  if (!code) return show('login');
  if (!isValid(plan)) { if (cur !== 'form') openForm(false); return; }
  if (cur === 'login' || (cur === 'form' && !editing)) { show('plan'); render(); }
}

function openForm(isEdit) {
  editing = isEdit;
  const today = dateStr(new Date());
  $('form-title').textContent = isEdit ? 'Изменить план' : 'Расскажи о привычке';
  $('save-plan').textContent = isEdit ? 'Сохранить' : 'Создать план';
  $('cancel-edit').classList.toggle('hidden', !isEdit);
  $('frequency').value = isEdit ? plan.frequency : 360;
  $('duration').value = isEdit ? plan.duration : 1;
  $('start-date').value = isEdit ? dateStr(new Date(plan.start)) : today;
  $('end-date').value = isEdit ? dateStr(new Date(plan.end)) : '';
  $('start-date').min = isEdit ? '' : today;
  isEdit ? updatePreview() : setWeeks(4);
  show('form');
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
  $('cravings').textContent = plan.cravings || 0;

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
  const interval = intervalAt(plan, now);
  $('days-left').textContent = plural(Math.ceil((end - now) / DAY), 'день', 'дня', 'дней');
  $('interval').textContent = fmtInterval(interval);

  if (sessionEnd) {
    const left = sessionEnd - now;
    if (left <= 0) return finishSession();
    $('big').textContent = fmt(left);
    $('caption').textContent = 'сеанс идёт';
    btn.textContent = 'Закончить сеанс';
    btn.classList.add('stop');
    setRing(left / (plan.duration * MIN));
    return;
  }

  btn.textContent = 'Начать сеанс';
  const nextAt = plan.lastVapeTime ? +new Date(plan.lastVapeTime) + interval * MIN : 0;
  const wait = nextAt - now;
  if (wait <= 0) {
    $('big').textContent = 'Можно';
    $('caption').textContent = 'но можно и подождать';
    ring.classList.add('ready');
    setRing(1);
  } else {
    $('big').textContent = fmt(wait);
    $('caption').textContent = 'до следующего сеанса';
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
  if (!confirm('Ты сорвался? К плану добавится один день.')) return;
  plan.end = new Date(+new Date(plan.end) + DAY).toISOString();
  plan.relapses = (plan.relapses || 0) + 1;
  render();
  await save();
  toast('Бывает. План сдвинут на день — продолжаем.');
}

async function savePlan() {
  const sStr = $('start-date').value, eStr = $('end-date').value;
  if (!sStr || !eStr) return toast('Укажи обе даты');

  const now = new Date(), today = dateStr(now);
  const sameStart = editing && sStr === dateStr(new Date(plan.start));
  if (sStr < today && !sameStart) return toast('Дата начала не может быть в прошлом');

  const start = sameStart ? new Date(plan.start) : sStr === today ? now : parseDate(sStr);
  const end = parseDate(eStr);
  if (end <= start) return toast('Дата окончания должна быть позже начала');

  plan = {
    ...(editing ? plan : {}),
    frequency: +$('frequency').value,
    duration: +$('duration').value,
    start: start.toISOString(),
    end: end.toISOString(),
    lastVapeTime: editing ? plan.lastVapeTime : null
  };
  show('plan'); render();
  await save();
}

/* ---------- Пресеты и предпросмотр ---------- */
const PRESET_NOTES = {
  2: 'Быстро: паузы растут круто. Тяжелее, зато короче. Подойдёт, если привычка лёгкая.',
  4: 'Спокойно: золотая середина, к паузам привыкаешь постепенно.',
  8: 'Мягко: самый плавный путь. Хорош, если уже срывался или тянет часто.'
};

function setWeeks(w) {
  const d = parseDate($('start-date').value || dateStr(new Date()));
  d.setDate(d.getDate() + w * 7);
  $('end-date').value = dateStr(d);
  updatePreview();
}

function updatePreview() {
  const s = $('start-date').value, e = $('end-date').value, f = +$('frequency').value;
  const days = s && e ? Math.round((parseDate(e) - parseDate(s)) / DAY) : 0;
  document.querySelectorAll('#presets button')
    .forEach(b => b.classList.toggle('on', +b.dataset.weeks * 7 === days));
  $('preset-note').textContent = days > 0
    ? PRESET_NOTES[days / 7] || 'Свои даты: чем длиннее срок, тем мягче растут паузы.'
    : 'Выбери дату окончания или готовый вариант выше.';
  const T = Math.max(TARGET_INTERVAL, f);
  $('preview').innerHTML = days > 0
    ? [['В начале', f], ['Посередине', (f + T) / 2], ['В конце', T]]
        .map(([l, v]) => `<span><b>${fmtInterval(v)}</b>${l}</span>`).join('')
    : '';
}

/* ---------- Тяга: дыхание на 10 минут ---------- */
let sosTimer = null, sosEnd = 0;

function openSos() {
  sosEnd = Date.now() + 10 * MIN;
  $('sos').classList.remove('hidden');
  clearInterval(sosTimer);
  sosTimer = setInterval(() => {
    const left = sosEnd - Date.now(), t = 10 * MIN - left;
    if (left <= 0) return closeSos(true);
    $('sos-text').textContent = t % 10000 < 4000 ? 'Вдох' : 'Выдох';
    $('sos-time').textContent = fmt(left);
  }, 200);
}

async function closeSos(won) {
  clearInterval(sosTimer);
  $('sos').classList.add('hidden');
  if (!won) return;
  plan.cravings = (plan.cravings || 0) + 1;
  render();
  toast('Ты справился. Это победа.');
  await save();
}

/* ---------- Вход по коду ---------- */
async function setCode(c) {
  code = c; plan = null;
  localStorage.setItem('syncCode', c);
  localStorage.removeItem('plan');
  markDirty(false);
  await sync();
  route();
}

$('login-btn').onclick = () => {
  const c = $('sync-code').value.trim().toLowerCase();
  /^[a-f0-9]{32}$/.test(c) ? setCode(c) : toast('Код — 32 символа: цифры и буквы a–f');
};
$('sync-code').onkeydown = e => e.key === 'Enter' && $('login-btn').click();
$('new-btn').onclick = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  setCode([...b].map(x => x.toString(16).padStart(2, '0')).join(''));
};
$('code-btn').onclick = () => {
  navigator.clipboard?.writeText(code);
  toast('Код скопирован. Сохрани его: ' + code);
};
$('logout').onclick = () => {
  if (!confirm('Выйти? Без кода синхронизации вернуться не получится.\nТвой код: ' + code)) return;
  ['syncCode', 'plan', 'dirty', 'sessionEnd'].forEach(k => localStorage.removeItem(k));
  code = plan = null; dirty = false; sessionEnd = 0;
  show('login');
};
$('vape-btn').onclick = () => sessionEnd ? finishSession() : startSession();
$('relapse').onclick = relapse;
$('edit').onclick = () => openForm(true);
$('save-plan').onclick = savePlan;
$('cancel-edit').onclick = () => { show('plan'); render(); };
$('tips-btn').onclick = () => show('tips');
$('back').onclick = () => { show('plan'); render(); };
$('sos-btn').onclick = openSos;
$('sos-done').onclick = () => closeSos(true);
$('sos-close').onclick = () => closeSos(false);
['frequency', 'start-date', 'end-date'].forEach(id => $(id).addEventListener('input', updatePreview));
document.querySelectorAll('#presets button').forEach(b => b.onclick = () => setWeeks(+b.dataset.weeks));

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
