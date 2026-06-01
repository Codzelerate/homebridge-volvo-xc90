/**
 * Test script — run on the Raspberry Pi to confirm the location endpoint
 * returns data for your VIN.
 *
 * Usage:
 *   node test-location.mjs
 *
 * Reads the stored refresh token from ~/.homebridge/homebridge-volvo-xc90.json
 * so no credentials need to be entered manually.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { homedir } from 'os';

// Homebridge stores files in /var/lib/homebridge on most Pi installs.
// Falls back to ~/.homebridge if that path doesn't exist.
function findFile(filename) {
  const candidates = [
    `/var/lib/homebridge/${filename}`,
    path.join(homedir(), '.homebridge', filename),
    path.join(homedir(), filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Could not find ${filename} — tried: ${candidates.join(', ')}`);
}

const STATE_FILE = findFile('homebridge-volvo-xc90.json');
const CONFIG_FILE = findFile('config.json');
console.log(`Using state:  ${STATE_FILE}`);
console.log(`Using config: ${CONFIG_FILE}`);

// ── Load stored tokens ────────────────────────────────────────────────────────
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
const refreshToken = state?.tokens?.refresh_token;
if (!refreshToken) {
  console.error('No stored refresh token found. Authenticate via Homebridge first.');
  process.exit(1);
}

// ── Load VCC API key and VIN from config ──────────────────────────────────────
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
const platform = config.platforms?.find(p => p.platform === 'VolvoXC90');
if (!platform) {
  console.error('VolvoXC90 platform not found in config.json');
  process.exit(1);
}
const { vccApiKey, vin } = platform;
console.log(`VIN: ${vin}`);

// ── Refresh access token ──────────────────────────────────────────────────────
async function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    }).on('error', reject);
  });
}

const AUTH_BASIC = 'Basic aDRZZjBiOlU4WWtTYlZsNnh3c2c1WVFxWmZyZ1ZtSWFEcGhPc3kxUENhVXNpY1F0bzNUUjVrd2FKc2U0QVpkZ2ZJZmNMeXc=';

console.log('\nRefreshing access token...');
const tokens = await post(
  'https://volvoid.eu.volvocars.com/as/token.oauth2',
  { grant_type: 'refresh_token', refresh_token: refreshToken },
  { Authorization: AUTH_BASIC, 'X-XSRF-Header': 'PingFederate' },
);

if (!tokens.access_token) {
  console.error('Token refresh failed:', JSON.stringify(tokens));
  process.exit(1);
}
console.log('Token OK\n');

const headers = {
  Authorization: `Bearer ${tokens.access_token}`,
  'vcc-api-key': vccApiKey,
  accept: 'application/json',
};

// ── Call location endpoint ────────────────────────────────────────────────────
console.log('GET /location/v1/vehicles/{vin}/location');
const result = await get(
  `https://api.volvocars.com/location/v1/vehicles/${vin}/location`,
  headers,
);

console.log(`Status: ${result.status}`);
console.log(JSON.stringify(result.body, null, 2));
