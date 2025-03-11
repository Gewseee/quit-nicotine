const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';
const MASTER_BIN_ID = '65f7a8d4-dc9f-4b3e-9c2a-8f6e3d1b2c4d'; // Реальный MASTER_BIN_ID

let currentBinId = null;
let vapeTimer = null;
let nextVapeTimer = null;
let nextVapeTimeLeft = 0;

async function login() {
    const code = document.getElementById('sync-code').value.trim();
    if (!code) {
        alert('Введите код!');
        return;
    }

    try {
        // Шаг 1: Получаем текущий мастер-bin
        const masterResponse = await fetch(`${BASE_URL}/${MASTER_BIN_ID}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        if (!masterResponse.ok) throw new Error('Не удалось загрузить мастер-bin');
        const masterData = await masterResponse.json();
        const bins = masterData.record && masterData.record.bins ? masterData.record.bins : {};
        console.log('Мастер-bin:', bins); // Отладка

        // Шаг 2: Проверяем, есть ли binId для этого кода
        currentBinId = bins[code];
        console.log('Найден binId для кода', code, ':', currentBinId); // Отладка

        if (currentBinId) {
            // Шаг 3: Загружаем существующий план
            const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
                headers: { 'X-Master-Key': API_KEY }
            });
            if (response.ok) {
                const plan = await response.json().record;
                console.log('Загружен план:', plan); // Отладка
                if (plan.frequency && plan.code === code) {
                    showPlan(plan);
                    return;
                }
            } else {
                console.log('BinId существует, но данные недоступны, создаём новый'); // Отладка
            }
        }

        // Шаг 4: Если binId нет или данные повреждены, создаём новый bin
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
        console.log('Создан новый binId:', currentBinId); // Отладка

        // Шаг 5: Обновляем мастер-bin с новым binId
        bins[code] = currentBinId;
        const updateMasterResponse = await fetch(`${BASE_URL}/${MASTER_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ bins: bins })
        });
        if (!updateMasterResponse.ok) throw new Error('Не удалось обновить мастер-bin');
        console.log('Мастер-bin обновлён:', bins); // Отладка

        localStorage.setItem('syncCode', code);
        showSection('choice-section');
    } catch (error) {
        alert('Ошибка: ' + error.message);
        console.error('Ошибка в login:', error);
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

    if (nextVapeTimer) clearInterval(nextVapeTimer);
    nextVapeTimeLeft = plan.currentFrequency * 60;
    nextVapeTimer = setInterval(() => {
        nextVapeTimeLeft--;
        document.getElementById('next-vape').textContent = `${Math.floor(nextVapeTimeLeft / 60)} минут ${nextVapeTimeLeft % 60} секунд`;
        if (nextVapeTimeLeft <= 0) clearInterval(nextVapeTimer);
    }, 1000);
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
            updatePlan();
        }
    }, 1000);
}

async function stopVaping() {
    if (vapeTimer) clearInterval(vapeTimer);
    document.getElementById('start-vape').classList.remove('hidden');
    document.getElementById('stop-vape').classList.add('hidden');

    nextVapeTimer = setInterval(() => {
        nextVapeTimeLeft--;
        document.getElementById('next-vape').textContent = `${Math.floor(nextVapeTimeLeft / 60)} минут ${nextVapeTimeLeft % 60} секунд`;
        if (nextVapeTimeLeft <= 0) clearInterval(nextVapeTimer);
    }, 1000);

    updatePlan();
}

async function updatePlan() {
    const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const plan = await response.json().record;
    plan.currentFrequency += plan.step;
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

    nextVapeTimeLeft = plan.currentFrequency * 60;
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
