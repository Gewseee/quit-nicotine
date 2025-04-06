const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';

let currentBinId = null;
let vapeTimer = null;
let nextVapeTimer = null;
let originalPlan = null;

async function login() {
    const binId = document.getElementById('sync-code').value.trim() || localStorage.getItem('binId');
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
        updateFormActions(false);
    } else {
        checkFreeze(plan);
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

    const now = new Date();
    const startDateTime = new Date(start);
    const endDateTime = new Date(end);

    const today = new Date(now.toISOString().split('T')[0]);
    const startDateOnly = new Date(startDateTime.toISOString().split('T')[0]);

    if (startDateOnly < today) {
        alert('Дата начала не может быть раньше сегодняшнего дня!');
        return;
    }

    if (startDateOnly.getTime() === today.getTime()) {
        startDateTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    } else {
        startDateTime.setHours(0, 0, 0, 0);
    }

    if (endDateTime <= startDateTime) {
        alert('Дата окончания должна быть позже начала!');
        return;
    }

    const minutesBetween = Math.ceil((endDateTime - startDateTime) / (1000 * 60));
    const step = frequency / (minutesBetween / (24 * 60));

    const plan = {
        frequency: frequency,
        duration: duration,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        currentFrequency: frequency,
        minutesLeft: minutesBetween,
        step: step,
        lastVapeTime: null
    };

    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(plan)
    });

    originalPlan = null;
    checkFreeze(plan);
}

function showPlan(plan) {
    showSection('plan-section');
    document.getElementById('vape-time').textContent = `${plan.duration} минут`;
    document.getElementById('days-left').textContent = Math.ceil(plan.minutesLeft / (24 * 60));
    document.getElementById('plan-active').classList.remove('hidden');
    document.getElementById('freeze-section').classList.add('hidden');

    if (nextVapeTimer) clearInterval(nextVapeTimer);
    nextVapeTimer = setInterval(() => {
        const now = new Date();
        const lastVape = plan.lastVapeTime ? new Date(plan.lastVapeTime) : null;
        let minutesUntilNext = lastVape ? Math.max(0, plan.currentFrequency - (now - lastVape) / (1000 * 60)) : plan.currentFrequency;
        let secondsLeft = Math.round(minutesUntilNext * 60);
        document.getElementById('next-vape').textContent = secondsLeft > 0 ? `${Math.floor(secondsLeft / 60)} мин ${secondsLeft % 60} сек` : 'Можно парить';
    }, 1000);
}

function getRussianDays(days) {
    if (days % 10 === 1 && days % 100 !== 11) return `${days} день`;
    if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) return `${days} дня`;
    return `${days} дней`;
}

function checkFreeze(plan) {
    const now = new Date();
    const start = new Date(plan.start);

    showSection('plan-section');
    if (start > now) {
        const minutesToStart = Math.ceil((start - now) / (1000 * 60));
        const daysToStart = Math.ceil(minutesToStart / (24 * 60));
        const hoursToStart = Math.floor(minutesToStart / 60);
        const remainingMinutes = minutesToStart % 60;
        document.getElementById('freeze-message').textContent = `Курс начнётся через ${getRussianDays(daysToStart)} (${hoursToStart} ч ${remainingMinutes} мин)`;
        document.getElementById('freeze-section').classList.remove('hidden');
        document.getElementById('plan-active').classList.add('hidden');
        document.getElementById('plan-title').classList.add('hidden');
    } else {
        document.getElementById('freeze-section').classList.add('hidden');
        document.getElementById('plan-title').classList.remove('hidden');
        showPlan(plan);
    }
}

async function editPlan() {
    const plan = await loadPlan();
    originalPlan = { ...plan };
    showSection('vape-form');
    document.getElementById('form-title').textContent = 'Настроить план';
    document.getElementById('vape-frequency').value = plan.frequency || 360;
    document.getElementById('vape-duration').value = plan.duration || 1;
    document.getElementById('start-date').value = plan.start ? plan.start.split('T')[0] : '';
    document.getElementById('end-date').value = plan.end ? plan.end.split('T')[0] : '';
    updateFormActions(true);
}

function cancelEdit() {
    if (originalPlan && (originalPlan.frequency > 0 && originalPlan.duration && originalPlan.start && originalPlan.end)) {
        checkFreeze(originalPlan);
    } else {
        document.getElementById('form-title').textContent = 'Расскажи о своей привычке';
        document.getElementById('vape-frequency').value = '360';
        document.getElementById('vape-duration').value = '1';
        document.getElementById('start-date').value = '';
        document.getElementById('end-date').value = '';
        updateFormActions(false);
        showSection('vape-form');
    }
    originalPlan = null;
}

async function startVaping() {
    const duration = parseInt(document.getElementById('vape-time').textContent);
    let vapeTimeLeft = duration * 60;

    if (nextVapeTimer) clearInterval(nextVapeTimer);
    document.getElementById('start-vape').classList.add('hidden');
    document.getElementById('stop-vape').classList.remove('hidden');

    vapeTimer = setInterval(() => {
        vapeTimeLeft--;
        document.getElementById('vape-time').textContent = `Осталось: ${Math.floor(vapeTimeLeft / 60)} минут ${vapeTimeLeft % 60} секунд`;
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
        plan.minutesLeft -= Math.ceil((new Date() - new Date(plan.lastVapeTime)) / (1000 * 60));
    }
    if (plan.minutesLeft <= 0) plan.currentFrequency = Infinity;

    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(plan)
    });

    checkFreeze(plan);
}

async function confirmReset() {
    const confirmed = confirm('Ты точно сорвался? Это добавит 1 день к плану.');
    if (confirmed) {
        await resetPlan();
    }
}

async function resetPlan() {
    const plan = await loadPlan();
    plan.minutesLeft += 24 * 60;
    plan.end = new Date(new Date(plan.end).getTime() + 24 * 60 * 60 * 1000).toISOString();
    await fetch(`${BASE_URL}/${currentBinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(plan)
    });
    checkFreeze(plan);
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

function updateFormActions(isEditing) {
    const formActions = document.getElementById('form-actions');
    formActions.innerHTML = '';
    const submitButton = document.createElement('button');
    submitButton.textContent = isEditing ? 'Сохранить изменения' : 'Создать план';
    submitButton.onclick = createPlan;
    formActions.appendChild(submitButton);
    if (isEditing) {
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Отменить изменения';
        cancelButton.className = 'cancel-btn';
        cancelButton.onclick = cancelEdit;
        formActions.appendChild(cancelButton);
    }
}

window.onload = async function() {
    await login();
};
