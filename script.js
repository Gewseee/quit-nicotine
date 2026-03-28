const API_KEY = '$2a$10$x64cmBVcoKyTf.0mDg7lJePkx.fG5KXYzOGshiFyICAzw9nvEKYla';
const BASE_URL = 'https://api.jsonbin.io/v3/b';

const app = {
    binId: localStorage.getItem('binId') || null,
    plan: null,
    timers: { countdown: null, session: null },

    // Инициализация при входе
    async login() {
        const inputId = document.getElementById('sync-code').value.trim();
        const idToUse = inputId || this.binId;

        if (!idToUse) {
            alert("Введите Bin ID или создайте новый у администратора");
            return;
        }

        this.setLoading(true);
        this.binId = idToUse;
        
        const data = await this.fetchData();
        this.setLoading(false);

        if (data) {
            localStorage.setItem('binId', this.binId);
            this.plan = data;
            document.getElementById('cloud-status').textContent = `ID: ${this.binId}`;
            
            // Если план пустой — в форму, если нет — к таймеру
            if (!this.plan.frequency) {
                this.showSection('vape-form');
            } else {
                this.showPlan();
            }
        }
    },

    // Загрузка данных из облака
    async fetchData() {
        try {
            const res = await fetch(`${BASE_URL}/${this.binId}/latest`, {
                headers: { 'X-Master-Key': API_KEY }
            });
            if (!res.ok) throw new Error("Bin не найден");
            const json = await res.json();
            return json.record;
        } catch (e) {
            alert("Ошибка связи с облаком: " + e.message);
            return null;
        }
    },

    // Сохранение в облако
    async pushData() {
        try {
            await fetch(`${BASE_URL}/${this.binId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json', 
                    'X-Master-Key': API_KEY 
                },
                body: JSON.stringify(this.plan)
            });
        } catch (e) {
            console.error("Ошибка сохранения:", e);
        }
    },

    // Расчет и запуск нового плана
    saveSettings() {
        const freq = parseInt(document.getElementById('vape-frequency').value);
        const dur = parseInt(document.getElementById('vape-duration').value);
        const start = new Date(document.getElementById('start-date').value);
        const end = new Date(document.getElementById('end-date').value);

        if (!start || !end || end <= start) {
            alert("Проверьте даты!");
            return;
        }

        const totalMinutes = (end - start) / (1000 * 60);
        // Расчет шага: насколько увеличивается интервал после каждого парения
        const step = freq / (totalMinutes / (24 * 60));

        this.plan = {
            frequency: freq,       // начальная частота
            currentFreq: freq,     // текущая (будет расти)
            duration: dur,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            step: step,
            lastVape: null
        };

        this.pushData();
        this.showPlan();
    },

    showPlan() {
        this.showSection('plan-section');
        this.updateUI();
        
        if (this.timers.countdown) clearInterval(this.timers.countdown);
        this.timers.countdown = setInterval(() => this.updateUI(), 1000);
    },

    updateUI() {
        if (!this.plan) return;

        const now = new Date();
        const last = this.plan.lastVape ? new Date(this.plan.lastVape) : new Date(this.plan.startDate);
        
        // Сколько минут ДОЛЖНО пройти до следующего раза
        const waitTime = this.plan.currentFreq * 60 * 1000;
        const nextAvailable = last.getTime() + waitTime;
        const diff = nextAvailable - now.getTime();

        const display = document.getElementById('countdown');
        const btn = document.getElementById('vape-action-btn');

        if (diff > 0) {
            const m = Math.floor(diff / 1000 / 60);
            const s = Math.floor((diff / 1000) % 60);
            display.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
            display.style.color = "var(--danger)";
            btn.disabled = true;
            btn.textContent = "Рано парить";
        } else {
            display.textContent = "Можно!";
            display.style.color = "var(--primary)";
            btn.disabled = false;
            btn.textContent = "Начать сеанс";
        }

        document.getElementById('info-duration').textContent = this.plan.duration;
        const daysLeft = Math.ceil((new Date(this.plan.endDate) - now) / (1000 * 60 * 60 * 24));
        document.getElementById('info-days').textContent = daysLeft > 0 ? daysLeft : 0;
    },

    handleVapeAction() {
        const btn = document.getElementById('vape-action-btn');
        
        // Начало сеанса
        let timeLeft = this.plan.duration * 60;
        btn.disabled = true;
        
        if (this.timers.session) clearInterval(this.timers.session);
        
        this.timers.session = setInterval(() => {
            timeLeft--;
            btn.textContent = `Парим: ${Math.floor(timeLeft / 60)}:${timeLeft % 60}`;
            
            if (timeLeft <= 0) {
                clearInterval(this.timers.session);
                this.finishVape();
            }
        }, 1000);
    },

    async finishVape() {
        this.plan.lastVape = new Date().toISOString();
        // Увеличиваем интервал ожидания на рассчитанный шаг
        this.plan.currentFreq += this.plan.step;
        
        await this.pushData();
        this.updateUI();
    },

    // Вспомогательные функции
    showSection(id) {
        document.querySelectorAll('.container > div').forEach(div => {
            if (div.id !== 'cloud-status' && !div.classList.contains('status-badge')) {
                div.classList.add('hidden');
            }
        });
        document.getElementById(id).classList.remove('hidden');
    },

    setLoading(state) {
        document.getElementById('main-app').classList.toggle('loading', state);
    },

    editSettings() { this.showSection('vape-form'); },
    showTips() { this.showSection('tips-section'); },
    confirmReset() { 
        if (confirm("Весь прогресс будет сброшен. Уверены?")) {
            this.plan.currentFreq = this.plan.frequency;
            this.pushData();
            this.updateUI();
        }
    }
};

// Проверка авто-логина при загрузке
if (localStorage.getItem('binId')) {
    app.login();
}
