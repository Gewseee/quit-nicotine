const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla'; // Вставь сюда свой ключ из шага 2
const BASE_URL = 'https://api.jsonbin.io/v3/b';

async function login() {
    const code = document.getElementById('sync-code').value.trim();
    if (!code) {
        alert('Введите код!');
        return;
    }

    try {
        let binId = localStorage.getItem(`bin_${code}`);
        let days = 0;

        if (binId) {
            const response = await fetch(`${BASE_URL}/${binId}/latest`, {
                headers: { 'X-Master-Key': API_KEY }
            });
            if (response.ok) {
                const data = await response.json();
                days = data.record.days || 0;
            }
        } else {
            const response = await fetch(BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY,
                    'X-Bin-Name': code
                },
                body: JSON.stringify({ days: 0 })
            });
            const data = await response.json();
            binId = data.metadata.id;
            localStorage.setItem(`bin_${code}`, binId);
        }

        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('main-section').classList.remove('hidden');
        document.getElementById('days').textContent = days;
        document.getElementById('current-code').textContent = code;
        localStorage.setItem('syncCode', code);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

async function addDay() {
    const code = localStorage.getItem('syncCode');
    const binId = localStorage.getItem(`bin_${code}`);
    let days = parseInt(document.getElementById('days').textContent);

    days += 1;

    try {
        await fetch(`${BASE_URL}/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ days: days })
        });
        document.getElementById('days').textContent = days;
    } catch (error) {
        alert('Ошибка при обновлении: ' + error.message);
    }
}

async function resetDays() {
    const code = localStorage.getItem('syncCode');
    const binId = localStorage.getItem(`bin_${code}`);

    try {
        await fetch(`${BASE_URL}/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ days: 0 })
        });
        document.getElementById('days').textContent = 0;
    } catch (error) {
        alert('Ошибка при сбросе: ' + error.message);
    }
}

window.onload = async function() {
    const code = localStorage.getItem('syncCode');
    if (code) {
        document.getElementById('sync-code').value = code;
        await login();
    }
};
