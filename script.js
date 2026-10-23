const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';
const MIN = 60000, DAY = 86400000;
const TARGET_INTERVAL = 1440;   // к дате отказа пауза между сеансами растёт до суток
const RING = 603.2;             // длина окружности кольца (2π·96)

const $ = id => document.getElementById(id);
let binId = localStorage.getItem('binId');
let plan = null;
let sessionEnd = Number(localStorage.getItem('sessionEnd')) || 0;
let editing = false;

/* ---------- API ---------- */
async function api(method, body) {
  const url = `${BASE_URL}/${binId}${method === 'GET' ? '/latest' : ''}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Ошибка сервера ${res.status}`);
  return method === 'GET' ? (await res.json()).record : res.json();
}

async function save() {
  try { await api('PUT', plan); }
  catch (e) { toast('Не удалось сохранить: ' + e.message); }
}

/* ---------- Логика плана ---------- */
const isValid = p => p && p.frequency > 0 && p.duration > 0 && p.start && p.end;

// Пауза зависит только от времени: линейно растёт от исходной до суток к дате отказа.
// Ничего не накапливается — срывы и правка плана пересчитываются сами.
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

  const total = end - start;
  $('progress').textContent = Math.round(Math.min(1, Math.max(0, (now - start) / total)) * 100) + '%';

  if (now < start) {                                   // курс ещё не начался
    $('big').textContent = fmt(start - now);
    $('caption').textContent = 'до старта курса';
    $('days-left').textContent = plural(Math.ceil(total / DAY), 'день', 'дня', 'дней');
    $('interval').textContent = fmtInterval(plan.frequency);
    setRing(0); btn.classList.add('hidden');
    return;
  }
  if (now >= end) {                                    // курс пройден
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

  if (sessionEnd) {                                    // идёт сеанс
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

/* ---------- Вход ---------- */
async function login(id) {
  binId = id;
  try {
    plan = await api('GET');
  } catch (e) {
    toast('Не удалось загрузить: ' + e.message);
    return show('login');
  }
  localStorage.setItem('binId', binId);
  if (isValid(plan)) { show('plan'); render(); }
  else { plan = null; openForm(false); }
}

$('login-btn').onclick = () => {
  const id = $('sync-code').value.trim();
  id ? login(id) : toast('Введи ID');
};
$('sync-code').onkeydown = e => e.key === 'Enter' && $('login-btn').click();
$('logout').onclick = () => { localStorage.removeItem('binId'); binId = plan = null; show('login'); };
$('vape-btn').onclick = () => sessionEnd ? finishSession() : startSession();
$('relapse').onclick = relapse;
$('edit').onclick = () => openForm(true);
$('save-plan').onclick = savePlan;
$('cancel-edit').onclick = () => { show('plan'); render(); };
$('tips-btn').onclick = () => show('tips');
$('back').onclick = () => { show('plan'); render(); };

setInterval(() => { if (!$('plan').classList.contains('hidden')) render(); }, 1000);
binId ? login(binId) : show('login');
