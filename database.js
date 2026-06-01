const fs = require('fs');
const path = require('path');

let db;
let isJsonFallback = false;

// Fallback JSON-based Database implementation
class JsonDatabase {
  constructor(filepath) {
    this.filepath = filepath;
    this.data = { users: [], goals: [] };
    this.load();
  }

  load() {
    if (fs.existsSync(this.filepath)) {
      try {
        const fileContent = fs.readFileSync(this.filepath, 'utf8');
        this.data = JSON.parse(fileContent);
      } catch (err) {
        console.error('Error parsing JSON database, resetting:', err);
      }
    } else {
      this.save();
    }
  }

  save() {
    fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  run(sql, params = [], callback) {
    try {
      if (sql.includes('INSERT INTO users')) {
        const [username, password_hash] = params;
        const usernameExists = this.data.users.some(u => u.username === username);
        if (usernameExists) {
          const err = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: users.username');
          err.code = 'SQLITE_CONSTRAINT';
          if (callback) callback(err);
          return this;
        }
        const id = this.data.users.length + 1;
        this.data.users.push({ id, username, password_hash, created_at: new Date().toISOString() });
        this.save();
        if (callback) callback.call({ lastID: id }, null);
      } else if (sql.includes('INSERT INTO goals') || sql.includes('REPLACE INTO goals') || sql.includes('INSERT OR REPLACE INTO goals')) {
        const [user_id, target_amount, current_savings, daily_saving, remaining_amount, days_needed, months_needed, progress_percent] = params;
        
        const index = this.data.goals.findIndex(g => g.user_id === user_id);
        const goalData = {
          user_id,
          target_amount,
          current_savings,
          daily_saving,
          remaining_amount,
          days_needed,
          months_needed,
          progress_percent,
          updated_at: new Date().toISOString()
        };

        if (index !== -1) {
          this.data.goals[index] = { ...this.data.goals[index], ...goalData };
        } else {
          goalData.id = this.data.goals.length + 1;
          this.data.goals.push(goalData);
        }
        this.save();
        if (callback) callback.call({ lastID: index !== -1 ? this.data.goals[index].id : goalData.id }, null);
      } else if (callback) {
        callback(null);
      }
    } catch (err) {
      if (callback) callback(err);
    }
    return this;
  }

  get(sql, params = [], callback) {
    try {
      if (sql.includes('SELECT * FROM users WHERE username = ?')) {
        const [username] = params;
        const user = this.data.users.find(u => u.username === username);
        if (callback) callback(null, user || null);
      } else if (sql.includes('SELECT * FROM users WHERE id = ?')) {
        const [id] = params;
        const user = this.data.users.find(u => u.id === Number(id));
        if (callback) callback(null, user || null);
      } else if (sql.includes('SELECT * FROM goals WHERE user_id = ?')) {
        const [user_id] = params;
        const goal = this.data.goals.find(g => g.user_id === Number(user_id));
        if (callback) callback(null, goal || null);
      } else if (callback) {
        callback(null, null);
      }
    } catch (err) {
      if (callback) callback(err, null);
    }
    return this;
  }

  all(sql, params = [], callback) {
    if (callback) callback(null, []);
    return this;
  }

  close(callback) {
    if (callback) callback(null);
  }
}

// Try using standard sqlite3
try {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'moneystep.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Could not connect to SQLite database, falling back to JSON storage:', err.message);
      useJsonFallback();
    } else {
      console.log('Connected to SQLite database at:', dbPath);
      initializeTables();
    }
  });
} catch (err) {
  console.log('sqlite3 module load failed, falling back to JSON storage:', err.message);
  useJsonFallback();
}

function useJsonFallback() {
  isJsonFallback = true;
  const dbPath = path.join(__dirname, 'moneystep_db.json');
  db = new JsonDatabase(dbPath);
  console.log('JSON database initialized at:', dbPath);
}

function initializeTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        target_amount REAL NOT NULL,
        current_savings REAL NOT NULL,
        daily_saving REAL NOT NULL,
        remaining_amount REAL NOT NULL,
        days_needed REAL NOT NULL,
        months_needed REAL NOT NULL,
        progress_percent REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  });
}

module.exports = {
  run: (sql, params, callback) => db.run(sql, params, callback),
  get: (sql, params, callback) => db.get(sql, params, callback),
  all: (sql, params, callback) => db.all(sql, params, callback)
};
