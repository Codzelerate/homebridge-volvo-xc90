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
    this.onRequest('/exchange-code', this.exchangeCode.bind(this));
    this.ready();
  }

  // Auth URL generation and PKCE are handled client-side — no server call needed for Step 1.

  async exchangeCode(body) {
    // verifier, expectedState, clientId, clientSecret, redirectUri are all sent by the frontend
    const { redirectUrl, verifier, expectedState, clientId, clientSecret, redirectUri } = body;

    if (!verifier || !clientId || !clientSecret) {
      throw new Error('Missing credentials — please start again from Step 1.');
    }

    let code, returnedState;
    try {
      const parsed = new URL(redirectUrl);
      code = parsed.searchParams.get('code');
      returnedState = parsed.searchParams.get('state');
    } catch {
      throw new Error('Could not parse the URL — paste the full address bar URL.');
    }

    if (!code) throw new Error('No "code" parameter found in the URL.');
    if (returnedState !== expectedState) throw new Error('State mismatch — please start again from Step 1.');

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
    return { success: true, clientId, clientSecret, refreshToken };
  }
}

(() => new OAuthUiServer())();
