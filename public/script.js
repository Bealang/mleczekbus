// Legend descriptions
const noteDescriptions = {
    "H": "do/z Harbutowic",
    "RD": "przez Rudnik Dolny",
    "S": "kurs szkolny",
    "D": "szczegóły na rozkładzie"
};

let currentScheduleData = null;
let allStopsClient = [];
let allPricesClient = [];

// LocalStorage Cache Helper
async function fetchWithCache(url, cacheKey, ttlMs) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < ttlMs) {
                return parsed.data;
            }
        } catch(e) {}
    }
    const response = await fetch(url);
    const data = await response.json();
    localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: data
    }));
    return data;
}

// Helper: current day type
function getDayType(date) {
    const day = date.getDay();
    if (day === 0) return 'sunday';
    if (day === 6) return 'saturday';
    return 'workdays';
}

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function formatNotes(notesArray) {
    if (!notesArray || notesArray.length === 0) return "kurs zwykły";
    
    return notesArray.map(n => {
        let span = `<span class="note-badge">${n}</span>`;
        if (noteDescriptions[n]) {
            span += ` <span style="font-size: 0.85em;">(${noteDescriptions[n]})</span>`;
        }
        return span;
    }).join(", ");
}

function getDayName(date) {
    const days = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
    return days[date.getDay()];
}

function getNextDepartures(citySchedule, currentDate) {
    if(!citySchedule) return null;
    let checkDate = new Date(currentDate);
    let currentMins = timeToMinutes(
        checkDate.getHours().toString().padStart(2, '0') + ':' + 
        checkDate.getMinutes().toString().padStart(2, '0')
    );

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        let dayType = getDayType(checkDate);
        let scheduleForDay = citySchedule[dayType];
        
        if (scheduleForDay && scheduleForDay.length > 0) {
            for (let i = 0; i < scheduleForDay.length; i++) {
                let departure = scheduleForDay[i];
                let departureMins = timeToMinutes(departure.time);
                
                if (dayOffset > 0 || departureMins >= currentMins) {
                    let nextFollowing = null;
                    if (i + 1 < scheduleForDay.length) {
                        nextFollowing = scheduleForDay[i + 1];
                    } else {
                        let nextDayDate = new Date(checkDate);
                        for(let nextOffset=1; nextOffset<7; nextOffset++) {
                             nextDayDate.setDate(nextDayDate.getDate() + 1);
                             let nextDayType = getDayType(nextDayDate);
                             if (citySchedule[nextDayType] && citySchedule[nextDayType].length > 0) {
                                 nextFollowing = citySchedule[nextDayType][0];
                                 break;
                             }
                        }
                    }

                    return {
                        next: departure,
                        following: nextFollowing,
                        isToday: dayOffset === 0,
                        dayName: getDayName(checkDate)
                    };
                }
            }
        }
        checkDate.setDate(checkDate.getDate() + 1);
        currentMins = 0; 
    }
    return null;
}

function updateDisplays() {
    if (!currentScheduleData) return;
    
    const now = new Date();
    
    // Myślenice Update
    const mysleniceDeps = getNextDepartures(currentScheduleData.myslenice, now);
    if (mysleniceDeps) {
        document.getElementById('next-myslenice-time').textContent = mysleniceDeps.next.time;
        document.getElementById('next-myslenice-notes').innerHTML = formatNotes(mysleniceDeps.next.notes);
        
        let subText = "Następny: " + (mysleniceDeps.following ? mysleniceDeps.following.time : "--:--");
        if (!mysleniceDeps.isToday) {
            subText = `Najbliższy kurs: ${mysleniceDeps.dayName}`;
        }
        document.getElementById('following-myslenice-info').textContent = subText;
    } else {
        document.getElementById('next-myslenice-time').textContent = "--:--";
        document.getElementById('next-myslenice-notes').textContent = "Brak kursów";
    }

    // Sułkowice Update
    const sulkowiceDeps = getNextDepartures(currentScheduleData.sulkowice, now);
    if (sulkowiceDeps) {
        document.getElementById('next-sulkowice-time').textContent = sulkowiceDeps.next.time;
        document.getElementById('next-sulkowice-notes').innerHTML = formatNotes(sulkowiceDeps.next.notes);
        
        let subText = "Następny: " + (sulkowiceDeps.following ? sulkowiceDeps.following.time : "--:--");
        if (!sulkowiceDeps.isToday) {
            subText = `Najbliższy kurs: ${sulkowiceDeps.dayName}`;
        }
        document.getElementById('following-sulkowice-info').textContent = subText;
    } else {
        document.getElementById('next-sulkowice-time').textContent = "--:--";
        document.getElementById('next-sulkowice-notes').textContent = "Brak kursów";
    }
}

