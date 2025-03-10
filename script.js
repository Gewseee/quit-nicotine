const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla'; // Твой ключ
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
                method: 'GET',
                headers: {
                    'X-Master-Key': API_KEY
                }
            });
            if (response.ok) {
                const data = await response.json();
                days = data.record.days || 0;
            } else {
                throw new Error('Не удалось загрузить данные: ' + response.status);
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
            if (response.ok) {
                const data = await response.json();
                binId = data.metadata.id;
                localStorage.setItem(`bin_${code}`, binId);
            } else {
                throw new Error('Не удалось создать bin: ' + response.status);
            }
        }

        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('main-section').classList.remove('hidden');
        document.getElementById('days').textContent = days;
        document.getElementById('current-code').textContent = code;
        localStorage.setItem('syncCode', code);
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Что-то пошло не так: ' + error.message);
    }
}

async function addDay() {
    const code = localStorage.getItem('syncCode');
    const binId = localStorage.getItem(`bin_${code}`);
    let days = parseInt(document.getElementById('days').textContent);

    days += 1;

    try {
        const response = await fetch(`${BASE_URL}/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ days: days })
        });
        if (response.ok) {
            document.getElementById('days').textContent = days;
        } else {
            throw new Error('Не удалось обновить данные: ' + response.status);
        }
    } catch (error) {
        alert('Ошибка при обновлении: ' + error.message);
    }
}

async function resetDays() {
    const code = localStorage.getItem('syncCode');
    const binId = localStorage.getItem(`bin_${code}`);

    try {
        const response = await fetch(`${BASE_URL}/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ days: 0 })
        });
        if (response.ok) {
            document.getElementById('days').textContent = 0;
        } else {
            throw new Error('Не удалось сбросить данные: ' + response.status);
        }
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
