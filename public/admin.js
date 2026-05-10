document.addEventListener('DOMContentLoaded', () => {
    let fullScheduleData = null;
    let editingNewsId = null;
    let allStops = [];
    let allPrices = [];
    let allFaqs = [];
    let editingFaqId = null;

    // Initialize Quill Editor
    var quill = new Quill('#news-editor', {
        theme: 'snow',
        placeholder: 'Wpisz treść komunikatu...',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline'],
                [{ 'header': [1, 2, 3, false] }],
                [{ 'size': ['small', false, 'large', 'huge'] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
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

    function showStatus(msg, type = 'success') {
        const container = document.getElementById('notification-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = type === 'success' ? '✅' : '⚠️';

        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${msg}</span>
        `;

        container.appendChild(toast);

        // Console reporting
        if (type === 'success') {
            console.log(`%c[ADMIN SUCCESS] ${msg}`, 'color: #10b981; font-weight: bold;');
        } else {
            console.error(`%c[ADMIN ERROR] ${msg}`, 'color: #ef4444; font-weight: bold;');
        }

        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => {
                toast.remove();
            }, 500);
        }, 4000);
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
                loadPricingData();
                loadFaqData();
            } else {
                document.getElementById('login-screen').style.display = 'flex';
                document.getElementById('admin-header-main').style.display = 'none';
                document.getElementById('admin-panel').style.display = 'none';
            }
        } catch (e) {
            console.error("Auth check failed", e);
        }
    }

    async function loadAdminSchedule() {
        try {
            const res = await fetch('/api/schedule');
            fullScheduleData = await res.json();
            if (Object.keys(fullScheduleData).length === 0) {
                fullScheduleData = { myslenice: { workdays: [], saturday: [], sunday: [] }, sulkowice: { workdays: [], saturday: [], sunday: [] } };
            }
        } catch (e) {
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
        } catch (err) {
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
                showStatus('Pomyślnie zaktualizowano plik rozkładu (.png)', 'success');
                fileInput.value = '';
            } else {
                showStatus(data.error || 'Błąd podczas wgrywania rozkładu', 'error');
            }
        } catch (err) {
            showStatus('Wystąpił krytyczny błąd połączenia przy wgrywaniu rozkładu.', 'error');
            console.error("Critical upload error:", err);
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
                showStatus('Pomyślnie zaktualizowano plik regulaminu (.pdf)', 'success');
                fileInput.value = '';
            } else {
                showStatus(data.error || 'Błąd podczas wgrywania regulaminu', 'error');
            }
        } catch (err) {
            showStatus('Wystąpił krytyczny błąd połączenia przy wgrywaniu regulaminu.', 'error');
            console.error("Critical regulamin upload error:", err);
        }
    });

    // --- SCHEDULE BUILDER LOGIC ---
    const btnLoadSchedule = document.getElementById('load-schedule-view');
    const containerSchedule = document.getElementById('schedule-table-container');
    const btnAddRow = document.getElementById('add-schedule-row');
    const btnSaveSchedule = document.getElementById('save-schedule-btn');

    function renderScheduleTable(city, dayType) {
        if (!fullScheduleData || !fullScheduleData[city]) return;

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
            if (row.querySelector('.row-h').checked) notes.push('H');
            if (row.querySelector('.row-s').checked) notes.push('S');
            if (row.querySelector('.row-rd').checked) notes.push('RD');

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
        } catch (err) {
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

    quill.on('text-change', function () {
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
        if (!title || title.trim() === '') {
            showStatus('Nie można opublikować: Brakuje tytułu aktualności!', 'error');
            return;
        }

        if (quill.getText().trim() === '') {
            showStatus('Nie można opublikować: Treść wiadomości nie może być pusta.', 'error');
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
                showStatus(editingNewsId ? 'Aktualność została pomyślnie zedytowana.' : 'Nowa aktualność została opublikowana!', 'success');
                cancelEditing();
                renderNewsList(data.news);
            } else {
                showStatus(data.error || 'Błąd podczas zapisywania aktualności.', 'error');
            }
        } catch (err) {
            showStatus('Błąd sieci/serwera podczas publikacji.', 'error');
            console.error("News saving error:", err);
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
        } catch (e) { }
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
                if (confirm('Na pewno usunąć ten komunikat?')) {
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
            if (res.ok) {
                showStatus('Aktualność została pomyślnie usunięta.', 'success');
                renderNewsList(data.news);
            } else {
                showStatus(data.error || 'Błąd podczas usuwania aktualności.', 'error');
            }
        } catch (err) {
            showStatus('Błąd połączenia podczas usuwania aktualności.', 'error');
            console.error("News deletion error:", err);
        }
    }

    // --- PRICING LOGIC ---
    async function loadPricingData() {
        try {
            const res = await fetch('/api/pricing-data');
            const data = await res.json();
            allStops = data.stops;
            allPrices = data.prices;
            renderStopsList();
            populatePriceDropdowns();
        } catch (e) {
            console.error("Failed to load pricing data", e);
        }
    }

    function renderStopsList() {
        const container = document.getElementById('stops-list-container');
        container.innerHTML = '';
        if (allStops.length === 0) {
            container.innerHTML = '<p style="color: #64748b; font-size: 0.9rem;">Brak dodanych przystanków.</p>';
            return;
        }

        allStops.forEach(stop => {
            const div = document.createElement('div');
            div.className = 'stop-item';
            div.dataset.id = stop.id;
            div.innerHTML = `
                <div class="drag-handle" title="Przeciągnij, aby zmienić kolejność">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; opacity: 0.5;"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                </div>
                <div class="stop-name">${stop.name}</div>
                <div class="stop-actions">
                    <button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem; background: #64748b;" onclick="editStop(${stop.id}, '${stop.name.replace(/'/g, "\\'")}')">Edytuj</button>
                    <button class="btn-danger" style="padding: 8px 16px; font-size: 0.85rem;" onclick="deleteStop(${stop.id})">Usuń</button>
                </div>
            `;
            container.appendChild(div);
        });

        // Initialize Sortable
        new Sortable(container, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: function () {
                saveReorder();
            }
        });
    }

    async function saveReorder() {
        const items = document.querySelectorAll('.stop-item');
        const orders = Array.from(items).map((item, index) => ({
            id: parseInt(item.dataset.id),
            sort_order: index
        }));

        try {
            const res = await fetch('/api/admin/stops/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orders })
            });
            if (res.ok) {
                showStatus('Kolejność przystanków została zapisana.', 'success');
                // Refresh local data to match server sort
                const data = await fetch('/api/pricing-data').then(r => r.json());
                allStops = data.stops;
                populatePriceDropdowns();
            } else {
                showStatus('Błąd podczas zapisywania kolejności.', 'error');
            }
        } catch (e) {
            showStatus('Błąd połączenia przy zapisywaniu kolejności.', 'error');
            console.error("Reorder failed", e);
        }
    }

    window.editStop = async (id, currentName) => {
        const newName = prompt('Wpisz nową nazwę przystanku:', currentName);
        if (newName === null || newName.trim() === '' || newName === currentName) return;

        try {
            const res = await fetch(`/api/admin/stops/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            });
            const data = await res.json();
            if (res.ok) {
                allStops = data.stops;
                showStatus('Nazwa przystanku została zaktualizowana.', 'success');
                renderStopsList();
                populatePriceDropdowns();
            } else {
                showStatus(data.error || 'Błąd podczas edycji przystanku.', 'error');
            }
        } catch (e) {
            showStatus('Błąd połączenia podczas edycji przystanku.', 'error');
            console.error("Edit stop error:", e);
        }
    };

    window.deleteStop = async (id) => {
        if (!confirm('Na pewno usunąć ten przystanek? Spowoduje to również usunięcie wszystkich powiązanych cen!')) return;
        try {
            const res = await fetch(`/api/admin/stops/${id}`, { method: 'DELETE' });
            if (res.ok) {
                const data = await res.json();
                allStops = data.stops;
                showStatus('Przystanek usunięty pomyślnie.', 'success');
                loadPricingData(); // Reload everything to refresh prices
            } else {
                showStatus('Błąd podczas usuwania przystanku.', 'error');
            }
        } catch (e) {
            showStatus('Krytyczny błąd podczas usuwania przystanku.', 'error');
            console.error("Stop deletion error:", e);
        }
    };

    document.getElementById('add-stop-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-stop-name').value.trim();
        if (!name) {
            showStatus('Wpisz nazwę przystanku przed dodaniem.', 'error');
            return;
        }
        try {
            const res = await fetch('/api/admin/stops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (res.ok) {
                allStops = data.stops;
                document.getElementById('new-stop-name').value = '';
                showStatus(`Przystanek "${name}" został dodany.`, 'success');
                loadPricingData();
            } else {
                showStatus(data.error || 'Błąd dodawania przystanku.', 'error');
            }
        } catch (e) {
            showStatus('Błąd połączenia przy dodawaniu przystanku.', 'error');
            console.error("Add stop error:", e);
        }
    });

    function populatePriceDropdowns() {
        const selectA = document.getElementById('price-stop-a');
        const selectB = document.getElementById('price-stop-b');
        const prevA = selectA.value;
        const prevB = selectB.value;

        selectA.innerHTML = '<option value="">-- Wybierz przystanek A --</option>';
        selectB.innerHTML = '<option value="">-- Wybierz przystanek B --</option>';

        allStops.forEach(stop => {
            selectA.add(new Option(stop.name, stop.id));
            selectB.add(new Option(stop.name, stop.id));
        });

        if (prevA) selectA.value = prevA;
        if (prevB) selectB.value = prevB;

        updatePriceForm();
    }

    function updatePriceForm() {
        const id1 = parseInt(document.getElementById('price-stop-a').value);
        const selectB = document.getElementById('price-stop-b');
        const id2 = parseInt(selectB.value);

        // Reset inputs
        document.getElementById('price-s').value = '';
        document.getElementById('price-m').value = '';
        document.getElementById('price-md').value = '';

        if (!id1) {
            // Reset colors if A is not selected
            Array.from(selectB.options).forEach(opt => opt.style.color = '');
            return;
        }

        // Color options in B based on existing prices with A
        Array.from(selectB.options).forEach(opt => {
            const bId = parseInt(opt.value);
            if (!bId || bId === id1) {
                opt.style.color = '';
                return;
            }

            const stop1 = Math.min(id1, bId);
            const stop2 = Math.max(id1, bId);
            const hasPrice = allPrices.some(p => p.stop1_id === stop1 && p.stop2_id === stop2);

            opt.style.color = hasPrice ? '' : '#ef4444'; // Red if no price
            if (!hasPrice) {
                opt.text = opt.text.replace(' (brak ceny)', '') + ' (brak ceny)';
            } else {
                opt.text = opt.text.replace(' (brak ceny)', '');
            }
        });

        if (!id2 || id1 === id2) return;

        const stop1 = Math.min(id1, id2);
        const stop2 = Math.max(id1, id2);
        const price = allPrices.find(p => p.stop1_id === stop1 && p.stop2_id === stop2);

        if (price) {
            document.getElementById('price-s').value = price.price_s;
            document.getElementById('price-m').value = price.price_m;
            document.getElementById('price-md').value = price.price_md;
        }
    }

    document.getElementById('price-stop-a').addEventListener('change', updatePriceForm);
    document.getElementById('price-stop-b').addEventListener('change', updatePriceForm);

    // Auto-calculate discount (-49%)
    document.getElementById('price-m').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
            // Ulgowy to -49% czyli 51% ceny podstawowej
            const discounted = (val * 0.51).toFixed(2);
            document.getElementById('price-md').value = discounted;
        }
    });

    document.getElementById('save-price-btn').addEventListener('click', async () => {
        const stop1_id = parseInt(document.getElementById('price-stop-a').value);
        const stop2_id = parseInt(document.getElementById('price-stop-b').value);
        const price_s = parseFloat(document.getElementById('price-s').value);
        const price_m = parseFloat(document.getElementById('price-m').value);
        const price_md = parseFloat(document.getElementById('price-md').value);

        if (!stop1_id || !stop2_id || isNaN(price_s)) {
            showStatus('Wypełnij przynajmniej cenę jednorazową.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/admin/pricing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stop1_id, stop2_id, price_s, price_m, price_md })
            });
            const data = await res.json();
            if (res.ok) {
                allPrices = data.prices;
                showStatus('Cena relacji została pomyślnie zapisana.', 'success');
                updatePriceForm();
            } else {
                showStatus(data.error || 'Błąd podczas zapisywania ceny.', 'error');
            }
        } catch (e) {
            showStatus('Błąd połączenia podczas zapisywania ceny.', 'error');
            console.error("Price save error:", e);
        }
    });

    // --- FAQ LOGIC ---
    async function loadFaqData() {
        try {
            const res = await fetch('/api/faq');
            allFaqs = await res.json();
            renderFaqList();
        } catch (e) {
            console.error("Failed to load FAQ data", e);
        }
    }

    function renderFaqList() {
        const container = document.getElementById('faq-list-container');
        container.innerHTML = '';
        if (allFaqs.length === 0) {
            container.innerHTML = '<p style="color: #64748b; font-size: 0.9rem;">Brak pytań FAQ.</p>';
            return;
        }

        allFaqs.forEach(faq => {
            const div = document.createElement('div');
            div.className = 'faq-admin-item';
            div.dataset.id = faq.id;
            div.innerHTML = `
                <div class="faq-admin-drag" title="Przeciągnij, aby zmienić kolejność">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; opacity: 0.5;"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                </div>
                <div class="faq-admin-content">
                    <div class="faq-admin-question">${faq.question}</div>
                    <div class="faq-admin-answer">${faq.answer.replace(/<[^>]*>?/gm, '')}</div>
                </div>
                <div class="faq-admin-actions">
                    <button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem; background: #64748b;" onclick="editFaq(${faq.id})">Edytuj</button>
                    <button class="btn-danger" style="padding: 8px 16px; font-size: 0.85rem;" onclick="deleteFaq(${faq.id})">Usuń</button>
                </div>
            `;
            container.appendChild(div);
        });

        new Sortable(container, {
            animation: 150,
            handle: '.faq-admin-drag',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: async function () {
                const items = container.querySelectorAll('.faq-admin-item');
                const orders = Array.from(items).map((item, index) => ({
                    id: parseInt(item.dataset.id),
                    sort_order: index
                }));

                try {
                    await fetch('/api/admin/faq/reorder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orders })
                    });
                    showStatus('Kolejność FAQ została zapisana.', 'success');
                } catch (e) {
                    showStatus('Błąd połączenia przy zapisywaniu kolejności FAQ.', 'error');
                }
            }
        });
    }

    document.getElementById('faq-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = document.getElementById('faq-question').value.trim();
        const answer = document.getElementById('faq-answer').value.trim();

        if (!question || !answer) return;

        const url = editingFaqId ? `/api/admin/faq/${editingFaqId}` : '/api/admin/faq';
        const method = editingFaqId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answer })
            });
            const data = await res.json();
            if (res.ok) {
                allFaqs = data.faqs;
                showStatus(editingFaqId ? 'Pytanie FAQ zostało zaktualizowane.' : 'Nowe pytanie FAQ zostało dodane.', 'success');
                resetFaqForm();
                renderFaqList();
            } else {
                showStatus(data.error || 'Błąd zapisu FAQ.', 'error');
            }
        } catch (e) {
            showStatus('Błąd połączenia przy zapisywaniu FAQ.', 'error');
        }
    });

    function resetFaqForm() {
        editingFaqId = null;
        document.getElementById('faq-question').value = '';
        document.getElementById('faq-answer').value = '';
        document.getElementById('faq-save-btn').textContent = 'Zapisz Pytanie FAQ';

        const cancelBtn = document.getElementById('faq-cancel-edit');
        if (cancelBtn) cancelBtn.remove();
    }

    window.editFaq = (id) => {
        const faq = allFaqs.find(f => f.id === id);
        if (!faq) return;

        editingFaqId = id;
        document.getElementById('faq-question').value = faq.question;
        document.getElementById('faq-answer').value = faq.answer;
        document.getElementById('faq-save-btn').textContent = 'Zapisz zmiany w FAQ';

        if (!document.getElementById('faq-cancel-edit')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.id = 'faq-cancel-edit';
            cancelBtn.className = 'btn-danger';
            cancelBtn.style.cssText = 'padding: 12px 24px; margin-left: 10px;';
            cancelBtn.textContent = 'Anuluj';
            cancelBtn.onclick = resetFaqForm;
            document.getElementById('faq-save-btn').parentNode.appendChild(cancelBtn);
        }

        document.getElementById('tab-faq').scrollIntoView({ behavior: 'smooth' });
    };

    window.deleteFaq = async (id) => {
        if (!confirm('Na pewno usunąć to pytanie FAQ?')) return;
        try {
            const res = await fetch(`/api/admin/faq/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                allFaqs = data.faqs;
                showStatus('Pytanie FAQ zostało usunięte.', 'success');
                renderFaqList();
            }
        } catch (e) {
            showStatus('Błąd połączenia podczas usuwania FAQ.', 'error');
        }
    };
});
