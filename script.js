const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';

let currentBinId = null;
let vapeTimer = null;
let nextVapeTimer = null;

async function login() {
    const binId = document.getElementById('sync-code').value.trim() || localStorage.getItem('binId');
    if (!binId) {
        showSection('login-section');
        return;
    }

    currentBinId = binId;
    try {
        const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        if (response.ok) {
            const data = await response.json();
            const plan = data.record || {};
            if (plan.frequency > 0 && plan.duration && plan.start && plan.end) {
                showPlan(plan);
                return;
            }
        }
        await fetch(`${BASE_URL}/${currentBinId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ frequency: 0, duration: 0, start: '', end: '', lastVapeTime: null })
        });
        localStorage.setItem('binId', binId);
        showSection('vape-form');
    } catch (error) {
        alert('Ошибка: ' + error.message);
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

    const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const currentPlan = response.ok ? (await response.json()).record : {};

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

    showPlan(plan);
}

function showPlan(plan) {
    showSection('plan-section');
    document.getElementById('vape-time').textContent = `${plan.duration} минут`;
    document.getElementById('days-left').textContent = plan.daysLeft;

    const now = new Date();
    const startDate = new Date(plan.start);

    if (now < startDate) {
        const daysToStart = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
        document.getElementById('days-to-start').textContent = daysToStart;
        document.getElementById('frozen-overlay').classList.remove('hidden');
        document.getElementById('next-vape').textContent = 'Ожидание начала';
        if (nextVapeTimer) clearInterval(nextVapeTimer);
        return;
    } else {
        document.getElementById('frozen-overlay').classList.add('hidden');
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
    const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const plan = await response.json().record;

    showSection('vape-form');
    document.getElementById('form-title').textContent = 'Изменить план';
    document.getElementById('vape-frequency').value = plan.frequency;
    document.getElementById('vape-duration').value = plan.duration;
    document.getElementById('start-date').value = plan.start;
    document.getElementById('end-date').value = plan.end;
    document.getElementById('submit-plan').textContent = 'Сохранить изменения';
    document.getElementById('submit-plan').onclick = async () => {
        await createPlan();
        document.getElementById('form-title').textContent = 'Расскажи о своей привычке';
        document.getElementById('submit-plan').textContent = 'Создать план';
        document.getElementById('submit-plan').onclick = createPlan;
    };
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
    const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const plan = await response.json().record;
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
    const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const plan = await response.json().record;
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
}

function backToPlan() {
    showSection('plan-section');
}

function showSection(sectionId) {
    document.querySelectorAll('.container > div').forEach(div => div.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
}

window.onload = async function() {
    await login();
};
