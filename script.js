const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io';
const USER_DB_ID = '69c7e474ed015c742bc51f23'; // Твой Мастер-бин

const app = {
    currentBinId: localStorage.getItem('activeBinId'),
    plan: null,
    timer: null,

    // ПРИНЯТЬ КУКИ (ФИКС)
    acceptCookies() {
        localStorage.setItem('cookies_accepted', 'true');
        document.getElementById('cookie-notice').classList.add('hidden');
    },

    // СОЗДАНИЕ ЮЗЕРА (ФИКС)
    async createNewUser() {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        try {
            alert("Создаем профиль... Подождите пару секунд.");
            // 1. Создаем Бин
            const res = await fetch(BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY, 'X-Bin-Name': `User_${code}` },
                body: JSON.stringify({ frequency: 0 })
            });
            const newBin = await res.json();
            const newId = newBin.metadata.id;

            // 2. Пишем в Мастер-бин
            const dbRes = await fetch(`${BASE_URL}/${USER_DB_ID}/latest`, { headers: { 'X-Master-Key': API_KEY }});
            const db = await dbRes.json();
            let currentDb = db.record;
            currentDb[code] = newId;

            await fetch(`${BASE_URL}/${USER_DB_ID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify(currentDb)
            });

            alert(`ВАШ КОД: ${code}\nЗапишите его!`);
            this.currentBinId = newId;
            localStorage.setItem('activeBinId', newId);
            this.showSection('vape-form');
        } catch (e) { alert("Ошибка: " + e.message); }
    },

    // ВХОД (ФИКС 777)
    async handleLogin() {
        const code = document.getElementById('short-code').value.trim();
        if (!code) return;
        try {
            const dbRes = await fetch(`${BASE_URL}/${USER_DB_ID}/latest`, { headers: { 'X-Master-Key': API_KEY }});
            const db = await dbRes.json();
            const realId = db.record[code];
            if (!realId) throw new Error("Код неверный!");
            
            this.currentBinId = realId;
            localStorage.setItem('activeBinId', realId);
            await this.loadRemoteData();
        } catch (e) { alert(e.message); }
    },

    async loadRemoteData() {
        try {
            const res = await fetch(`${BASE_URL}/${this.currentBinId}/latest`, { headers: { 'X-Master-Key': API_KEY }});
            const data = await res.json();
            this.plan = data.record;
            document.getElementById('cloud-info').textContent = `Синхронизировано`;
            
            if (!this.plan || !this.plan.frequency) this.showSection('vape-form');
            else this.checkFreeze();
        } catch (e) { console.error(e); }
    },

    checkFreeze() {
        const now = new Date();
        const start = new Date(this.plan.startDate);
        this.showSection('plan-section');

        if (start > now) {
            document.getElementById('plan-active').classList.add('hidden');
            document.getElementById('freeze-section').classList.remove('hidden');
            const days = Math.ceil((start - now) / 86400000);
            document.getElementById('freeze-message').textContent = `Старт через ${days} дн.`;
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
        if (isNaN(start) || isNaN(end)) return alert("Укажите даты!");

        const totalMin = (end - start) / 60000;
        const step = freq / (totalMin / 1440);

        this.plan = { frequency: freq, currentFreq: freq, duration: dur, startDate: start.toISOString(), endDate: end.toISOString(), step: step, lastVape: null };
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
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.updateUI(), 1000);
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
            display.style.color = "var(--danger)";
            btn.disabled = true;
        } else {
            display.textContent = "ПОРА";
            display.style.color = "var(--primary)";
            btn.disabled = false;
        }
        const days = Math.ceil((new Date(this.plan.endDate) - now) / 86400000);
        document.getElementById('info-days').textContent = days > 0 ? days : 0;
        document.getElementById('info-dur').textContent = this.plan.duration;
    },

    startSession() {
        let time = this.plan.duration * 60;
        const btn = document.getElementById('action-btn');
        btn.disabled = true;
        const sess = setInterval(async () => {
            time--;
            btn.textContent = `Сеанс: ${Math.floor(time/60)}:${time%60 < 10 ? '0' : ''}${time%60}`;
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
        document.querySelectorAll('.container > div').forEach(d => { if (d.id !== 'cloud-info') d.classList.add('hidden'); });
        document.getElementById(id).classList.remove('hidden');
    },

    editPlan() { this.showSection('vape-form'); },
    showTips() { this.showSection('tips-section'); },
    resetProgress() { if(confirm("Сбросить сложность?")) { this.plan.currentFreq = this.plan.frequency; this.sync(); } }
};

if (!localStorage.getItem('cookies_accepted')) document.getElementById('cookie-notice').classList.remove('hidden');
if (app.currentBinId) app.loadRemoteData();
