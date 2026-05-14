const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const Database = require('better-sqlite3');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const ADMIN_USER = 'pmleczek';
const ADMIN_HASH = (process.env.ADMIN_HASH_B64
    ? Buffer.from(process.env.ADMIN_HASH_B64, 'base64').toString()
    : process.env.ADMIN_HASH || '').trim();

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for simplicity if it breaks Quill/External assets, or configure properly
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1); // Trust proxy if behind Nginx/Cloudflare for secure cookies
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // process.env.NODE_ENV === 'production', // Temporarily disabled for local HTTP testing
        httpOnly: true, // Prevents JS from accessing the cookie
        sameSite: 'lax', // Protects against CSRF
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Static files (frontend) with caching
const staticOptions = {
    maxAge: '1y',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
};

app.use(express.static('public', staticOptions));
app.use('/uploads', express.static('uploads', staticOptions));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/') // Save directly to public dir to overwrite rozklad.png
    },
    filename: function (req, file, cb) {
        cb(null, 'rozklad.png') // Always name it rozklad.png
    }
});
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "image/png") {
            cb(null, true);
        } else {
            cb(new Error('Tylko pliki PNG są dozwolone!'), false);
        }
    }
});

const pdfStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/')
    },
    filename: function (req, file, cb) {
        cb(null, 'regulamin.pdf')
    }
});
const uploadPdf = multer({
    storage: pdfStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error('Tylko pliki PDF są dozwolone!'), false);
        }
    }
});

