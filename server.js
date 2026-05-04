const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const sqlite = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const ADMIN_USER = 'pmleczek';
const ADMIN_HASH = process.env.ADMIN_HASH;
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1); // Trust proxy if behind Nginx/Cloudflare for secure cookies
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Static files (frontend)
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/') // Save directly to public dir to overwrite rozklad.png
    },
    filename: function (req, file, cb) {
        cb(null, 'rozklad.png') // Always name it rozklad.png
    }
});
const upload = multer({ storage: storage });

const pdfStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/')
    },
    filename: function (req, file, cb) {
        cb(null, 'regulamin.pdf')
    }
});
const uploadPdf = multer({ storage: pdfStorage });

// Database initialization
let db;
async function initDB() {
    db = await sqlite.open({
        filename: path.join(__dirname, 'data', 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
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
    `);

    // Migrate existing JSON data if SQLite is empty
    const newsCount = await db.get('SELECT COUNT(*) as count FROM news');
    if (newsCount.count === 0 && fs.existsSync(path.join(__dirname, 'data', 'news.json'))) {
        const oldNews = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'news.json'), 'utf8'));
        // Sort ascending by id so the newest gets the highest id and we keep them backwards
        oldNews.sort((a,b) => a.id - b.id);
        for (const n of oldNews) {
            await db.run('INSERT INTO news (id, date, title, content) VALUES (?, ?, ?, ?)', [n.id, n.date, n.title, n.content]);
        }
    }

    const scheduleRow = await db.get('SELECT value FROM config WHERE key = "schedule"');
    if (!scheduleRow && fs.existsSync(path.join(__dirname, 'data', 'schedule.json'))) {
        const oldScheduleStr = fs.readFileSync(path.join(__dirname, 'data', 'schedule.json'), 'utf8');
        await db.run('INSERT INTO config (key, value) VALUES ("schedule", ?)', [oldScheduleStr]);
    }
}
initDB();

// --- AUTH API ---
app.post('/api/login', (req, res) => {
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
app.get('/api/schedule', async (req, res) => {
    try {
        const row = await db.get('SELECT value FROM config WHERE key = "schedule"');
        res.json(row ? JSON.parse(row.value) : {});
    } catch (error) {
        console.error("Błąd bazy danych (schedule):", error);
        res.status(500).json({ error: 'Wystąpił problem wewnętrzny serwera.' });
    }
});

app.get('/api/news', async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM news ORDER BY id DESC');
        res.json(rows);
    } catch (error) {
        console.error("Błąd bazy danych (news):", error);
        res.status(500).json({ error: 'Wystąpił problem wewnętrzny serwera przy pobieraniu aktualności.' });
    }
});

// --- ADMIN API ---

// Update schedule JSON
app.post('/api/admin/schedule', requireAuth, async (req, res) => {
    const newSchedule = req.body;
    
    // Deep validation of schedule format
    const isValidCourses = (courses) => Array.isArray(courses) && courses.every(c => c && typeof c.time === 'string' && Array.isArray(c.notes));
    const isValidVariant = (variant) => variant && isValidCourses(variant.workdays) && isValidCourses(variant.saturday) && isValidCourses(variant.sunday);
    
    if (!newSchedule || !isValidVariant(newSchedule.myslenice) || !isValidVariant(newSchedule.sulkowice)) {
        return res.status(400).json({ error: 'Nieprawidłowy format danych rozkładu.' });
    }
    try {
        await db.run('INSERT INTO config (key, value) VALUES ("schedule", ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [JSON.stringify(newSchedule)]);
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
app.post('/api/admin/news', requireAuth, async (req, res) => {
    const { title, content } = req.body;
    const date = new Date().toISOString().split('T')[0];
    
    try {
        await db.run('INSERT INTO news (date, title, content) VALUES (?, ?, ?)', [date, title, content]);
        const news = await db.all('SELECT * FROM news ORDER BY id DESC');
        res.json({ success: true, message: 'Aktualność dodana.', news });
    } catch (error) {
        console.error("Błąd bazy danych przy dodawaniu newsa:", error);
        res.status(500).json({ error: 'Błąd podczas zapisu nowej aktualności.' });
    }
});

app.delete('/api/admin/news/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await db.run('DELETE FROM news WHERE id = ?', [id]);
        const news = await db.all('SELECT * FROM news ORDER BY id DESC');
        res.json({ success: true, message: 'Aktualność usunięta.', news });
    } catch (error) {
        console.error("Błąd bazy danych przy usuwaniu newsa:", error);
        res.status(500).json({ error: 'Błąd podczas usuwania aktualności z bazy.' });
    }
});

app.put('/api/admin/news/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { title, content } = req.body;
    
    try {
        const result = await db.run('UPDATE news SET title = ?, content = ? WHERE id = ?', [title, content, id]);
        if (result.changes > 0) {
            const news = await db.all('SELECT * FROM news ORDER BY id DESC');
            res.json({ success: true, message: 'Pomyślnie zaktualizowano aktualność.', news });
        } else {
            res.status(404).json({ error: 'Nie znaleziono aktualności.' });
        }
    } catch (error) {
        console.error("Błąd bazy danych przy edycji newsa:", error);
        res.status(500).json({ error: 'Błąd podczas edycji aktualności w bazie.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
