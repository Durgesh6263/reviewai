const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8');
const envVars = {};
env.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) {
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    envVars[k] = v;
  }
});

async function main() {
  const adminEmail = (process.argv[2] || 'admin@reviewai.com').trim().toLowerCase();
  const adminPassword = process.argv[3] || 'AdminPassword123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Check if exists
  const checkRes = await fetch(`${envVars.SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(adminEmail)}`, {
    headers: {
      'apikey': envVars.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${envVars.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const existing = await checkRes.json();

  if (existing && existing.length > 0) {
    // Update role to admin
    await fetch(`${envVars.SUPABASE_URL}/rest/v1/users?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: {
        'apikey': envVars.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${envVars.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'admin',
        password_hash: passwordHash,
        email_verified: true
      })
    });
    console.log('Updated existing admin user:', adminEmail);
  } else {
    // Insert new admin user
    const insertRes = await fetch(`${envVars.SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': envVars.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${envVars.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        email: adminEmail,
        password_hash: passwordHash,
        full_name: 'ReviewAI Platform Admin',
        role: 'admin',
        email_verified: true
      })
    });
    const inserted = await insertRes.json();
    console.log('Created new admin user:', inserted);
  }
}

main().catch(console.error);