// Database initialization
const db = new Database(path.join(dataDir, 'database.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        title TEXT,
        content TEXT
    );
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS stops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pricing (
        stop1_id INTEGER,
        stop2_id INTEGER,
        price_s REAL,
        price_m REAL,
        price_md REAL,
        PRIMARY KEY(stop1_id, stop2_id),
        FOREIGN KEY(stop1_id) REFERENCES stops(id) ON DELETE CASCADE,
        FOREIGN KEY(stop2_id) REFERENCES stops(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS faq (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        answer TEXT,
        sort_order INTEGER DEFAULT 0
    );
`);

// Migration: ensure sort_order column exists in stops
try {
    db.prepare("SELECT sort_order FROM stops LIMIT 1").get();
} catch (e) {
    if (e.message.includes("no such column: sort_order")) {
        db.prepare("ALTER TABLE stops ADD COLUMN sort_order INTEGER DEFAULT 0").run();
        console.log("Dodano brakującą kolumnę 'sort_order' do tabeli 'stops'.");
    }
}

// Migration: Initial FAQ data
const faqCount = db.prepare("SELECT COUNT(*) as count FROM faq").get().count;
if (faqCount === 0) {
    const initialFaqs = [
        ["Gdzie zatrzymują się busy Mleczek Bus w Myślenicach?", "Nasze busy odjeżdżają z głównego dworca autobusowego w Myślenicach oraz zatrzymują się na wyznaczonych przystankach na trasie w kierunku Sułkowic."],
        ["Jakie miejscowości obsługuje Mleczek Bus?", "Obsługujemy regularną linię na trasie: Harbutowice - Sułkowice - Rudnik - Jawornik - Myślenice. Przejeżdżamy również przez Rudnik Dolny (kursy oznaczone RD)."],
        ["Gdzie i kiedy można kupić bilety miesięczne?", "Bilety miesięczne są sprzedawane w wyznaczonych dniach <strong>za dworcem Dekada w Myślenicach</strong>. Dokładna data sprzedaży jest zawsze podawana na naszej stronie oraz w busach z odpowiednim wyprzedzeniem przed końcem każdego miesiąca."],
        ["Czy rozkład jazdy busów jest aktualny?", "Tak, na naszej stronie internetowej zawsze znajdziesz aktualny rozkład jazdy. Najbliższe odjazdy są aktualizowane w czasie rzeczywistym."],
        ["Ile kosztuje bilet na trasie Sułkowice - Myślenice?", "Szczegółowe ceny biletów jednorazowych oraz miesięcznych znajdziesz w zakładce <a href='/cennik.html'>Cennik</a>."]
    ];
    const insertFaq = db.prepare("INSERT INTO faq (question, answer, sort_order) VALUES (?, ?, ?)");
    initialFaqs.forEach((f, index) => insertFaq.run(f[0], f[1], index));
    console.log("Zainicjowano domyślne dane FAQ w bazie.");
}

// Rate limiting for login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login attempts per window
    message: { success: false, message: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' }
});

// --- AUTH API ---
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER && bcrypt.compareSync(password, ADMIN_HASH)) {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Nieprawidłowy login lub hasło.' });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    res.json({ authenticated: !!req.session.isAdmin });
});

// Middleware to protect admin routes
const requireAuth = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Brak uprawnień. Zaloguj się.' });
    }
};

// --- PUBLIC API ---
app.get('/api/schedule', (req, res) => {
    try {
        const row = db.prepare("SELECT value FROM config WHERE key = 'schedule'").get();
        res.json(row ? JSON.parse(row.value) : {});
    } catch (error) {
        console.error("Błąd bazy danych (schedule):", error);
        res.status(500).json({ error: 'Wystąpił problem wewnętrzny serwera.' });
    }
});

app.get('/api/news', (req, res) => {
    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit);

        if (!isNaN(page) && !isNaN(limit)) {
            const offset = (page - 1) * limit;
            const rows = db.prepare('SELECT * FROM news ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
            const totalRow = db.prepare('SELECT COUNT(*) as count FROM news').get();
            res.json({ news: rows, total: totalRow.count });
        } else {
            const rows = db.prepare('SELECT * FROM news ORDER BY id DESC').all();
            res.json(rows);
        }
    } catch (error) {
        console.error("Błąd bazy danych (news):", error);
        res.status(500).json({ error: 'Wystąpił problem wewnętrzny serwera przy pobieraniu aktualności.' });
    }
});

app.get('/api/pricing-data', (req, res) => {
    try {
        const stops = db.prepare('SELECT * FROM stops ORDER BY sort_order ASC, id DESC').all();
        const prices = db.prepare('SELECT * FROM pricing').all();
        res.json({ stops, prices });
    } catch (error) {
        console.error("Błąd bazy danych (pricing-data):", error);
        res.status(500).json({ error: 'Błąd podczas pobierania danych cennika.' });
    }
});

app.get('/api/stops', (req, res) => {
    try {
        const stops = db.prepare('SELECT * FROM stops ORDER BY sort_order ASC, id DESC').all();
        res.json({ stops });
    } catch (error) {
        console.error("Błąd bazy danych (stops):", error);
        res.status(500).json({ error: 'Błąd podczas pobierania przystanków.' });
    }
});

app.get('/api/price', (req, res) => {
    try {
        const { stop1, stop2 } = req.query;
        if (!stop1 || !stop2) return res.status(400).json({ error: 'Brak przystanków' });

        const id1 = Math.min(parseInt(stop1), parseInt(stop2));
        const id2 = Math.max(parseInt(stop1), parseInt(stop2));

        const price = db.prepare('SELECT * FROM pricing WHERE stop1_id = ? AND stop2_id = ?').get(id1, id2);
        res.json(price || null);
    } catch (error) {
        console.error("Błąd bazy danych (price):", error);
        res.status(500).json({ error: 'Błąd podczas pobierania ceny.' });
    }
});

app.get('/api/faq', (req, res) => {
    try {
        const faqs = db.prepare('SELECT * FROM faq ORDER BY sort_order ASC').all();
        res.json(faqs);
    } catch (error) {
        console.error("Błąd bazy danych (faq):", error);
        res.status(500).json({ error: 'Błąd podczas pobierania pytań FAQ.' });
    }
});

// --- ADMIN API ---

// Update schedule JSON
app.post('/api/admin/schedule', requireAuth, (req, res) => {
    const newSchedule = req.body;

    // Deep validation of schedule format
    const isValidCourses = (courses) => Array.isArray(courses) && courses.every(c => c && typeof c.time === 'string' && Array.isArray(c.notes));
    const isValidVariant = (variant) => variant && isValidCourses(variant.workdays) && isValidCourses(variant.saturday) && isValidCourses(variant.sunday);

    if (!newSchedule || !isValidVariant(newSchedule.myslenice) || !isValidVariant(newSchedule.sulkowice)) {
        return res.status(400).json({ error: 'Nieprawidłowy format danych rozkładu.' });
    }
    try {
        db.prepare("INSERT INTO config (key, value) VALUES ('schedule', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(newSchedule));
        res.json({ success: true, message: 'Rozkład został zaktualizowany.' });
    } catch (error) {
        console.error("Błąd bazy danych przy zapisie rozkładu:", error);
        res.status(500).json({ error: 'Błąd podczas zapisu do bazy danych.' });
    }
});

// Upload schedule image
app.post('/api/admin/upload-image', requireAuth, upload.single('rozklad_image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nie wybrano pliku.' });
    }
    // file is saved as public/rozklad.png
    res.json({ success: true, message: 'Plik graficzny rozkładu został zaktualizowany.' });
});

// Upload rules PDF
app.post('/api/admin/upload-regulamin', requireAuth, uploadPdf.single('regulamin_file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nie wybrano pliku regulaminu.' });
    }
    res.json({ success: true, message: 'Plik regulaminu został wgrany i zastąpił poprzedni.' });
});

// Manage news
app.post('/api/admin/news', requireAuth, (req, res) => {
    const { title, content } = req.body;
    const date = new Date().toISOString();

    try {
        db.prepare('INSERT INTO news (date, title, content) VALUES (?, ?, ?)').run(date, title, content);
        const news = db.prepare('SELECT * FROM news ORDER BY id DESC').all();
        res.json({ success: true, message: 'Aktualność dodana.', news });
    } catch (error) {
        console.error("Błąd bazy danych przy dodawaniu newsa:", error);
        res.status(500).json({ error: 'Błąd podczas zapisu nowej aktualności.' });
    }
});

app.delete('/api/admin/news/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    try {
        db.prepare('DELETE FROM news WHERE id = ?').run(id);
        const news = db.prepare('SELECT * FROM news ORDER BY id DESC').all();
        res.json({ success: true, message: 'Aktualność usunięta.', news });
    } catch (error) {
        console.error("Błąd bazy danych przy usuwaniu newsa:", error);
        res.status(500).json({ error: 'Błąd podczas usuwania aktualności z bazy.' });
    }
});

app.put('/api/admin/news/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { title, content } = req.body;

    try {
        const result = db.prepare('UPDATE news SET title = ?, content = ? WHERE id = ?').run(title, content, id);
        if (result.changes > 0) {
            const news = db.prepare('SELECT * FROM news ORDER BY id DESC').all();
            res.json({ success: true, message: 'Pomyślnie zaktualizowano aktualność.', news });
        } else {
            res.status(404).json({ error: 'Nie znaleziono aktualności.' });
        }
    } catch (error) {
        console.error("Błąd bazy danych przy edycji newsa:", error);
        res.status(500).json({ error: 'Błąd podczas edycji aktualności w bazie.' });
    }
});

// --- PRICING ADMIN API ---

app.post('/api/admin/stops', requireAuth, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nazwa przystanku jest wymagana.' });

    try {
        // Nowe przystanki mają domyślnie sort_order = 0, będą na początku przy ORDER BY sort_order ASC, id DESC
        db.prepare('INSERT INTO stops (name) VALUES (?)').run(name);
        const stops = db.prepare('SELECT * FROM stops ORDER BY sort_order ASC, id DESC').all();
        res.json({ success: true, message: 'Przystanek dodany.', stops });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Przystanek o tej nazwie już istnieje.' });
        }
        res.status(500).json({ error: 'Błąd podczas dodawania przystanku.' });
    }
});

app.put('/api/admin/stops/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nazwa przystanku jest wymagana.' });

    try {
        const result = db.prepare('UPDATE stops SET name = ? WHERE id = ?').run(name, id);
        if (result.changes > 0) {
            const stops = db.prepare('SELECT * FROM stops ORDER BY sort_order ASC, id DESC').all();
            res.json({ success: true, message: 'Nazwa przystanku została zaktualizowana.', stops });
        } else {
            res.status(404).json({ error: 'Nie znaleziono przystanku.' });
        }
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Przystanek o tej nazwie już istnieje.' });
        }
        console.error("Błąd edycji przystanku:", error);
        res.status(500).json({ error: 'Błąd podczas edycji przystanku.' });
    }
});

app.post('/api/admin/stops/reorder', requireAuth, (req, res) => {
    const { orders } = req.body; // Array of {id, sort_order}
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'Nieprawidłowe dane.' });

    const updateStmt = db.prepare('UPDATE stops SET sort_order = ? WHERE id = ?');

    try {
        const transaction = db.transaction((data) => {
            for (const item of data) {
                updateStmt.run(item.sort_order, item.id);
            }
        });
        transaction(orders);
        res.json({ success: true, message: 'Kolejność została zapisana.' });
    } catch (error) {
        console.error("Błąd reorderowania:", error);
        res.status(500).json({ error: 'Błąd podczas zapisywania kolejności.' });
    }
});

app.delete('/api/admin/stops/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    try {
        db.prepare('DELETE FROM stops WHERE id = ?').run(id);
        const stops = db.prepare('SELECT * FROM stops ORDER BY sort_order ASC, id DESC').all();
        res.json({ success: true, message: 'Przystanek i powiązane ceny zostały usunięte.', stops });
    } catch (error) {
        res.status(500).json({ error: 'Błąd podczas usuwania przystanku.' });
    }
});

app.post('/api/admin/pricing', requireAuth, (req, res) => {
    const { stop1_id, stop2_id, price_s, price_m, price_md } = req.body;

    // Zawsze zapisuj stop1_id jako mniejszą wartość, aby zapewnić dwukierunkowość relacji
    const id1 = Math.min(stop1_id, stop2_id);
    const id2 = Math.max(stop1_id, stop2_id);

    if (id1 === id2) return res.status(400).json({ error: 'Przystanek początkowy i końcowy muszą być różne.' });

    try {
        db.prepare(`
            INSERT INTO pricing (stop1_id, stop2_id, price_s, price_m, price_md) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(stop1_id, stop2_id) DO UPDATE SET 
                price_s=excluded.price_s, 
                price_m=excluded.price_m, 
                price_md=excluded.price_md
        `).run(id1, id2, price_s, price_m, price_md);

        const prices = db.prepare('SELECT * FROM pricing').all();
        res.json({ success: true, message: 'Cennik zaktualizowany.', prices });
    } catch (error) {
        console.error("Błąd bazy danych (admin-pricing):", error);
        res.status(500).json({ error: 'Błąd podczas zapisywania cennika.' });
    }
});

app.post('/api/admin/pricing/bulk', requireAuth, (req, res) => {
    const { type, amount } = req.body;
    
    if (!['s', 'm', 'md'].includes(type)) {
        return res.status(400).json({ error: 'Nieprawidłowy typ biletu.' });
    }
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount === 0) {
        return res.status(400).json({ error: 'Nieprawidłowa kwota.' });
    }

    try {
        let column;
        if (type === 's') column = 'price_s';
        if (type === 'm') column = 'price_m';
        if (type === 'md') column = 'price_md';

        if (type === 'm') {
            db.prepare(`
                UPDATE pricing 
                SET price_m = MAX(0, price_m + ?),
                    price_md = ROUND(MAX(0, price_m + ?) * 0.51, 2)
                WHERE price_m IS NOT NULL AND price_m > 0
            `).run(parsedAmount, parsedAmount);
        } else {
            db.prepare(`UPDATE pricing SET ${column} = MAX(0, ${column} + ?) WHERE ${column} IS NOT NULL AND ${column} > 0`).run(parsedAmount);
        }

        const prices = db.prepare('SELECT * FROM pricing').all();
        res.json({ success: true, message: `Pomyślnie zaktualizowano ceny (${parsedAmount > 0 ? '+' : ''}${parsedAmount.toFixed(2)} zł).`, prices });
    } catch (error) {
        console.error("Błąd bazy danych (admin-pricing-bulk):", error);
        res.status(500).json({ error: 'Błąd podczas masowej zmiany cen.' });
    }
});

// --- FAQ ADMIN API ---

app.post('/api/admin/faq', requireAuth, (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'Pytanie i odpowiedź są wymagane.' });

    try {
        const maxSort = db.prepare('SELECT MAX(sort_order) as maxSort FROM faq').get().maxSort || 0;
        db.prepare('INSERT INTO faq (question, answer, sort_order) VALUES (?, ?, ?)').run(question, answer, maxSort + 1);
        const faqs = db.prepare('SELECT * FROM faq ORDER BY sort_order ASC').all();
        res.json({ success: true, message: 'Pytanie FAQ dodane.', faqs });
    } catch (error) {
        console.error("Błąd bazy danych (admin-faq):", error);
        res.status(500).json({ error: 'Błąd podczas dodawania pytania FAQ.' });
    }
});

app.put('/api/admin/faq/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'Pytanie i odpowiedź są wymagane.' });

    try {
        const result = db.prepare('UPDATE faq SET question = ?, answer = ? WHERE id = ?').run(question, answer, id);
        if (result.changes > 0) {
            const faqs = db.prepare('SELECT * FROM faq ORDER BY sort_order ASC').all();
            res.json({ success: true, message: 'Pytanie FAQ zaktualizowane.', faqs });
        } else {
            res.status(404).json({ error: 'Nie znaleziono pytania FAQ.' });
        }
    } catch (error) {
        console.error("Błąd bazy danych (admin-faq-edit):", error);
        res.status(500).json({ error: 'Błąd podczas edycji pytania FAQ.' });
    }
});

app.post('/api/admin/faq/reorder', requireAuth, (req, res) => {
    const { orders } = req.body; // Array of {id, sort_order}
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'Nieprawidłowe dane.' });

    const updateStmt = db.prepare('UPDATE faq SET sort_order = ? WHERE id = ?');
    try {
        const transaction = db.transaction((data) => {
            for (const item of data) {
                updateStmt.run(item.sort_order, item.id);
            }
        });
        transaction(orders);
        res.json({ success: true, message: 'Kolejność FAQ została zapisana.' });
    } catch (error) {
        console.error("Błąd reorderowania FAQ:", error);
        res.status(500).json({ error: 'Błąd podczas zapisywania kolejności FAQ.' });
    }
});

app.delete('/api/admin/faq/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    try {
        db.prepare('DELETE FROM faq WHERE id = ?').run(id);
        const faqs = db.prepare('SELECT * FROM faq ORDER BY sort_order ASC').all();
        res.json({ success: true, message: 'Pytanie FAQ usunięte.', faqs });
    } catch (error) {
        console.error("Błąd bazy danych (admin-faq-delete):", error);
        res.status(500).json({ error: 'Błąd podczas usuwania pytania FAQ.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
