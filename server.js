// Import dependencies
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const db = new sqlite3.Database('./database.db');

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database setup
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        password TEXT,
        role TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL,
        date TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER,
        product_id INTEGER,
        quantity INTEGER,
        subtotal REAL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`);
});

// Routes

// Home route
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Products routes
app.get('/products', (req, res) => {
    db.all('SELECT * FROM products', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }
        res.render('products', { products: rows });
    });
});

app.post('/products/add', (req, res) => {
    const { name, price } = req.body;
    if (!name || !price || isNaN(price)) {
        return res.status(400).send('Invalid input');
    }
    db.run('INSERT INTO products (name, price) VALUES (?, ?)', [name, parseFloat(price)], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }
        res.redirect('/products');
    });
});


// POS route
app.get('/pos', (req, res) => {
    db.all('SELECT * FROM products', [], (err, products) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }
        res.render('pos', { products });
    });
});

// Checkout route
app.post('/pos/checkout', (req, res) => {
    // Pastikan req.body.cart ada
    if (!req.body.cart) {
        return res.status(400).send('Cart data is missing');
    }

    // req.body.cart sudah berupa objek, tidak perlu di-parse lagi
    const cart = req.body.cart;

    // Hitung total transaksi
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const date = new Date().toISOString();

    // Simpan transaksi ke database
    db.run('INSERT INTO transactions (total, date) VALUES (?, ?)', [total, date], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        const transactionId = this.lastID;

        // Simpan item transaksi ke database
        cart.forEach(item => {
            db.run('INSERT INTO transaction_items (transaction_id, product_id, quantity, subtotal) VALUES (?, ?, ?, ?)',
                [transactionId, item.id, item.quantity, item.price * item.quantity], (err) => {
                    if (err) {
                        console.error(err);
                    }
                });
        });

        res.redirect('/transactions');
    });
});

// Transactions routes
app.get('/transactions', (req, res) => {
    db.all('SELECT * FROM transactions', [], (err, transactions) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }
        res.render('transactions', { transactions });
    });
});

// Transaction items route (for receipt)
app.get('/transactions/:id/items', (req, res) => {
    const transactionId = req.params.id;
    db.all(`
        SELECT products.name, transaction_items.quantity, transaction_items.subtotal, products.price
        FROM transaction_items
        JOIN products ON transaction_items.product_id = products.id
        WHERE transaction_items.transaction_id = ?
    `, [transactionId], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        res.json(rows);
    });
});


// Fungsi untuk memformat mata uang
function formatCurrency(amount) {
    return amount.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' });
}

// Route untuk menampilkan transaksi
app.get('/transactions', (req, res) => {
    db.all('SELECT * FROM transactions', [], (err, transactions) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }
        // Kirim fungsi formatCurrency ke template EJS
        res.render('transactions', { transactions, formatCurrency });
    });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});