<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyA2QmLBjaCFQmV6DjhoCiBG0HihY4AALXk",
    authDomain: "focusflow-85056.firebaseapp.com",
    projectId: "focusflow-85056",
    storageBucket: "focusflow-85056.firebasestorage.app",
    messagingSenderId: "221972136729",
    appId: "1:221972136729:web:35c3526501b678038afb88",
    measurementId: "G-K4L98YC68V"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>

document.addEventListener("DOMContentLoaded", () => {
    const loader = document.getElementById('loader');
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app');
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username-input');
    const userDisplayName = document.getElementById('user-display-name');
    const logoutBtn = document.getElementById('logout-btn');
    const themeToggle = document.getElementById('theme-toggle');

    let currentUser = localStorage.getItem('focusFlowUser');
    let currentTheme = localStorage.getItem('focusFlowTheme') || 'dark';
    
    let appState = null;
    let timerInterval = null;
    let currentSeconds = 0;
    let isRunning = false;
    let activeSubjectId = "1";

    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.classList.add('hidden');
            checkAuth();
        }, 500);
    }, 1000);

    async function checkAuth() {
        if (currentUser) {
            loginScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
            userDisplayName.textContent = currentUser;
            await loadUserData(currentUser);
            initApp();
            listenToSocialRoom();
        } else {
            appContainer.classList.add('hidden');
            loginScreen.classList.remove('hidden');
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = usernameInput.value.trim().toLowerCase();
        if (name) {
            currentUser = name;
            localStorage.setItem('focusFlowUser', currentUser);
            await checkAuth();
        }
    });

    logoutBtn.addEventListener('click', async () => {
        if(currentUser) {
            const userRef = doc(db, "users", currentUser);
            await updateDoc(userRef, { status: "idle" });
        }
        localStorage.removeItem('focusFlowUser');
        currentUser = null;
        location.reload();
    });

    // --- Firebase Veri Çekme (Heatmap için dailyStats eklendi) ---
    async function loadUserData(username) {
        const userRef = doc(db, "users", username);
        const docSnap = await getDoc(userRef);
        const today = new Date().toISOString().split('T')[0];

        if (docSnap.exists()) {
            appState = docSnap.data();
            
            if (appState.lastLogin !== today) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                
                if (appState.lastLogin === yesterdayStr) {
                    appState.streak += 1;
                } else {
                    appState.streak = 1;
                }
                appState.lastLogin = today;
                await saveToFirebase();
            }
            // Eski kullanıcılarda dailyStats yoksa oluştur
            if(!appState.dailyStats) appState.dailyStats = {};
        } else {
            appState = {
                subjects: [
                    { id: '1', name: "Patoloji", color: "#f43f5e", time: 0 },
                    { id: '2', name: "Farmakoloji", color: "#2dd4bf", time: 0 },
                    { id: '3', name: "Dahiliye", color: "#3b82f6", time: 0 },
                    { id: '4', name: "Üroloji", color: "#a855f7", time: 0 }
                ],
                todos: [],
                totalStudyTime: 0,
                streak: 1,
                lastLogin: today,
                status: "idle",
                currentSubject: "1",
                dailyStats: {} // Tarih bazlı saniye tutacak: {"2026-05-09": 3600}
            };
            await setDoc(userRef, appState);
        }
        document.getElementById('streak-count').textContent = `${appState.streak} Gün`;
    }

    async function saveToFirebase() {
        if (!currentUser || !appState) return;
        const userRef = doc(db, "users", currentUser);
        await updateDoc(userRef, appState);
    }

    function applyTheme() {
        if (currentTheme === 'light') {
            document.body.classList.add('light-mode');
            themeToggle.checked = true;
        } else {
            document.body.classList.remove('light-mode');
            themeToggle.checked = false;
        }
    }
    applyTheme();

    themeToggle.addEventListener('change', (e) => {
        currentTheme = e.target.checked ? 'light' : 'dark';
        localStorage.setItem('focusFlowTheme', currentTheme);
        applyTheme();
    });

    const navLinks = document.querySelectorAll('.nav-links a');
    const views = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            views.forEach(view => view.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            // Stats sekmesine geçilirse heatmap'i güncelle
            if(targetId === 'view-stats') renderHeatmap();
        });
    });

    function initApp() {
        populateSubjects();
        renderTodos();
        setupRing();
        updateDisplay();
        renderHeatmap();
        document.getElementById('total-stat-time').textContent = Math.floor(appState.totalStudyTime / 60) + " dakika";
    }

    const subjectSelector = document.getElementById('subject-selector');
    function populateSubjects() {
        subjectSelector.innerHTML = '';
        appState.subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = sub.name;
            subjectSelector.appendChild(opt);
        });
        subjectSelector.value = activeSubjectId;
        updateRingColor();
    }

    subjectSelector.addEventListener('change', async (e) => {
        activeSubjectId = e.target.value;
        updateRingColor();
        appState.currentSubject = activeSubjectId;
        await saveToFirebase();
    });

    function updateRingColor() {
        const activeSub = appState.subjects.find(s => s.id === activeSubjectId);
        if(activeSub) {
            document.documentElement.style.setProperty('--primary', activeSub.color);
            document.documentElement.style.setProperty('--primary-glow', `${activeSub.color}66`);
        }
    }

    const timeDisplay = document.getElementById('time-display');
    const ringProgress = document.getElementById('timer-ring');
    const timerStatus = document.getElementById('timer-status');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const ringRadius = ringProgress.r.baseVal.value;
    const ringCircumference = ringRadius * 2 * Math.PI;

    function setupRing() {
        ringProgress.style.strokeDasharray = `${ringCircumference} ${ringCircumference}`;
        ringProgress.style.strokeDashoffset = ringCircumference;
    }

    function setProgress(percent) {
        const offset = ringCircumference - (percent / 100) * ringCircumference;
        ringProgress.style.strokeDashoffset = offset;
    }

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function updateDisplay() {
        timeDisplay.textContent = formatTime(currentSeconds);
        const cycleSeconds = 3600; 
        const progress = ((currentSeconds % cycleSeconds) / cycleSeconds) * 100;
        setProgress(progress === 0 && currentSeconds > 0 ? 100 : progress);
    }

    startBtn.addEventListener('click', async () => {
        if(isRunning) return;
        isRunning = true;
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        timerStatus.textContent = "Odaklanılıyor...";
        timerStatus.style.color = "var(--secondary)";
        
        appState.status = "working";
        await saveToFirebase();

        timerInterval = setInterval(() => {
            currentSeconds++;
            appState.totalStudyTime++;
            
            const today = new Date().toISOString().split('T')[0];
            appState.dailyStats[today] = (appState.dailyStats[today] || 0) + 1;

            const activeSub = appState.subjects.find(s => s.id === activeSubjectId);
            if(activeSub) activeSub.time++;

            updateDisplay();
            
            if(currentSeconds % 30 === 0) saveToFirebase();
        }, 1000);
    });

    pauseBtn.addEventListener('click', async () => {
        isRunning = false;
        clearInterval(timerInterval);
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        timerStatus.textContent = "Duraklatıldı";
        timerStatus.style.color = "var(--text-muted)";
        appState.status = "idle";
        await saveToFirebase();
        renderHeatmap();
    });

    stopBtn.addEventListener('click', async () => {
        isRunning = false;
        clearInterval(timerInterval);
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        currentSeconds = 0;
        updateDisplay();
        setProgress(0);
        timerStatus.textContent = "Oturum Bekleniyor";
        timerStatus.style.color = "var(--text-muted)";
        document.getElementById('total-stat-time').textContent = Math.floor(appState.totalStudyTime / 60) + " dakika";
        appState.status = "idle";
        await saveToFirebase();
        renderHeatmap();
    });

    document.getElementById('focus-btn').addEventListener('click', () => {
        document.body.classList.toggle('focus-mode');
        if (document.body.classList.contains('focus-mode')) {
            if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{});
        } else {
            if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
        }
    });

    const todoInput = document.getElementById('todo-input');
    const todoForm = document.getElementById('todo-form');
    const todoList = document.getElementById('todo-list');

    function renderTodos() {
        todoList.innerHTML = '';
        appState.todos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.innerHTML = `
                <div class="checkbox"><i class='bx bx-check' style="${todo.completed ? 'opacity:1' : 'opacity:0'}"></i></div>
                <span>${todo.text}</span>
                <i class='bx bx-trash delete-btn'></i>
            `;
            li.querySelector('.checkbox').addEventListener('click', () => {
                todo.completed = !todo.completed;
                saveToFirebase(); renderTodos();
            });
            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                appState.todos = appState.todos.filter(t => t.id !== todo.id);
                saveToFirebase(); renderTodos();
            });
            todoList.appendChild(li);
        });
    }

    todoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = todoInput.value.trim();
        if(text) {
            appState.todos.unshift({ id: Date.now(), text: text, completed: false });
            todoInput.value = '';
            saveToFirebase(); renderTodos();
        }
    });

    // --- Dinamik Heatmap Render Edilmesi ---
    function renderHeatmap() {
        const heatmap = document.getElementById('heatmap');
        heatmap.innerHTML = '';
        
        // Son 28 günü hesapla
        const today = new Date();
        const daysArray = [];
        for(let i = 27; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            daysArray.push(d.toISOString().split('T')[0]);
        }

        // Günleri kutucuk olarak çiz
        daysArray.forEach(dateStr => {
            const box = document.createElement('div');
            box.className = 'heat-box';
            
            const secondsStudied = appState.dailyStats[dateStr] || 0;
            const minutesStudied = Math.floor(secondsStudied / 60);
            
            // Renk yoğunluğunu çalışma dakikasına göre belirle
            let opacity = 0.05; // Hiç çalışılmadıysa
            if (minutesStudied > 0 && minutesStudied <= 30) opacity = 0.2;
            else if (minutesStudied > 30 && minutesStudied <= 120) opacity = 0.5;
            else if (minutesStudied > 120 && minutesStudied <= 240) opacity = 0.8;
            else if (minutesStudied > 240) opacity = 1.0; // 4 saatten fazlaysa tam renk

            box.style.background = `rgba(124, 58, 237, ${opacity})`;
            box.title = `${dateStr}: ${minutesStudied} dk`; // Üzerine gelince süreyi gösterir
            
            heatmap.appendChild(box);
        });
    }

    function listenToSocialRoom() {
        const socialList = document.querySelector('.social-list');
        const usersCollection = collection(db, "users");

        onSnapshot(usersCollection, (snapshot) => {
            socialList.innerHTML = '';
            
            snapshot.forEach((docSnap) => {
                const userData = docSnap.data();
                const userName = docSnap.id;
                
                if (userName === currentUser) return;

                const currentSubjectObj = userData.subjects.find(s => s.id === userData.currentSubject);
                const subjectName = currentSubjectObj ? currentSubjectObj.name : "Belirsiz";

                const isWorking = userData.status === "working";
                const statusText = isWorking ? `${subjectName} çalışıyor` : "Mola veriyor/Çevrimdışı";
                const activeClass = isWorking ? "active" : "";
                const indicatorStyle = isWorking ? "" : "background: var(--text-muted); box-shadow: none;";

                const userCard = document.createElement('div');
                userCard.className = 'user-card';
                userCard.innerHTML = `
                    <div class="avatar"><img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}" alt="${userName}"></div>
                    <div class="user-info">
                        <h4 style="text-transform: capitalize;">${userName}</h4>
                        <span>${statusText}</span>
                    </div>
                    <div class="status-indicator ${activeClass}" style="${indicatorStyle}"></div>
                `;
                socialList.appendChild(userCard);
            });

            if (socialList.innerHTML === '') {
                socialList.innerHTML = '<p style="color: var(--text-muted); text-align:center; margin-top:20px;">Şu an kimse yok.</p>';
            }
        });
    }
});
