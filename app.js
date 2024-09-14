const express = require('express');
const { Pool } = require('pg'); // Use pg module for PostgreSQL
const path = require('path');
const session = require('express-session');
const app = express();
const port = process.env.PORT || 3000;

// Middleware setup
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session setup
app.use(session({
    secret: 'yourSecretKey', // Replace with a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS in production
}));

// PostgreSQL Pool setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Ensure users table exists
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    );
`, (err) => {
    if (err) {
        console.error('Error creating users table:', err);
    } else {
        console.log('Users table is ready.');
    }
});

// Ensure notes table exists
pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        note TEXT
    );
`, (err) => {
    if (err) {
        console.error('Error creating notes table:', err);
    } else {
        console.log('Notes table is ready.');
    }
});

// Root route (login page)
app.get('/', (req, res) => {
    res.render('index', { loggedInUser: req.session.userId, error: null });
});

// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    pool.query(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username, password], (err, result) => {
        if (err) {
            return res.render('index', { loggedInUser: null, error: 'An error occurred during login' });
        }
        if (result.rows.length > 0) {
            req.session.userId = result.rows[0].id;
            res.redirect('/notes');
        } else {
            res.render('index', { loggedInUser: null, error: 'Invalid username or password' });
        }
    });
});

// Signup route
app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    pool.query(`INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id`, [username, password], (err, result) => {
        if (err) {
            return res.render('index', { loggedInUser: null, error: 'An error occurred during signup' });
        }
        req.session.userId = result.rows[0].id;
        res.redirect('/notes');
    });
});

// Notes page - show notes for logged-in user only
app.get('/notes', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    pool.query(`SELECT * FROM notes WHERE user_id = $1`, [req.session.userId], (err, result) => {
        if (err) {
            return res.send('Error fetching notes!');
        }
        res.render('notes', { notes: result.rows });
    });
});

// Add new note
app.post('/add-note', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const { note } = req.body;
    pool.query(`INSERT INTO notes (user_id, note) VALUES ($1, $2)`, [req.session.userId, note], (err) => {
        if (err) {
            return res.send('Error adding the note!');
        }
        res.redirect('/notes');
    });
});

// Edit note
app.get('/edit-note/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const noteId = req.params.id;
    pool.query(`SELECT * FROM notes WHERE id = $1 AND user_id = $2`, [noteId, req.session.userId], (err, result) => {
        if (err || result.rows.length === 0) {
            return res.send('Note not found or unauthorized!');
        }
        res.render('edit-note', { note: result.rows[0] });
    });
});

// Save edited note
app.post('/edit-note/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const noteId = req.params.id;
    const { note } = req.body;
    pool.query(`UPDATE notes SET note = $1 WHERE id = $2 AND user_id = $3`, [note, noteId, req.session.userId], (err) => {
        if (err) {
            return res.send('Error updating note!');
        }
        res.redirect('/notes');
    });
});

// Delete note
app.get('/delete-note/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const noteId = req.params.id;
    pool.query(`DELETE FROM notes WHERE id = $1 AND user_id = $2`, [noteId, req.session.userId], (err) => {
        if (err) {
            return res.send('Error deleting the note!');
        }
        res.redirect('/notes');
    });
});

// Account settings
app.get('/account-settings', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    pool.query(`SELECT * FROM users WHERE id = $1`, [req.session.userId], (err, result) => {
        if (err) {
            return res.send('Error fetching account settings!');
        }
        res.render('account-settings', { user: result.rows[0] });
    });
});

// Change username
app.post('/change-username', (req, res) => {
    const { newUsername } = req.body;
    const userId = req.session.userId;
    pool.query(`UPDATE users SET username = $1 WHERE id = $2`, [newUsername, userId], (err) => {
        if (err) {
            return res.send('Error changing username!');
        }
        res.redirect('/account-settings');
    });
});

// Change password
app.post('/change-password', (req, res) => {
    const { newPassword } = req.body;
    const userId = req.session.userId;
    pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [newPassword, userId], (err) => {
        if (err) {
            return res.send('Error changing password!');
        }
        res.redirect('/account-settings');
    });
});

// Delete account
app.post('/delete-account', (req, res) => {
    const userId = req.session.userId;
    pool.query(`DELETE FROM users WHERE id = $1`, [userId], (err) => {
        if (err) {
            return res.send('Error deleting account!');
        }
        req.session.destroy();
        res.redirect('/');
    });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
