const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';

let currentBinId = null;
let vapeTimer = null;

async function login() {
    const code = document.getElementById('sync-code').value.trim();
    if (!code) {
        alert('Введите код!');
        return;
    }

    try {
        // Проверяем существующий bin по имени
        const binsResponse = await fetch(`${BASE_URL}?name=${code}`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        const binsData = await binsResponse.json();
        let bin = binsData.record.find(b => b.name === code);

        if (bin) {
            currentBinId = bin.id;
            const planResponse = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
                headers: { 'X-Master-Key': API_KEY }
            });
            const plan = await planResponse.json().record;
            if (plan.frequency) showPlan(plan);
            else showSection('choice-section');
        } else {
            const createResponse = await fetch(BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY,
                    'X-Bin-Name': code
                },
                body: JSON.stringify({ frequency: 0, duration: 0, start: '', end: '' })
            });
            const createData = await createResponse.json();
            currentBinId = createData.metadata.id;
            showSection('choice-section');
        }

        localStorage.setItem('syncCode', code);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

function choose(option) {
    if (option === 'smoke') {
        document.body.innerHTML = '<h1>Пока тут ничего нет, возвращайся позже!</h1>';
    } else {
        showSection('vape-form');
    }
}

async function createPlan() {
    const frequency = parseInt(document.getElementById('vape-frequency').value);
    const duration = parseInt(document.getElementById('vape-duration').value);
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;

    if (!end) {
        alert('Выбери дату окончания!');
        return;
    }

    const days = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
    const step = frequency * 0.1 / days; // Увеличиваем интервал на 10% в день

    const plan = {
        frequency: frequency,
        duration: duration,
        start: start,
        end: end,
        currentFrequency: frequency,
        daysLeft: days
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
    vapeTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('vape-time').textContent = `${Math.floor(timeLeft / 60)} минут ${timeLeft % 60} секунд`;
        if (timeLeft <= 0) {
            clearInterval(vapeTimer);
            updatePlan();
        }
    }, 1000);
}

async function updatePlan() {
    const response = await fetch(`${BASE_URL}/${currentBinId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const plan = await response.json().record;
    plan.currentFrequency += plan.frequency * 0.1; // Увеличиваем интервал
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

function resetPlan() {
    showSection('vape-form');
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
