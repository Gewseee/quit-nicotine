const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io';
const USER_DB_ID = '69c7e474ed015c742bc51f23'; // Твой Мастер-бин

const app = {
    currentBinId: localStorage.getItem('activeBinId'),
    plan: null,
    mainTimer: null,

    // 1. ПРИНЯТЬ КУКИ (ФИКС)
    acceptCookies() {
        localStorage.setItem('cookies_accepted', 'true');
        document.getElementById('cookie-notice').classList.add('hidden');
    },

    // 2. РЕГИСТРАЦИЯ НОВОГО ЮЗЕРА (АВТОМАТИКА)
    async createNewUser() {
        const newCode = Math.floor(1000 + Math.random() * 9000).toString();
        try {
            alert("Создаем ваш профиль... Подождите 5 секунд.");
            
            // Создаем новый бин для юзера
            const res = await fetch(BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY, 'X-Bin-Name': `User_${newCode}` },
                body: JSON.stringify({ frequency: 0 })
            });
            const newBin = await res.json();
            const newId = newBin.metadata.id;

            // Обновляем Мастер-бин
            const dbRes = await fetch(`${BASE_URL}/${USER_DB_ID}/latest`, { headers: { 'X-Master-Key': API_KEY }});
            const db = await dbRes.json();
            let currentDb = db.record;
            currentDb[newCode] = newId;

            await fetch(`${BASE_URL}/${USER_DB_ID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify(currentDb)
            });

            alert(`ВАШ КОД: ${newCode}\nЗапишите его!`);
            this.currentBinId = newId;
            localStorage.setItem('activeBinId', newId);
            this.showSection('vape-form');
        } catch (e) { alert("Ошибка регистрации: " + e.message); }
    },

    async handleLogin() {
        const code = document.getElementById('short-code').value.trim();
        if (!code) return;
        try {
            const dbRes = await fetch(`${BASE_URL}/${USER_DB_ID}/latest`, { headers: { 'X-Master-Key': API_KEY }});
            const db = await dbRes.json();
            const realId = db.record[code];
            if (!realId) throw new Error("Код не найден");
            this.currentBinId = realId;
            localStorage.setItem('activeBinId', realId);
            await this.loadRemoteData();
        } catch (e) { alert(e.message); }
    },

    async loadRemoteData() {
        const res = await fetch(`${BASE_URL}/${this.currentBinId}/latest`, { headers: { 'X-Master-Key': API_KEY }});
        const data = await res.json();
        this.plan = data.record;
        if (!this.plan || !this.plan.frequency) this.showSection('vape-form');
        else this.checkFreeze();
    },

    // ТВОЯ ЛОГИКА ЗАМОРОЗКИ
    checkFreeze() {
        const now = new Date();
        const start = new Date(this.plan.startDate);
        this.showSection('plan-section');

        if (start > now) {
            document.getElementById('plan-active').classList.add('hidden');
            document.getElementById('freeze-section').classList.remove('hidden');
            const diff = start - now;
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            document.getElementById('freeze-message').textContent = `Курс начнётся через ${days} дн.`;
        } else {
            document.getElementById('plan-active').classList.remove('hidden');
            document.getElementById('freeze-section').classList.add('hidden');
            this.startAppLogic();
        }
    },

    async saveNewPlan() {
        const freq = parseInt(document.getElementById('vape-frequency').value);
        const dur = parseInt(document.getElementById('vape-duration').value);
        const start = new Date(document.getElementById('start-date').value);
        const end = new Date(document.getElementById('end-date').value);
        
        if (isNaN(start) || isNaN(end) || end <= start) return alert("Проверьте даты!");

        const totalMin = (end - start) / 60000;
        const step = freq / (totalMin / 1440);

        this.plan = {
            frequency: freq,
            currentFreq: freq,
            duration: dur,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            step: step,
            lastVape: null
        };

        await this.sync();
        this.checkFreeze();
    },

    async sync() {
        await fetch(`${BASE_URL}/${this.currentBinId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify(this.plan)
        });
    },

    startAppLogic() {
        if (this.mainTimer) clearInterval(this.mainTimer);
        this.mainTimer = setInterval(() => this.updateUI(), 1000);
        this.updateUI();
    },

    updateUI() {
        const now = new Date();
        const last = this.plan.lastVape ? new Date(this.plan.lastVape) : new Date(this.plan.startDate);
        const nextTime = last.getTime() + (this.plan.currentFreq * 60000);
        const diff = nextTime - now.getTime();
        
        const display = document.getElementById('countdown');
        const btn = document.getElementById('action-btn');

        if (diff > 0) {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            display.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
            display.style.color = "red";
            btn.disabled = true;
        } else {
            display.textContent = "МОЖНО";
            display.style.color = "green";
            btn.disabled = false;
        }

        const days = Math.ceil((new Date(this.plan.endDate) - now) / 86400000);
        document.getElementById('info-days').textContent = days > 0 ? days : 0;
        document.getElementById('info-duration').textContent = this.plan.duration;
    },

    startSession() {
        let time = this.plan.duration * 60;
        const btn = document.getElementById('action-btn');
        btn.disabled = true;
        const sess = setInterval(async () => {
            time--;
            btn.textContent = `Парим: ${Math.floor(time/60)}:${time%60 < 10 ? '0' : ''}${time%60}`;
            if (time <= 0) {
                clearInterval(sess);
                btn.textContent = "Начать сеанс";
                this.plan.lastVape = new Date().toISOString();
                this.plan.currentFreq += this.plan.step;
                await this.sync();
            }
        }, 1000);
    },

    showSection(id) {
        document.querySelectorAll('.container > div').forEach(d => d.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    },

    showPlanSection() { this.showSection('plan-section'); },
    showTips() { this.showSection('tips-section'); },
    editPlan() { this.showSection('vape-form'); },
    resetProgress() { if(confirm("Сбросить прогресс?")) { this.plan.currentFreq = this.plan.frequency; this.sync(); } }
};

// Запуск
if (!localStorage.getItem('cookies_accepted')) document.getElementById('cookie-notice').classList.remove('hidden');
if (app.currentBinId) app.loadRemoteData();
