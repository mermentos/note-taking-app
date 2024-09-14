const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000; // Use dynamic port for Heroku or fallback for local dev

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set up sessions
app.use(session({
    secret: 'yourSecretKey', // Replace with a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS in production
}));

// Database connection
// Use '/tmp/mydatabase.db' for Heroku's ephemeral file system, otherwise use './mydatabase.db' for local
let db = new sqlite3.Database(process.env.NODE_ENV === 'production' ? '/tmp/mydatabase.db' : './mydatabase.db', (err) => {
    if (err) {
        console.error('Error connecting to SQLite:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Ensure users and notes tables exist
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    note TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
)`);

// Root route (login page)
app.get('/', (req, res) => {
    res.render('index', { loggedInUser: req.session.userId, error: null });
});

// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err) {
            return res.render('index', { loggedInUser: null, error: 'An error occurred during login' });
        }
        if (row) {
            req.session.userId = row.id; // Store user ID in session
            res.redirect('/notes');
        } else {
            res.render('index', { loggedInUser: null, error: 'Invalid username or password' });
        }
    });
});

// Signup route
app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function (err) {
        if (err) {
            return res.render('index', { loggedInUser: null, error: 'An error occurred during signup' });
        }
        req.session.userId = this.lastID; // Store new user ID in session
        res.redirect('/notes');
    });
});

// Notes page - show notes for logged in user only
app.get('/notes', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    db.all(`SELECT * FROM notes WHERE user_id = ?`, [req.session.userId], (err, rows) => {
        if (err) {
            return res.send('Error fetching notes!');
        }
        res.render('notes', { notes: rows });
    });
});

// Add new note
app.post('/add-note', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const { note } = req.body;
    db.run(`INSERT INTO notes (user_id, note) VALUES (?, ?)`, [req.session.userId, note], (err) => {
        if (err) {
            return res.send('Error adding the note!');
        }
        res.redirect('/notes');
    });
});

// Edit note - user can only edit their own notes
app.get('/edit-note/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const noteId = req.params.id;
    db.get(`SELECT * FROM notes WHERE id = ? AND user_id = ?`, [noteId, req.session.userId], (err, row) => {
        if (err || !row) {
            return res.send('Note not found or unauthorized!');
        }
        res.render('edit-note', { note: row });
    });
});

// Save edited note
app.post('/edit-note/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const noteId = req.params.id;
    const { note } = req.body;
    db.run(`UPDATE notes SET note = ? WHERE id = ? AND user_id = ?`, [note, noteId, req.session.userId], (err) => {
        if (err) {
            return res.send('Error updating note!');
        }
        res.redirect('/notes');
    });
});

// Delete note - user can only delete their own notes
app.get('/delete-note/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const noteId = req.params.id;
    db.run(`DELETE FROM notes WHERE id = ? AND user_id = ?`, [noteId, req.session.userId], (err) => {
        if (err) {
            return res.send('Error deleting the note!');
        }
        res.redirect('/notes');
    });
});

// Account settings - only available for logged in users
app.get('/account-settings', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    db.get(`SELECT * FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
        if (err) {
            return res.send('Error fetching account settings!');
        }
        res.render('account-settings', { user: row });
    });
});

// Change username
app.post('/change-username', (req, res) => {
    const { newUsername } = req.body;
    const user_id = req.session.userId;
    db.run(`UPDATE users SET username = ? WHERE id = ?`, [newUsername, user_id], (err) => {
        if (err) {
            return res.send('Error changing username!');
        }
        res.redirect('/account-settings');
    });
});

// Change password
app.post('/change-password', (req, res) => {
    const { newPassword } = req.body;
    const user_id = req.session.userId;
    db.run(`UPDATE users SET password = ? WHERE id = ?`, [newPassword, user_id], (err) => {
        if (err) {
            return res.send('Error changing password!');
        }
        res.redirect('/account-settings');
    });
});

// Delete account - removes the user and all their notes
app.post('/delete-account', (req, res) => {
    const user_id = req.session.userId;
    db.run(`DELETE FROM notes WHERE user_id = ?`, [user_id], (err) => {
        if (err) {
            return res.send('Error deleting notes!');
        }
        db.run(`DELETE FROM users WHERE id = ?`, [user_id], (err) => {
            if (err) {
                return res.send('Error deleting account!');
            }
            req.session.destroy();
            res.redirect('/');
        });
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
