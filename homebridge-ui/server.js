const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const AUTH_URL = 'https://volvoid.eu.volvocars.com/as/authorization.oauth2';
const TOKEN_URL = 'https://volvoid.eu.volvocars.com/as/token.oauth2';

const OAUTH_SCOPES = [
  'openid',
  'conve:battery_charge_level',
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
  'energy:capability:read',
  'energy:state:read',
  'location:read',
].join(' ');

class OAuthUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.pending = null;
    this.onRequest('/generate-auth-url', this.generateAuthUrl.bind(this));
    this.onRequest('/exchange-code', this.exchangeCode.bind(this));
    this.ready();
  }

  async generateAuthUrl(body) {
    const { clientId, clientSecret, redirectUri, vccApiKey } = body;

    const verifier = crypto.randomBytes(96).toString('base64url').slice(0, 128);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    this.pending = { verifier, state, clientId, clientSecret, redirectUri, vccApiKey };

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: OAUTH_SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });

    return { authUrl: `${AUTH_URL}?${params.toString()}` };
  }

  async exchangeCode(body) {
    const { redirectUrl } = body;

    if (!this.pending) {
      throw new Error('No pending OAuth flow — go back to Step 1.');
    }

    const { verifier, state, clientId, clientSecret, redirectUri, vccApiKey } = this.pending;

    let code, returnedState;
    try {
      const parsed = new URL(redirectUrl);
      code = parsed.searchParams.get('code');
      returnedState = parsed.searchParams.get('state');
    } catch {
      throw new Error('Could not parse the URL — paste the full address bar URL.');
    }

    if (!code) throw new Error('No "code" parameter found in the URL.');
    if (returnedState !== state) throw new Error('State mismatch — please start again from Step 1.');

    const basicAuth = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await axios.post(
      TOKEN_URL,
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
      { headers: { Authorization: basicAuth, 'content-type': 'application/x-www-form-urlencoded' } },
    );

    const refreshToken = res.data.refresh_token;

    // Save to plugin config — remove OTP fields, add OAuth fields
    const pluginConfig = await this.getPluginConfig();
    if (pluginConfig.length > 0) {
      const config = pluginConfig[0];
      config.clientId = clientId;
      config.clientSecret = clientSecret;
      config.vccApiKey = vccApiKey;
      config.refreshToken = refreshToken;
      delete config.username;
      delete config.password;
      delete config.otp;
      delete config.forceReauth;
      await this.updatePluginConfig(pluginConfig);
      await this.savePluginConfig();
    }

    this.pending = null;
    return { success: true };
  }
}

(() => new OAuthUiServer())();
