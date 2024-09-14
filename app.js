const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;  // Use Heroku's PORT or fallback to 3000 for local development

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let db = new sqlite3.Database('./mydatabase.db', (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

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

let loggedInUser = null;

app.get('/', (req, res) => {
    const showSignup = req.query.signup === 'true';
    res.render('index', { loggedInUser, error: null, loginFailed: false, showSignup });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err) {
            console.error("Error during login:", err.message);
            return res.render('index', { loggedInUser: null, error: 'An error occurred during login', loginFailed: true, showSignup: false });
        }
        if (row) {
            loggedInUser = row;
            res.redirect('/notes');
        } else {
            res.render('index', { loggedInUser: null, error: 'Invalid username or password', loginFailed: true, showSignup: false });
        }
    });
});

app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function (err) {
        if (err) {
            console.error("Error during signup:", err.message);
            return res.render('index', { loggedInUser: null, error: 'An error occurred during signup', loginFailed: false, showSignup: true });
        }
        db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (err, row) => {
            if (err) {
                console.error("Error during auto login:", err.message);
                return res.render('index', { loggedInUser: null, error: 'An error occurred during auto login', loginFailed: false, showSignup: true });
            }
            loggedInUser = row;
            res.redirect('/notes');
        });
    });
});

app.get('/logout', (req, res) => {
    loggedInUser = null;
    res.redirect('/');
});

app.get('/notes', (req, res) => {
    if (!loggedInUser) {
        return res.redirect('/');
    }
    db.all(`SELECT * FROM notes WHERE user_id = ?`, [loggedInUser.id], (err, rows) => { 
        if (err) {
            console.error("Error fetching notes from database:", err.message);
            return res.send('Error fetching notes!');
        }
        res.render('notes', { notes: rows, username: loggedInUser.username });
    });
});

app.post('/add-note', (req, res) => {
    if (!loggedInUser) {
        return res.redirect('/');
    }
    const { note } = req.body;
    db.run(`INSERT INTO notes (user_id, note) VALUES (?, ?)`, [loggedInUser.id, note], (err) => {
        if (err) {
            console.error("Error adding the note:", err.message);
            return res.send('Error adding the note!');
        }
        res.redirect('/notes');
    });
});

// GET route for editing a note
app.get('/edit-note/:id', (req, res) => {
    const noteId = req.params.id;
    db.get(`SELECT * FROM notes WHERE id = ? AND user_id = ?`, [noteId, loggedInUser.id], (err, row) => {
        if (err || !row) {
            console.error("Error fetching note for editing:", err ? err.message : 'No such note found');
            return res.send('Error fetching note!');
        }
        res.render('edit-note', { note: row });
    });
});

// POST route for saving the edited note
app.post('/edit-note/:id', (req, res) => {
    const noteId = req.params.id;
    const { note } = req.body;
    db.run(`UPDATE notes SET note = ? WHERE id = ? AND user_id = ?`, [note, noteId, loggedInUser.id], (err) => {
        if (err) {
            console.error("Error updating the note:", err.message);
            return res.send('Error updating the note!');
        }
        res.redirect('/notes');
    });
});

// GET route for deleting a note
app.get('/delete-note/:id', (req, res) => {
    const noteId = req.params.id;
    db.run(`DELETE FROM notes WHERE id = ? AND user_id = ?`, [noteId, loggedInUser.id], (err) => {
        if (err) {
            console.error("Error deleting note:", err.message);
            return res.send('Error deleting note!');
        }
        res.redirect('/notes');
    });
});

// GET route for account settings
app.get('/account-settings', (req, res) => {
    if (!loggedInUser) {
        return res.redirect('/');
    }
    res.render('account-settings', { user: loggedInUser });
});

// POST route for changing the username
app.post('/change-username', (req, res) => {
    const { newUsername } = req.body;
    const userId = loggedInUser.id;
    db.run(`UPDATE users SET username = ? WHERE id = ?`, [newUsername, userId], (err) => {
        if (err) {
            console.error("Error changing username:", err.message);
            return res.send('Error changing username!');
        }
        loggedInUser.username = newUsername;
        res.redirect('/account-settings');
    });
});

// POST route for changing the password
app.post('/change-password', (req, res) => {
    const { newPassword } = req.body;
    const userId = loggedInUser.id;
    db.run(`UPDATE users SET password = ? WHERE id = ?`, [newPassword, userId], (err) => {
        if (err) {
            console.error("Error changing password:", err.message);
            return res.send('Error changing password!');
        }
        res.redirect('/account-settings');
    });
});

// POST route for deleting the account
app.post('/delete-account', (req, res) => {
    const userId = loggedInUser.id;
    db.run(`DELETE FROM notes WHERE user_id = ?`, [userId], (err) => {
        if (err) {
            console.error("Error deleting notes:", err.message);
            return res.send('Error deleting notes!');
        }
        db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
            if (err) {
                console.error("Error deleting account:", err.message);
                return res.send('Error deleting account!');
            }
            loggedInUser = null;
            res.redirect('/');
        });
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
