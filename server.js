const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'gsos_clients'
};

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Database initialization
async function initDatabase() {
  try {
    console.log('Attempting to connect to MySQL...');
    
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL database successfully');
    await connection.end();
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Please check your MySQL connection and make sure WAMP is running');
    process.exit(1);
  }
}

// Get all clients
app.get('/api/clients', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM clients ORDER BY client_name');
    await connection.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single client with password for details page
app.get('/api/clients/:id/details', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM clients WHERE id = ?', [id]);
    await connection.end();
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new client
app.post('/api/clients', async (req, res) => {
  try {
    const { client_name, domain_url, client_id, password, latest_pull_date, latest_pull_by, gsos_version } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const connection = await mysql.createConnection(dbConfig);
    const [result] = await connection.execute(
      'INSERT INTO clients (client_name, domain_url, client_id, password, original_password, latest_pull_date, latest_pull_by, gsos_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [client_name, domain_url, client_id, hashedPassword, password, latest_pull_date || null, latest_pull_by || null, gsos_version || null]
    );
    
    // If initial version details are provided, add to pull history
    if (latest_pull_date && latest_pull_by) {
      await connection.execute(
        'INSERT INTO pull_history (client_id, pull_date, pull_by, version) VALUES (?, ?, ?, ?)',
        [result.insertId, latest_pull_date, latest_pull_by, gsos_version || null]
      );
    }
    
    await connection.end();
    res.status(201).json({ id: result.insertId, message: 'Client added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update client
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { client_name, domain_url, client_id, password, latest_pull_date, latest_pull_by, gsos_version } = req.body;
    
    const connection = await mysql.createConnection(dbConfig);
    
    let query = 'UPDATE clients SET client_name = ?, domain_url = ?, client_id = ?, latest_pull_date = ?, latest_pull_by = ?, gsos_version = ?';
    let params = [client_name, domain_url, client_id, latest_pull_date || null, latest_pull_by || null, gsos_version || null];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?, original_password = ? WHERE id = ?';
      params.push(hashedPassword, password, id);
    } else {
      query += ' WHERE id = ?';
      params.push(id);
    }
    
    await connection.execute(query, params);
    await connection.end();
    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await mysql.createConnection(dbConfig);
    await connection.execute('DELETE FROM clients WHERE id = ?', [id]);
    await connection.end();
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get client pull history
app.get('/api/clients/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      'SELECT * FROM pull_history WHERE client_id = ? ORDER BY pull_date DESC',
      [id]
    );
    await connection.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add pull history entry
app.post('/api/clients/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { pull_date, pull_by, version } = req.body;
    
    const connection = await mysql.createConnection(dbConfig);
    
    await connection.execute(
      'INSERT INTO pull_history (client_id, pull_date, pull_by, version) VALUES (?, ?, ?, ?)',
      [id, pull_date, pull_by, version || null]
    );
    
    // Update client's latest pull info and version
    await connection.execute(
      'UPDATE clients SET latest_pull_date = ?, latest_pull_by = ?, gsos_version = ? WHERE id = ?',
      [pull_date, pull_by, version || null, id]
    );
    
    await connection.end();
    res.status(201).json({ message: 'Pull history added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});