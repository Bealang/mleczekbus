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
        const response = await fetch('/api/schedule');
        const data = await response.json();
        currentScheduleData = data;
        updateDisplays();
    } catch (error) {
        console.error("Error fetching schedule:", error);
        document.getElementById('next-myslenice-notes').textContent = "Błąd pobierania danych";
        document.getElementById('next-sulkowice-notes').textContent = "Błąd pobierania danych";
    }
}

let allNewsClient = [];
let currentNewsIndex = 2; // initial limit

async function fetchNews() {
    try {
        const response = await fetch('/api/news');
        allNewsClient = await response.json();
        const container = document.getElementById('news-container');
        
        if (allNewsClient.length === 0) {
            container.innerHTML = '<p class="text-center">Obecnie brak nowych komunikatów.</p>';
            return;
        }

        renderNewsClient(container);
    } catch (error) {
        console.error("Error fetching news:", error);
    }
}

function renderNewsClient(container) {
    const visibleNews = allNewsClient.slice(0, currentNewsIndex);
    
    // Check if the Zobacz więcej button already exists to prevent duplication
    let loadMoreBtn = document.getElementById('load-more-news-btn');
    if (loadMoreBtn) {
        loadMoreBtn.remove();
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
        <div class="news-item">
            <h3 class="news-title">${item.title}</h3>
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

    // Append load more button if there's more to show
    if (currentNewsIndex < allNewsClient.length) {
        loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-news-btn';
        loadMoreBtn.className = 'btn-primary';
        loadMoreBtn.style.display = 'block';
        loadMoreBtn.style.margin = '30px auto 0';
        loadMoreBtn.style.padding = '12px 30px';
        loadMoreBtn.textContent = 'Pokaż wcześniejsze';
        
        loadMoreBtn.addEventListener('click', () => {
            currentNewsIndex += 3;
            renderNewsClient(container);
        });

        container.after(loadMoreBtn);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // Fetch dynamic content
    fetchSchedule();
    fetchNews();
    if (document.getElementById('items-from')) {
        fetchPricingData();
    }

    // Update time displays every minute
    setInterval(updateDisplays, 60000);

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
            const res = await fetch('/api/pricing-data');
            const data = await res.json();
            allStopsClient = data.stops;
            allPricesClient = data.prices;
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

    function calculatePrice() {
        if (!calcFrom.value || !calcTo.value) return;

        if (calcFrom.value === calcTo.value) {
            calcResults.classList.add('hidden');
            calcWarning.textContent = "Wybierz różne przystanki.";
            calcWarning.classList.remove('hidden');
            return;
        }

        const id1 = parseInt(calcFrom.value);
        const id2 = parseInt(calcTo.value);
        const stop1 = Math.min(id1, id2);
        const stop2 = Math.max(id1, id2);

        const price = allPricesClient.find(p => p.stop1_id === stop1 && p.stop2_id === stop2);

        if (price) {
            priceSingle.textContent = price.price_s.toFixed(2).replace('.', ',') + ' zł';
            priceMonthly.textContent = (price.price_m || 0).toFixed(2).replace('.', ',') + ' zł';
            
            const discountSpan = document.getElementById('price-monthly-discount');
            if (discountSpan) {
                discountSpan.textContent = (price.price_md || 0).toFixed(2).replace('.', ',') + ' zł';
            }
            
            calcWarning.classList.add('hidden');
            calcResults.classList.remove('hidden');
        } else {
            calcResults.classList.add('hidden');
            calcWarning.innerHTML = "Ta relacja nie została uzupełniona. Skontaktuj się z nami <a href='/kontakt.html' style='color: inherit; text-decoration: underline;'>tutaj</a>.";
            calcWarning.classList.remove('hidden');
        }
    }

    if (calcFrom && calcTo) {
        calcFrom.addEventListener('change', calculatePrice);
        calcTo.addEventListener('change', calculatePrice);
    }

    // Navbar Scroll Logic
    const mainNav = document.getElementById('main-nav');
    if (mainNav && mainNav.classList.contains('navbar-home')) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 150) {
                mainNav.classList.add('navbar-scrolled');
                mainNav.classList.remove('navbar-home');
            } else {
                mainNav.classList.add('navbar-home');
                mainNav.classList.remove('navbar-scrolled');
            }
        });
    }
});
