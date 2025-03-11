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
        le
