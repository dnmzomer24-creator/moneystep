const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'moneystep_jwt_secret_key_2026_secure';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// --- AUTHENTICATION ROUTES ---

// Register
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  // Hash password
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      return res.status(500).json({ error: 'Error hashing password' });
    }

    db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash],
      function (dbErr) {
        if (dbErr) {
          if (dbErr.code === 'SQLITE_CONSTRAINT' || dbErr.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username is already taken' });
          }
          return res.status(500).json({ error: 'Database error occurred' });
        }
        
        // Generate Token immediately upon registration
        const userId = this.lastID;
        const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
        
        res.status(201).json({
          message: 'User registered successfully',
          token,
          user: { id: userId, username }
        });
      }
    );
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error occurred' });
      }
      if (!user) {
        return res.status(400).json({ error: 'Invalid username or password' });
      }

      bcrypt.compare(password, user.password_hash, (bcryptErr, isMatch) => {
        if (bcryptErr) {
          return res.status(500).json({ error: 'Error validating credentials' });
        }
        if (!isMatch) {
          return res.status(400).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
          message: 'Login successful',
          token,
          user: { id: user.id, username: user.username }
        });
      });
    }
  );
});

// Get Profile Info
app.get('/api/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});


// --- GOAL ROUTES ---

// Get Goal Info
app.get('/api/goal', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM goals WHERE user_id = ?',
    [req.user.id],
    (err, goal) => {
      if (err) {
        return res.status(500).json({ error: 'Database error occurred' });
      }
      res.json({ goal: goal || null });
    }
  );
});

// Create/Update Goal Info
app.post('/api/goal', authenticateToken, (req, res) => {
  const { target_amount, current_savings, daily_saving } = req.body;

  const target = parseFloat(target_amount);
  const current = parseFloat(current_savings);
  const daily = parseFloat(daily_saving);

  if (isNaN(target) || isNaN(current) || isNaN(daily)) {
    return res.status(400).json({ error: 'All inputs must be valid numbers' });
  }

  if (target <= 0) {
    return res.status(400).json({ error: 'Target amount must be greater than 0' });
  }

  if (current < 0) {
    return res.status(400).json({ error: 'Current savings cannot be negative' });
  }

  if (daily <= 0) {
    return res.status(400).json({ error: 'Daily savings must be greater than 0 to reach a goal' });
  }

  // Calculations
  const remaining_amount = Math.max(0, target - current);
  let days_needed = 0;
  if (remaining_amount > 0) {
    days_needed = Math.ceil(remaining_amount / daily);
  }
  const months_needed = parseFloat((days_needed / 30).toFixed(1));
  const progress_percent = parseFloat(Math.min(100, (current / target) * 100).toFixed(1));

  // Insert or Replace Goal in DB
  db.run(
    `INSERT INTO goals (user_id, target_amount, current_savings, daily_saving, remaining_amount, days_needed, months_needed, progress_percent, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       target_amount = excluded.target_amount,
       current_savings = excluded.current_savings,
       daily_saving = excluded.daily_saving,
       remaining_amount = excluded.remaining_amount,
       days_needed = excluded.days_needed,
       months_needed = excluded.months_needed,
       progress_percent = excluded.progress_percent,
       updated_at = CURRENT_TIMESTAMP`,
    [req.user.id, target, current, daily, remaining_amount, days_needed, months_needed, progress_percent],
    function (err) {
      if (err) {
        // Fallback for raw REPLACE database triggers in older engines or standard fallback JSON database
        db.run(
          `REPLACE INTO goals (user_id, target_amount, current_savings, daily_saving, remaining_amount, days_needed, months_needed, progress_percent) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.user.id, target, current, daily, remaining_amount, days_needed, months_needed, progress_percent],
          function (errFallback) {
            if (errFallback) {
              console.error('Goal save error:', errFallback);
              return res.status(500).json({ error: 'Could not save goal data' });
            }
            res.json({
              message: 'Goal saved successfully',
              goal: {
                user_id: req.user.id,
                target_amount: target,
                current_savings: current,
                daily_saving: daily,
                remaining_amount,
                days_needed,
                months_needed,
                progress_percent
              }
            });
          }
        );
        return;
      }

      res.json({
        message: 'Goal saved successfully',
        goal: {
          user_id: req.user.id,
          target_amount: target,
          current_savings: current,
          daily_saving: daily,
          remaining_amount,
          days_needed,
          months_needed,
          progress_percent
        }
      });
    }
  );
});

// Fallback for SPA Routing (send index.html for any other frontend routes if defined, though we use standard hash router or active view switcher)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`MONEYSTEP Server is running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});
