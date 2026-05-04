document.addEventListener('DOMContentLoaded', () => {
    let fullScheduleData = null;
    let editingNewsId = null;
    
    // Initialize Quill Editor
    var quill = new Quill('#news-editor', {
        theme: 'snow',
        placeholder: 'Wpisz treść komunikatu...',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline'],
                [{ 'header': [1, 2, 3, false] }],
                [{ 'size': ['small', false, 'large', 'huge'] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['clean']
            ]
        }
    });
    
    // Check Auth Status
    checkAuth();

    // Tabs logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    function showStatus(msg, type='success') {
        const el = document.getElementById('status-message');
        el.textContent = msg;
        el.className = `alert ${type}`;
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    async function checkAuth() {
        try {
            const res = await fetch('/api/check-auth');
            const data = await res.json();
            if (data.authenticated) {
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('admin-header-main').style.display = 'block';
                document.getElementById('admin-panel').style.display = 'block';
                loadAdminNews();
                loadAdminSchedule();
            } else {
                document.getElementById('login-screen').style.display = 'flex';
                document.getElementById('admin-header-main').style.display = 'none';
                document.getElementById('admin-panel').style.display = 'none';
            }
        } catch(e) {
            console.error("Auth check failed", e);
        }
    }

    async function loadAdminSchedule() {
        try {
            const res = await fetch('/api/schedule');
            fullScheduleData = await res.json();
            if(Object.keys(fullScheduleData).length === 0) {
                fullScheduleData = { myslenice: { workdays: [], saturday: [], sunday: [] }, sulkowice: { workdays: [], saturday: [], sunday: [] } };
            }
        } catch(e) {
            console.error(e);
        }
    }

    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (data.success) {
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
                checkAuth();
            } else {
                const alertEl = document.getElementById('login-alert');
                alertEl.textContent = data.message;
                alertEl.className = 'alert error';
            }
        } catch(err) {
            console.error(err);
        }
    });

    // Logout
    const logout = async () => {
        await fetch('/api/logout');
        checkAuth();
    };

    document.getElementById('logout-btn-header').addEventListener('click', logout);

    // Upload Schedule Image
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('rozklad_image');
        if (!fileInput.files[0]) return;

        const formData = new FormData();
        formData.append('rozklad_image', fileInput.files[0]);

        try {
            const res = await fetch('/api/admin/upload-image', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                showStatus(data.message, 'success');
                fileInput.value = '';
            } else {
                showStatus(data.error, 'error');
            }
        } catch (err) {
            showStatus('Wystąpił błąd podczas wgrywania pliku.', 'error');
        }
    });

    // Upload Regulamin PDF
    document.getElementById('upload-regulamin-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('regulamin_file');
        if (!fileInput.files[0]) return;

        const formData = new FormData();
        formData.append('regulamin_file', fileInput.files[0]);

        try {
            const res = await fetch('/api/admin/upload-regulamin', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                showStatus(data.message, 'success');
                fileInput.value = '';
            } else {
                showStatus(data.error, 'error');
            }
        } catch (err) {
            showStatus('Wystąpił błąd podczas wgrywania pliku.', 'error');
        }
    });

    // --- SCHEDULE BUILDER LOGIC ---
    const btnLoadSchedule = document.getElementById('load-schedule-view');
    const containerSchedule = document.getElementById('schedule-table-container');
    const btnAddRow = document.getElementById('add-schedule-row');
    const btnSaveSchedule = document.getElementById('save-schedule-btn');

    function renderScheduleTable(city, dayType) {
        if(!fullScheduleData || !fullScheduleData[city]) return;
        
        let courses = fullScheduleData[city][dayType] || [];
        containerSchedule.innerHTML = '';
        
        courses.forEach((course) => {
            containerSchedule.appendChild(createScheduleRow(course.time, course.notes));
        });

        btnAddRow.style.display = 'inline-block';
        btnSaveSchedule.style.display = 'block';
    }

    function createScheduleRow(time = "12:00", notes = []) {
        const div = document.createElement('div');
        div.className = 'schedule-row';
        
        const isS = notes.includes('S');
        const isRD = notes.includes('RD');
        const isH = notes.includes('H');

        div.innerHTML = `
            <input type="time" class="row-time input-time" value="${time}" required style="padding: 6px;">
            <label style="font-size: 0.9rem; display: flex; align-items: center; gap: 4px;"><input type="checkbox" class="row-s" ${isS ? 'checked' : ''}> Szkolny (S)</label>
            <label style="font-size: 0.9rem; display: flex; align-items: center; gap: 4px;"><input type="checkbox" class="row-rd" ${isRD ? 'checked' : ''}> Rudnik (RD)</label>
            <label style="font-size: 0.9rem; display: flex; align-items: center; gap: 4px;"><input type="checkbox" class="row-h" ${isH ? 'checked' : ''}> Harbutowice (H)</label>
            <button type="button" class="btn-danger rm-row" style="margin-left: auto;">Usuń</button>
        `;

        div.querySelector('.rm-row').addEventListener('click', () => { div.remove(); });
        return div;
    }

    btnLoadSchedule.addEventListener('click', () => {
        const city = document.getElementById('schedule-city-select').value;
        const dayType = document.getElementById('schedule-day-select').value;
        renderScheduleTable(city, dayType);
    });

    btnAddRow.addEventListener('click', () => {
        containerSchedule.appendChild(createScheduleRow("12:00", []));
    });

    btnSaveSchedule.addEventListener('click', async () => {
        const city = document.getElementById('schedule-city-select').value;
        const dayType = document.getElementById('schedule-day-select').value;
        
        const rows = document.querySelectorAll('.schedule-row');
        let newCourses = [];
        
        rows.forEach(row => {
            const time = row.querySelector('.row-time').value;
            let notes = [];
            if(row.querySelector('.row-h').checked) notes.push('H');
            if(row.querySelector('.row-s').checked) notes.push('S');
            if(row.querySelector('.row-rd').checked) notes.push('RD');
            
            newCourses.push({ time, notes });
        });

        // Posortujmy po czasie
        newCourses.sort((a, b) => {
            return a.time.localeCompare(b.time);
        });

        // Aktualizuj lokalny obiekt
        fullScheduleData[city][dayType] = newCourses;
        renderScheduleTable(city, dayType); // Odbuduj widok obustronnie po sortowaniu

        try {
            const res = await fetch('/api/admin/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullScheduleData)
            });
            const data = await res.json();
            if (res.ok) {
                showStatus(data.message, 'success');
            } else {
                showStatus(data.error || 'Błąd', 'error');
            }
        } catch(err) {
            showStatus('Błąd sieci/Zapisywania', 'error');
        }
    });

    // --- LIVE PREVIEW LOGIC ---
    const titleInput = document.getElementById('news-title');
    const previewTitle = document.getElementById('live-preview-title');
    const previewContent = document.getElementById('live-preview-content');
    const previewDate = document.getElementById('live-preview-date-text');

    // Mocks initial date and time
    const now = new Date();
    previewDate.textContent = now.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

    titleInput.addEventListener('input', () => {
        previewTitle.textContent = titleInput.value || 'Tytuł ogłoszenia';
    });

    quill.on('text-change', function() {
        const html = quill.root.innerHTML;
        if (quill.getText().trim() === '') {
            previewContent.innerHTML = 'Twój sformatowany tekst pojawi się tutaj...';
        } else {
            previewContent.innerHTML = html;
        }
    });

    // News Submit (Add / Edit)
    document.getElementById('news-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('news-title').value;
        const content = quill.root.innerHTML;
        
        if(quill.getText().trim() === '') {
            showStatus('Treść wiadomości nie może być pusta.', 'error');
            return;
        }

        try {
            const url = editingNewsId ? `/api/admin/news/${editingNewsId}` : '/api/admin/news';
            const method = editingNewsId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content })
            });

            const data = await res.json();
            if (res.ok) {
                showStatus(data.message, 'success');
                cancelEditing();
                renderNewsList(data.news);
            }
        } catch(err) {
             showStatus('Błąd podczas zapisywania komunikatu.', 'error');
        }
    });

    const formBtn = document.querySelector('#news-form button[type="submit"]');
    
    // Anuluj edycję logic
    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.type = 'button';
    cancelEditBtn.className = 'btn-danger';
    cancelEditBtn.style.padding = '15px 30px';
    cancelEditBtn.style.marginLeft = '10px';
    cancelEditBtn.style.display = 'none';
    cancelEditBtn.textContent = 'Anuluj edycję';
    formBtn.parentNode.insertBefore(cancelEditBtn, formBtn.nextSibling);

    window.cancelEditing = () => {
        editingNewsId = null;
        document.getElementById('news-title').value = '';
        quill.root.innerHTML = '';
        formBtn.textContent = 'Zapisz Publikację';
        cancelEditBtn.style.display = 'none';
        
        // Trigger live preview reset
        document.getElementById('news-title').dispatchEvent(new Event('input'));
    };

    cancelEditBtn.addEventListener('click', cancelEditing);

    window.editNews = (id) => {
        fetch('/api/news')
        .then(res => res.json())
        .then(allNews => {
            const newsItem = allNews.find(n => n.id === id);
            if (newsItem) {
                editingNewsId = id;
                document.getElementById('news-title').value = newsItem.title;
                quill.root.innerHTML = newsItem.content;
                formBtn.textContent = 'Zapisz zmiany (Edycja)';
                cancelEditBtn.style.display = 'inline-block';
                document.getElementById('news-title').dispatchEvent(new Event('input'));
                
                // Scroll up smoothly
                document.querySelector('.admin-container').scrollIntoView({ behavior: 'smooth' });
            }
        });
    };

    async function loadAdminNews() {
        try {
            const res = await fetch('/api/news');
            const data = await res.json();
            renderNewsList(data);
        } catch(e) {}
    }

    function renderNewsList(newsList) {
        const listDiv = document.getElementById('news-list');
        listDiv.innerHTML = '';
        if (newsList.length === 0) {
            listDiv.innerHTML = '<p>Brak dodanych aktualności.</p>';
            return;
        }

        newsList.forEach(news => {
            let dateStr = news.date;
            if (news.date && news.date.includes('T')) {
                dateStr = new Date(news.date).toLocaleDateString('pl-PL') + ' ' + new Date(news.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
            }
            const div = document.createElement('div');
            div.className = 'news-list-item';
            div.innerHTML = `
                <div style="flex-grow: 1; padding-right: 20px;">
                    <strong>${news.title}</strong>
                    <div style="font-size: 0.85rem; color: #64748b;">${dateStr} - ${news.content.replace(/<[^>]*>?/gm, '').substring(0, 50)}...</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-primary" style="padding: 8px 16px; font-size: 0.9rem;" onclick="editNews(${news.id})">Edytuj</button>
                    <button class="btn-danger delete-news-btn" style="padding: 8px 16px; font-size: 0.9rem;" data-id="${news.id}">Usuń</button>
                </div>
            `;
            listDiv.appendChild(div);
        });

        document.querySelectorAll('.delete-news-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm('Na pewno usunąć ten komunikat?')) {
                    const id = e.target.dataset.id;
                    await deleteNews(id);
                }
            });
        });
    }

    async function deleteNews(id) {
        try {
            const res = await fetch(`/api/admin/news/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if(res.ok) {
                showStatus(data.message, 'success');
                renderNewsList(data.news);
            }
        } catch(err) {
            showStatus('Błąd przy usuwaniu.', 'error');
        }
    }
});