async function fetchSchedule() {
    try {
        const data = await fetchWithCache('/api/schedule', 'mleczek_schedule', 3600000);
        currentScheduleData = data;
        requestAnimationFrame(updateDisplays);
    } catch (error) {
        console.error("Error fetching schedule:", error);
        document.getElementById('next-myslenice-notes').textContent = "Błąd pobierania danych";
        document.getElementById('next-sulkowice-notes').textContent = "Błąd pobierania danych";
    }
}

let totalNewsCount = 0;
let currentPage = 1;
const newsPerPage = 3; // Number of news per page

async function fetchNews() {
    try {
        const params = new URLSearchParams(window.location.search);
        const pageFromUrl = parseInt(params.get('p')) || 1;
        
        await window.renderNewsPage(pageFromUrl, true);
    } catch (error) {
        console.error("Error fetching news:", error);
    }
}

window.renderNewsPage = async (page, isInitial = false) => {
    try {
        const response = await fetch(`/api/news?page=${page}&limit=${newsPerPage}`);
        const data = await response.json();
        const visibleNews = data.news;
        totalNewsCount = data.total;

        const totalPages = Math.ceil(totalNewsCount / newsPerPage);
        if (page < 1) page = 1;
        if (page > totalPages && totalPages > 0) page = totalPages;

        currentPage = page;
        const container = document.getElementById('news-container');
        
        if (totalNewsCount === 0) {
            container.innerHTML = '<p class="text-center">Obecnie brak nowych komunikatów.</p>';
            renderPaginationControls();
            return;
        }

        container.innerHTML = visibleNews.map(item => {
            let dateObj = new Date(item.date);
            if (!item.date.includes('T') && item.id > 10000) {
                let idDate = new Date(item.id);
                if (!isNaN(idDate.getTime())) {
                    if (idDate.getFullYear() === dateObj.getFullYear() && 
                        idDate.getMonth() === dateObj.getMonth() && 
                        idDate.getDate() === dateObj.getDate()) {
                        dateObj = idDate;
                    }
                }
            }
            
            const dateStr = dateObj.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

            return `
            <div class="news-item reveal reveal-up">
                <h3 class="news-title">${escapeHTML(item.title)}</h3>
                <div class="news-meta">
                    <span class="news-date">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        ${dateStr}
                    </span>
                </div>
                <div class="news-content-text">${item.content}</div>
            </div>
            `;
        }).join('');

        renderPaginationControls();
        if (window.observeNewElements) window.observeNewElements();
        
        // Update URL without reload
        if (!isInitial) {
            const url = new URL(window.location.href);
            if (page === 1) {
                url.searchParams.delete('p');
            } else {
                url.searchParams.set('p', page);
            }
            url.hash = 'aktualnosci';
            window.history.pushState({}, '', url.toString());

            // Smooth scroll to news section top
            const newsSection = document.getElementById('aktualnosci');
            if (newsSection) {
                const navHeight = 100; // Navbar height + buffer
                const targetPosition = newsSection.getBoundingClientRect().top + window.pageYOffset - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        }
    } catch (error) {
        console.error("Error fetching news page:", error);
    }
}

function renderPaginationControls() {
    const totalPages = Math.ceil(totalNewsCount / newsPerPage);
    let paginationContainer = document.getElementById('news-pagination');
    
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'news-pagination';
        paginationContainer.className = 'pagination-container';
        document.getElementById('news-container').after(paginationContainer);
    }

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let html = `
        <div class="pagination-controls">
            <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.renderNewsPage(${currentPage - 1})" aria-label="Poprzednia strona">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
    `;

    // Page numbers with stable range logic
    const range = 1; 
    for (let i = 1; i <= totalPages; i++) {
        // Show first, last, and range around current
        if (i === 1 || i === totalPages || (i >= currentPage - range && i <= currentPage + range)) {
            html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="window.renderNewsPage(${i})">${i}</button>`;
        } 
        // Show ellipsis if there is a gap of more than 1
        else if (i === currentPage - range - 1 || i === currentPage + range + 1) {
            // If the gap is exactly 1 page (e.g. 1 ... 3), we could just show the page, 
            // but the current range logic with i === 1 and range=1 handles most cases.
            html += `<span class="pagination-ellipsis">...</span>`;
        }
    }

    html += `
            <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.renderNewsPage(${currentPage + 1})" aria-label="Następna strona">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
    `;

    paginationContainer.innerHTML = html;
}

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const page = parseInt(params.get('p')) || 1;
    window.renderNewsPage(page, true);
});


document.addEventListener('DOMContentLoaded', () => {
    // Current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // Fetch dynamic content
    fetchSchedule();
    fetchNews();
    
    // Lazy Load Pricing
    const pricingSection = document.querySelector('.pricing-section') || document.getElementById('items-from');
    if (pricingSection) {
        const pObs = new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
                fetchPricingData();
                obs.disconnect();
            }
        }, { rootMargin: '200px' });
        pObs.observe(pricingSection);
    }

    // Lazy Load FAQ
    const faqSection = document.querySelector('.faq-section');
    if (faqSection) {
        const fObs = new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
                fetchFaqs();
                obs.disconnect();
            }
        }, { rootMargin: '200px' });
        fObs.observe(faqSection);
    }

    // Update time displays every minute
    setInterval(() => {
        requestAnimationFrame(updateDisplays);
    }, 60000);

    // Navigation & Hamburger logic
    const hamburger = document.getElementById('hamburger-btn');
    const navLinks = document.getElementById('nav-links');

    if(hamburger) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
            const navbar = document.querySelector('.navbar');
            if (navbar) navbar.classList.toggle('menu-open');
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
                const navbar = document.querySelector('.navbar');
                if (navbar) navbar.classList.remove('menu-open');
            });
        });
    }

    // Universal Smooth Scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const navHeight = 100;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Modal logic
    const modal = document.getElementById('schedule-modal');
    const btnShowModal = document.getElementById('btn-show-modal');
    const btnCloseModal = document.getElementById('modal-close');

    if (btnShowModal && modal && btnCloseModal) {
        btnShowModal.addEventListener('click', () => {
            const modalImg = modal.querySelector('.modal-image');
            if (modalImg) {
                // Cache busting: append timestamp
                modalImg.src = 'rozklad.png?v=' + new Date().getTime();
            }
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // prevent scrolling
        });

        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
        };

        btnCloseModal.addEventListener('click', closeModal);
        
        // Close modal when clicking outside content
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Close string ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeModal();
            }
        });
    }

    // Pricing Calculator Logic
    const calcFrom = document.getElementById('calc-from');
    const calcTo = document.getElementById('calc-to');
    const calcResults = document.getElementById('calc-results');
    const calcWarning = document.getElementById('calc-warning');
    const priceSingle = document.getElementById('price-single');
    const priceMonthly = document.getElementById('price-monthly');

    // --- Custom Select Dropdown UI Logic ---
    const customSelects = document.querySelectorAll('.custom-select');
    customSelects.forEach(selectContainer => {
        const selectedDiv = selectContainer.querySelector('.select-selected');
        const itemsContainer = selectContainer.querySelector('.select-items');
        const items = itemsContainer.querySelectorAll('div');
        const targetInput = document.getElementById(selectContainer.dataset.target);

        // Click on the box opens/closes dropdown
        selectedDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            closeAllSelect(this);
            const itemsDiv = this.nextElementSibling;
            itemsDiv.classList.toggle('select-hide');
            this.classList.toggle('select-arrow-active');
            
            // Focus search if opening
            if (!itemsDiv.classList.contains('select-hide')) {
                const searchInput = itemsDiv.querySelector('.select-search');
                if (searchInput) searchInput.focus();
            }
        });
    });

    function closeAllSelect(exceptEl) {
        const selects = document.querySelectorAll('.select-selected');
        const items = document.querySelectorAll('.select-items');
        selects.forEach((s, idx) => {
            if (s !== exceptEl) {
                s.classList.remove('select-arrow-active');
                items[idx].classList.add('select-hide');
            }
        });
    }

    document.addEventListener('click', closeAllSelect);
    // ----------------------------------------

    async function fetchPricingData() {
        try {
            const data = await fetchWithCache('/api/stops', 'mleczek_stops', 3600000);
            allStopsClient = data.stops;
            populateCalculatorStops();
        } catch (e) {
            console.error("Failed to load pricing data", e);
        }
    }

    function populateCalculatorStops() {
        const fromContainer = document.getElementById('items-from');
        const toContainer = document.getElementById('items-to');
        if (!fromContainer || !toContainer) return;

        [fromContainer, toContainer].forEach(container => {
            container.innerHTML = `
                <div class="select-search-container">
                    <input type="text" class="select-search" placeholder="Wyszukaj przystanek...">
                </div>
                <div class="select-items-list"></div>
            `;
            
            const searchInput = container.querySelector('.select-search');
            const listContainer = container.querySelector('.select-items-list');

            // Prevent closing when clicking search
            searchInput.addEventListener('click', (e) => e.stopPropagation());
            
            // Search logic
            searchInput.addEventListener('input', function() {
                const filter = this.value.toLowerCase();
                const items = listContainer.querySelectorAll('.stop-option');
                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(filter) ? '' : 'none';
                });
            });

            allStopsClient.forEach(stop => {
                const div = document.createElement('div');
                div.className = 'stop-option';
                div.dataset.value = stop.id;
                div.textContent = stop.name;
                div.addEventListener('click', function() {
                    const selectContainer = this.closest('.custom-select');
                    const selectedDiv = selectContainer.querySelector('.select-selected');
                    const targetInput = document.getElementById(selectContainer.dataset.target);
                    
                    selectedDiv.innerHTML = this.innerHTML;
                    targetInput.value = this.dataset.value;
                    targetInput.dispatchEvent(new Event('change'));
                    
                    // Close the dropdown after selection
                    const itemsDiv = selectContainer.querySelector('.select-items');
                    itemsDiv.classList.add('select-hide');
                    selectedDiv.classList.remove('select-arrow-active');
                    
                    // Reset search
                    searchInput.value = '';
                    listContainer.querySelectorAll('.stop-option').forEach(opt => opt.style.display = '');
                });
                listContainer.appendChild(div);
            });
        });
    }

    let lastFetchedPrice = null;
    let currentPriceType = localStorage.getItem('mleczek_price_type') || 'normal';

    const priceToggleWrap = document.getElementById('price-toggle-wrap');
    const toggleNormal = document.getElementById('toggle-normal');
    const toggleReduced = document.getElementById('toggle-reduced');
    const monthlyLabel = document.getElementById('monthly-label');
    const priceToggle = document.querySelector('.price-toggle');

    const priceInfoNotes = document.getElementById('price-info-notes');
    const noteReduced = document.getElementById('note-reduced');

    function updatePriceDisplay() {
        if (!lastFetchedPrice) return;

        // Single price is always the same
        priceSingle.textContent = lastFetchedPrice.price_s.toFixed(2).replace('.', ',') + ' zł';

        if (currentPriceType === 'reduced') {
            priceMonthly.textContent = (lastFetchedPrice.price_md || 0).toFixed(2).replace('.', ',') + ' zł';
            monthlyLabel.textContent = "Miesięczny Ulgowy";
            if (toggleNormal) toggleNormal.classList.remove('active');
            if (toggleReduced) toggleReduced.classList.add('active');
            if (priceToggle) priceToggle.setAttribute('data-active', 'reduced');
            if (noteReduced) noteReduced.classList.remove('hidden');
        } else {
            priceMonthly.textContent = (lastFetchedPrice.price_m || 0).toFixed(2).replace('.', ',') + ' zł';
            monthlyLabel.textContent = "Miesięczny Normalny";
            if (toggleNormal) toggleNormal.classList.add('active');
            if (toggleReduced) toggleReduced.classList.remove('active');
            if (priceToggle) priceToggle.setAttribute('data-active', 'normal');
            if (noteReduced) noteReduced.classList.add('hidden');
        }
    }

    [toggleNormal, toggleReduced].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            currentPriceType = btn.id === 'toggle-normal' ? 'normal' : 'reduced';
            localStorage.setItem('mleczek_price_type', currentPriceType);
            updatePriceDisplay();
        });
    });

    async function calculatePrice() {
        if (!calcFrom.value || !calcTo.value) return;

        if (calcFrom.value === calcTo.value) {
            if (calcResults) calcResults.classList.add('hidden');
            if (priceToggleWrap) priceToggleWrap.classList.add('hidden');
            if (priceInfoNotes) priceInfoNotes.classList.add('hidden');
            calcWarning.textContent = "Wybierz różne przystanki.";
            calcWarning.classList.remove('hidden');
            return;
        }

        const id1 = parseInt(calcFrom.value);
        const id2 = parseInt(calcTo.value);

        try {
            const res = await fetch(`/api/price?stop1=${id1}&stop2=${id2}`);
            const price = await res.json();

            if (price) {
                lastFetchedPrice = price;
                updatePriceDisplay();
                
                calcWarning.classList.add('hidden');
                if (priceToggleWrap) priceToggleWrap.classList.remove('hidden');
                if (calcResults) calcResults.classList.remove('hidden');
                if (priceInfoNotes) priceInfoNotes.classList.remove('hidden');
                
                // Re-trigger reveal animations for new elements
                if (window.observeNewElements) window.observeNewElements();
            } else {
                lastFetchedPrice = null;
                if (calcResults) calcResults.classList.add('hidden');
                if (priceToggleWrap) priceToggleWrap.classList.add('hidden');
                if (priceInfoNotes) priceInfoNotes.classList.add('hidden');
                calcWarning.innerHTML = "Ta relacja nie została uzupełniona. Skontaktuj się z nami <a href='/kontakt.html' style='color: inherit; text-decoration: underline;'>tutaj</a>.";
                calcWarning.classList.remove('hidden');
            }
        } catch (e) {
            console.error("Failed to fetch price", e);
        }
    }

    if (calcFrom && calcTo) {
        calcFrom.addEventListener('change', calculatePrice);
        calcTo.addEventListener('change', calculatePrice);
    }

    // Navbar Scroll Logic
    const mainNav = document.getElementById('main-nav');
    if (mainNav && mainNav.classList.contains('navbar-home')) {
        let lastKnownScrollPosition = 0;
        let ticking = false;

        window.addEventListener('scroll', () => {
            lastKnownScrollPosition = window.scrollY;

            if (!ticking) {
                window.requestAnimationFrame(() => {
                    if (lastKnownScrollPosition > 150) {
                        mainNav.classList.add('navbar-scrolled');
                        mainNav.classList.remove('navbar-home');
                    } else {
                        mainNav.classList.add('navbar-home');
                        mainNav.classList.remove('navbar-scrolled');
                    }
                    ticking = false;
                });

                ticking = true;
            }
        });
    }

    // FAQ Accordion Logic (Single Open)
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        item.addEventListener('toggle', (e) => {
            if (item.open) {
                faqItems.forEach(otherItem => {
                    if (otherItem !== item && otherItem.open) {
                        otherItem.open = false;
                    }
                });
            }
        });
    });

    async function fetchFaqs() {
        try {
            const data = await fetchWithCache('/api/faq', 'mleczek_faq', 86400000);
            renderFaqs(data);
        } catch (e) {
            console.error("Error fetching FAQs:", e);
            const container = document.getElementById('faq-dynamic-container');
            if (container) container.innerHTML = '<p class="text-center">Błąd ładowania pytań.</p>';
        }
    }

    function renderFaqs(faqs) {
        const container = document.getElementById('faq-dynamic-container');
        if (!container) return;

        if (faqs.length === 0) {
            container.innerHTML = '<p class="text-center">Brak pytań FAQ.</p>';
            return;
        }

        container.innerHTML = faqs.map((faq, index) => `
            <details class="faq-item reveal reveal-up" style="transition-delay: ${index * 0.1}s">
                <summary>
                    <h3>${escapeHTML(faq.question)}</h3>
                    <div class="faq-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </summary>
                <div class="faq-content">
                    <p>${faq.answer}</p>
                </div>
            </details>
        `).join('');

        if (window.observeNewElements) window.observeNewElements();

        // Smooth Accordion Animation Logic
        const faqItems = container.querySelectorAll('.faq-item');
        faqItems.forEach(el => {
            const summary = el.querySelector('summary');
            const content = el.querySelector('.faq-content');

            summary.addEventListener('click', (e) => {
                e.preventDefault();
                if (el.open) {
                    closeItem(el, content);
                } else {
                    // Close others
                    faqItems.forEach(item => {
                        if (item.open && item !== el) {
                            closeItem(item, item.querySelector('.faq-content'));
                        }
                    });
                    openItem(el, content);
                }
            });
        });

        function openItem(el, content) {
            const startHeight = el.offsetHeight;
            el.open = true;
            const contentHeight = content.offsetHeight;
            const endHeight = startHeight + contentHeight;

            el.style.height = startHeight + 'px';
            
            requestAnimationFrame(() => {
                el.animate([
                    { height: startHeight + 'px' },
                    { height: endHeight + 'px' }
                ], {
                    duration: 300,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
                }).onfinish = () => el.style.height = 'auto';
            });
        }

        function closeItem(el, content) {
            const startHeight = el.offsetHeight;
            const contentHeight = content.offsetHeight;
            const endHeight = startHeight - contentHeight;

            el.style.height = startHeight + 'px';

            requestAnimationFrame(() => {
                const anim = el.animate([
                    { height: startHeight + 'px' },
                    { height: endHeight + 'px' }
                ], {
                    duration: 300,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
                });

                anim.onfinish = () => {
                    el.open = false;
                    el.style.height = 'auto';
                };
            });
        }
    }

    // --- Animation Logic ---

    // Intersection Observer for Reveal Animations
    const revealCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal-visible');
            }
        });
    };

    const revealObserver = new IntersectionObserver(revealCallback, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    window.observeNewElements = () => {
        const revealElements = document.querySelectorAll('.reveal:not(.reveal-visible)');
        revealElements.forEach(el => revealObserver.observe(el));
    };

    // Initial run
    window.observeNewElements();
});

// --- Cookie Banner Logic ---
function initCookieBanner() {
    if (localStorage.getItem('cookies-accepted')) return;

    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.id = 'cookie-banner';
    banner.innerHTML = `
        <h4>Pliki cookies</h4>
        <p>Nasza witryna korzysta z plików cookies w celu poprawy jakości obsługi oraz do celów analitycznych (Google Analytics). Szczegóły znajdziesz w naszej <a href="/prywatnosc.html">Polityce Prywatności</a>.</p>
        <div class="cookie-btns">
            <button class="btn-accept" id="cookie-accept">Ok, Akceptuję</button>
        </div>
    `;
    document.body.appendChild(banner);

    // Trigger animation
    setTimeout(() => {
        banner.classList.add('active');
    }, 1000);

    document.getElementById('cookie-accept').addEventListener('click', () => {
        localStorage.setItem('cookies-accepted', 'true');
        banner.classList.remove('active');
        setTimeout(() => banner.remove(), 500);
    });
}

// Start cookie logic when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCookieBanner);
} else {
    initCookieBanner();
}
