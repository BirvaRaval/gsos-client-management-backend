const pool = require('./db.js');

(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Connected successfully at:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Connection error:', err);
  } finally {
    pool.end();
  }
})();