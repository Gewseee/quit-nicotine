const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';

let currentBinId = null;
let vapeTimer = null;
let nextVapeTimer = null;
let originalPlan = null;

async function login() {
    const binId = document.getElementById('sync-code').value.trim() || localStorage.getItem('binId');
    document.getElementById('cancel-modal').classList.add('hidden'); // Скрываем модалку при любом входе
    originalPlan = null; // Сбрасываем originalPlan
    if (!binId) {
        showSection('login-section');
        return;
    }

    currentBinId = binId;
    let plan = await loadPlan();
    if (!plan || !(plan.frequency > 0 && plan.duration && plan.start && plan.end)) {
        await fetch(`${BASE_URL}/${currentBinId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ frequency: 0, duration: 0, start: '', end: '', lastVapeTime: null })
        });
        localStorage.setItem('binId', binId);
        showSection('vape-form');
    } else {
        showPlan(plan);
    }
}

async function loadPlan() {
    try {
        const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        if (response.ok) {
            const data = await response.json();
            return data.record || {};
        }
        return {};
    } catch (error) {
        alert('Ошибка загрузки плана: ' + error.message);
        return {};
    }
}

async function createPlan() {
    const frequency = parseInt(document.getElementById('vape-frequency').value);
    const duration = parseInt(document.getElementById('vape-duration').value);
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;

    if (!end || new Date(end) <= new Date(start)) {
        alert('Дата окончания должна быть позже начала!');
        return;
    }

    const currentPlan = await loadPlan();
    const days = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
    const step = frequency / days;

    const plan = {
        frequency: frequency,
        duration: duration,
        start: start,
        end: end,
        currentFrequency: currentPlan.currentFrequency || frequency,
        daysLeft: currentPlan.daysLeft || days,
        step: step,
        lastVapeTime: currentPlan.lastVapeTime || null
    };

    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(plan)
    });

    originalPlan = null;
    showPlan(plan);
}

function showPlan(plan) {
    document.getElementById('cancel-modal').classList.add('hidden'); // Скрываем модалку
    const planSection = document.getElementById('plan-section');
    planSection.classList.remove('frozen');
    showSection('plan-section');
    document.getElementById('vape-time').textContent = `${plan.duration} минут`;
    document.getElementById('days-left').textContent = plan.daysLeft;

    const now = new Date();
    const startDate = new Date(plan.start);

    if (now < startDate) {
        planSection.classList.add('frozen');
        const daysToStart = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
        document.getElementById('days-to-start').textContent = daysToStart;
        document.getElementById('frozen-overlay').classList.remove('hidden');
        document.querySelectorAll('#plan-actions button:not(.always-active)').forEach(btn => btn.disabled = true);
        if (nextVapeTimer) clearInterval(nextVapeTimer);
        document.getElementById('next-vape').textContent = 'Ожидание начала';
        return;
    } else {
        document.getElementById('frozen-overlay').classList.add('hidden');
        document.querySelectorAll('#plan-actions button').forEach(btn => btn.disabled = false);
    }

    if (nextVapeTimer) clearInterval(nextVapeTimer);
    nextVapeTimer = setInterval(() => {
        const now = new Date();
        const lastVape = plan.lastVapeTime ? new Date(plan.lastVapeTime) : null;
        let timeLeft;

        if (lastVape) {
            const elapsed = (now - lastVape) / (1000 * 60);
            timeLeft = Math.max(0, plan.currentFrequency - elapsed) * 60;
        } else {
            timeLeft = plan.currentFrequency * 60;
        }

        document.getElementById('next-vape').textContent = `${Math.floor(timeLeft / 60)} минут ${Math.round(timeLeft % 60)} секунд`;
        if (timeLeft <= 0) document.getElementById('next-vape').textContent = 'Можно парить';
    }, 1000);
}

async function editPlan() {
    const plan = await loadPlan();
    originalPlan = { ...plan };

    showSection('vape-form');
    document.getElementById('form-title').textContent = 'Настроить план';
    document.getElementById('vape-frequency').value = plan.frequency || 360;
    document.getElementById('vape-duration').value = plan.duration || 1;
    document.getElementById('start-date').value = plan.start || '';
    document.getElementById('end-date').value = plan.end || '';
    document.getElementById('submit-plan').textContent = 'Сохранить изменения';
    document.getElementById('submit-plan').onclick = createPlan;
    document.getElementById('cancel-modal').classList.add('hidden'); // Скрываем модалку при открытии формы
}

function cancelEdit() {
    // Показываем модалку только если мы в форме редактирования
    if (document.getElementById('vape-form').classList.contains('hidden')) return;
    document.getElementById('cancel-modal').classList.remove('hidden');
}

function confirmCancel(confirm) {
    const modal = document.getElementById('cancel-modal');
    modal.classList.add('hidden'); // Закрываем модалку сразу
    if (confirm) {
        if (originalPlan && (originalPlan.frequency > 0 && originalPlan.duration && originalPlan.start && originalPlan.end)) {
            showPlan(originalPlan); // Возвращаем к плану
        } else {
            // Сбрасываем форму до начального состояния
            document.getElementById('form-title').textContent = 'Расскажи о своей привычке';
            document.getElementById('vape-frequency').value = '360';
            document.getElementById('vape-duration').value = '1';
            document.getElementById('start-date').value = '';
            document.getElementById('end-date').value = '';
            document.getElementById('submit-plan').textContent = 'Создать план';
            document.getElementById('submit-plan').onclick = createPlan;
            showSection('vape-form');
        }
        originalPlan = null; // Сбрасываем originalPlan
    }
}

async function startVaping() {
    const duration = parseInt(document.getElementById('vape-time').textContent);
    let vapeTimeLeft = duration * 60;

    if (nextVapeTimer) clearInterval(nextVapeTimer);
    document.getElementById('start-vape').classList.add('hidden');
    document.getElementById('stop-vape').classList.remove('hidden');

    vapeTimer = setInterval(() => {
        vapeTimeLeft--;
        document.getElementById('vape-time').textContent = `${Math.floor(vapeTimeLeft / 60)} минут ${vapeTimeLeft % 60} секунд`;
        if (vapeTimeLeft <= 0) {
            clearInterval(vapeTimer);
            document.getElementById('start-vape').classList.remove('hidden');
            document.getElementById('stop-vape').classList.add('hidden');
            updatePlan(true);
        }
    }, 1000);
}

async function stopVaping() {
    if (vapeTimer) clearInterval(vapeTimer);
    document.getElementById('start-vape').classList.remove('hidden');
    document.getElementById('stop-vape').classList.add('hidden');
    updatePlan(true);
}

async function updatePlan(markVapeTime = false) {
    const plan = await loadPlan();
    if (markVapeTime) {
        plan.lastVapeTime = new Date().toISOString();
        plan.currentFrequency += plan.step;
        plan.daysLeft--;
    }
    if (plan.daysLeft <= 0) plan.currentFrequency = Infinity;

    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(plan)
    });

    showPlan(plan);
}

async function resetPlan() {
    const plan = await loadPlan();
    plan.daysLeft += 1;
    plan.end = new Date(new Date(plan.end).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(plan)
    });

    showPlan(plan);
}

function showTips() {
    showSection('tips-section');
    document.getElementById('cancel-modal').classList.add('hidden'); // Скрываем модалку при переходе к советам
}

function backToPlan() {
    showSection('plan-section');
    document.getElementById('cancel-modal').classList.add('hidden'); // Скрываем модалку при возврате
}

function showSection(sectionId) {
    document.querySelectorAll('.container > div').forEach(div => div.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    document.getElementById('cancel-modal').classList.add('hidden'); // Скрываем модалку при переключении секций
}

window.onload = async function() {
    await login();
};
