const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
  .then(() => { console.log('schema ready'); return pool.end(); })
  .catch(e => { console.error(e); process.exit(1); });
