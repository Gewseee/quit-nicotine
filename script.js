const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';
const MASTER_BIN_ID = '6603c8b2-1e7b-4f8a-9b2c-5d8e7f9a3b4c'; // Замени на свой реальный MASTER_BIN_ID

let currentBinId = null;
let vapeTimer = null;

async function login() {
    const code = document.getElementById('sync-code').value.trim();
    if (!code) {
        alert('Введите код!');
        return;
    }

    try {
        const masterResponse = await fetch(`${BASE_URL}/${MASTER_BIN_ID}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        const masterData = await masterResponse.json();
        const bins = masterData.record.bins || {};

        currentBinId = bins[code];

        if (currentBinId) {
            const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
                headers: { 'X-Master-Key': API_KEY }
            });
            if (response.ok) {
                const plan = await response.json().record;
                if (plan.frequency && plan.code === code) {
                    showPlan(plan);
                    return;
                }
            }
        }

        const createResponse = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY,
                'X-Bin-Name': code
            },
            body: JSON.stringify({ code: code, frequency: 0, duration: 0, start: '', end: '' })
        });
        if (!createResponse.ok) throw new Error('Не удалось создать bin');
        const createData = await createResponse.json();
        currentBinId = createData.metadata.id;

        bins[code] = currentBinId;
        await fetch(`${BASE_URL}/${MASTER_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ bins: bins })
        });

        localStorage.setItem('syncCode', code);
        showSection('choice-section');
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

function choose(option) {
    if (option === 'smoke') {
        document.body.innerHTML = '<h1>Пока тут ничего нет, возвращайся позже!</h1>';
    } else {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('start-date').setAttribute('min', today);
        document.getElementById('start-date').value = today;
        document.getElementById('end-date').setAttribute('min', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        showSection('vape-form');
    }
}

async function createPlan() {
    const frequency = parseInt(document.getElementById('vape-frequency').value);
    const duration = parseInt(document.getElementById('vape-duration').value);
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;

    if (!end || new Date(end) <= new Date(start)) {
        alert('Выбери дату окончания позже начала!');
        return;
    }

    const days = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
    const step = frequency / days;

    const plan = {
        code: localStorage.getItem('syncCode'),
        frequency: frequency,
        duration: duration,
        start: start,
        end: end,
        currentFrequency: frequency,
        daysLeft: days,
        step: step
    };

    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': API_KEY
        },
        body: JSON.stringify(plan)
    });

    showPlan(plan);
}

function showPlan(plan) {
    showSection('plan-section');
    document.getElementById('next-vape').textContent = `${Math.round(plan.currentFrequency)} минут`;
    document.getElementById('vape-time').textContent = `${plan.duration} минут`;
    document.getElementById('days-left').textContent = plan.daysLeft;

    if (vapeTimer) clearInterval(vapeTimer);
    let timeLeft = plan.currentFrequency * 60;
    vapeTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('next-vape').textContent = `${Math.floor(timeLeft / 60)} минут ${timeLeft % 60} секунд`;
        if (timeLeft <= 0) clearInterval(vapeTimer);
    }, 1000);
}

async function startVaping() {
    const duration = parseInt(document.getElementById('vape-time').textContent);
    let timeLeft = duration * 60;
    clearInterval(vapeTimer);
    document.getElementById('stop-vape').classList.remove('hidden');
    vapeTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('vape-time').textContent = `${Math.floor(timeLeft / 60)} минут ${timeLeft % 60} секунд`;
        if (timeLeft <= 0) {
            clearInterval(vapeTimer);
            document.getElementById('stop-vape').classList.add('hidden');
            updatePlan();
        }
    }, 1000);
}

async function stopVaping() {
    clearInterval(vapeTimer);
    document.getElementById('stop-vape').classList.add('hidden');
    updatePlan();
}

async function updatePlan() {
    const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const plan = await response.json().record;
    plan.currentFrequency += plan.step; // Используем заранее рассчитанный шаг
    plan.daysLeft--;
    if (plan.daysLeft <= 0) plan.currentFrequency = Infinity;

    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': API_KEY
        },
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
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': API_KEY
        },
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
    const code = localStorage.getItem('syncCode');
    if (code) {
        document.getElementById('sync-code').value = code;
        await login();
    }
};
