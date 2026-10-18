const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pgctl = path.join(__dirname, '../node_modules/@embedded-postgres/darwin-x64/native/bin/pg_ctl');
const pgdata = path.join(__dirname, '../.pgdata');

function ensureDb() {
  if (fs.existsSync(pgctl) && fs.existsSync(pgdata)) {
    try {
      execSync(`"${pgctl}" -D "${pgdata}" status`, { stdio: 'ignore' });
    } catch {
      console.log('Starting PostgreSQL database...');
      execSync(`"${pgctl}" -D "${pgdata}" -l "${path.join(pgdata, 'logfile')}" start`, { stdio: 'inherit' });
    }
  }
}

ensureDb();
