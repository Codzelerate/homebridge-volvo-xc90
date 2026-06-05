import * as readline from 'readline';
import * as crypto from 'crypto';
import axios from 'axios';
import * as qs from 'qs';

const AUTH_URL = 'https://volvoid.eu.volvocars.com/as/authorization.oauth2';
const TOKEN_URL = 'https://volvoid.eu.volvocars.com/as/token.oauth2';

const OAUTH_SCOPES = [
  'openid',
  'conve:brake_status',
  'conve:climatization_start_stop',
  'conve:command_accessibility',
  'conve:commands',
  'conve:diagnostics_engine_status',
  'conve:diagnostics_workshop',
  'conve:doors_status',
  'conve:engine_start_stop',
  'conve:engine_status',
  'conve:fuel_status',
  'conve:honk_flash',
  'conve:lock',
  'conve:lock_status',
  'conve:navigation',
  'conve:odometer_status',
  'conve:trip_statistics',
  'conve:tyre_status',
  'conve:unlock',
  'conve:vehicle_relation',
  'conve:warnings',
  'conve:windows_status',
  'energy:battery_charge_level',
  'energy:charging_connection_status',
  'energy:charging_system_status',
  'energy:electric_range',
  'energy:estimated_charging_time',
  'energy:recharge_status',
].join(' ');

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

function generateVerifier(): string {
  return crypto.randomBytes(96).toString('base64url').slice(0, 128);
}

function generateChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function hr(): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  hr();
  console.log(' Volvo OAuth Setup — homebridge-volvo-xc90');
  hr();
  console.log('');
  console.log('Before you begin:');
  console.log('  1. Go to https://developer.volvocars.com/account/');
  console.log('  2. Create and PUBLISH an application');
  console.log('     • Select all scopes you want (include engine_start_stop for Remote Start)');
  console.log('     • Add a redirect URI — your GitHub profile URL works fine:');
  console.log('         https://github.com/<your-username>');
  console.log('  3. Note down your Client ID, Client Secret, and VCC API Key');
  console.log('');
  await ask(rl, 'Press Enter to continue...');
  console.log('');

  const clientId     = await ask(rl, 'Client ID:     ');
  const clientSecret = await ask(rl, 'Client Secret: ');
  const redirectUri  = await ask(rl, 'Redirect URI:  ');
  const vccApiKey    = await ask(rl, 'VCC API Key:   ');

  const verifier  = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state     = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;

  console.log('');
  hr();
  console.log('Open this URL in your browser and log in with your Volvo ID:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('After login your browser will redirect to your registered URL.');
  console.log('The page may be blank or show an error — that is expected.');
  console.log('Copy the FULL URL from the address bar and paste it below.');
  hr();
  console.log('');

  const redirected = await ask(rl, 'Paste the full redirect URL: ');
  rl.close();

  let code: string;
  let returnedState: string;
  try {
    const parsed = new URL(redirected);
    code          = parsed.searchParams.get('code')  ?? '';
    returnedState = parsed.searchParams.get('state') ?? '';
  } catch {
    console.error('\nCould not parse URL. Make sure you pasted the full address bar URL.');
    process.exit(1);
  }

  if (!code) {
    console.error('\nNo "code" parameter found in the redirect URL.');
    process.exit(1);
  }

  if (returnedState !== state) {
    console.error('\nState mismatch — possible CSRF. Run the tool again.');
    process.exit(1);
  }

  console.log('\nExchanging authorisation code for tokens...');

  const basicAuth = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await axios.post<{ refresh_token: string; expires_in: number }>(
    TOKEN_URL,
    qs.stringify({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      code_verifier: verifier,
    }),
    { headers: { Authorization: basicAuth, 'content-type': 'application/x-www-form-urlencoded' } },
  );

  const { refresh_token } = res.data;

  console.log('');
  hr();
  console.log('✓ Success! Add these fields to your Homebridge plugin config:');
  console.log('');
  console.log(JSON.stringify({ clientId, clientSecret, vccApiKey, refreshToken: refresh_token }, null, 2));
  console.log('');
  console.log('The plugin rotates the refresh token automatically after first use.');
  console.log('You can remove "refreshToken" from the config after the first');
  console.log('successful Homebridge restart.');
  hr();
  console.log('');
}

main().catch(err => {
  console.error('\nError:', (err as Error).message);
  process.exit(1);
});
