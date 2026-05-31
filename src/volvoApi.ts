import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import * as qs from 'qs';

const BASE_URL = 'https://api.volvocars.com';
const AUTH_URL = 'https://volvoid.eu.volvocars.com/as/authorization.oauth2';
const TOKEN_URL = 'https://volvoid.eu.volvocars.com/as/token.oauth2';

// Official Volvo app OAuth client credentials (PingFederate)
const AUTH_BASIC = 'Basic aDRZZjBiOlU4WWtTYlZsNnh3c2c1WVFxWmZyZ1ZtSWFEcGhPc3kxUENhVXNpY1F0bzNUUjVrd2FKc2U0QVpkZ2ZJZmNMeXc=';

const AUTH_SCOPES = [
  'openid',
  'conve:brake_status',
  'conve:climatization_start_stop',
  'conve:command_accessibility',
  'conve:commands',
  'conve:diagnostics_engine_status',
  'conve:diagnostics_workshop',
  'conve:doors_status',
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
].join(' ');

export interface VehicleStatus {
  fuelAmount?: number;
  fuelAmountLevel?: number;
  doors?: {
    frontLeft: boolean;
    frontRight: boolean;
    rearLeft: boolean;
    rearRight: boolean;
    hood: boolean;
    tailgate: boolean;
  };
  locked?: boolean;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expiresAt: number;
}

export interface AuthFlowState {
  flowId: string;
  cookies: string;
  timestamp: number;
}

type DebugFn = (msg: string) => void;

export class VolvoApiClient {
  private http: AxiosInstance;
  private tokens: TokenSet | null = null;
  private authCookies = '';
  private debug: DebugFn;

  constructor(
    private readonly vccApiKey: string,
    private readonly vin: string,
    debugFn?: DebugFn,
  ) {
    this.debug = debugFn ?? (() => undefined);
    this.http = axios.create({ baseURL: BASE_URL });
    this.attachInterceptors();
  }

  private attachInterceptors(): void {
    this.http.interceptors.request.use((req: InternalAxiosRequestConfig) => {
      this.debug(`→ ${req.method?.toUpperCase()} ${req.baseURL}${req.url}`);
      if (req.data) this.debug(`  body: ${JSON.stringify(req.data)}`);
      return req;
    });
    this.http.interceptors.response.use(
      (res: AxiosResponse) => {
        this.debug(`← ${res.status} ${res.config.url}`);
        this.debug(`  response: ${JSON.stringify(res.data)}`);
        return res;
      },
      (err) => {
        const status = err.response?.status ?? 'no-response';
        const body = JSON.stringify(err.response?.data ?? {});
        this.debug(`← ERROR ${status} ${err.config?.url}: ${body}`);
        return Promise.reject(err);
      },
    );
  }

  // ── Cookie management for PingFederate auth flow ──────────────────────────

  private mergeCookies(response: AxiosResponse): void {
    const setCookies = response.headers['set-cookie'];
    if (!setCookies) return;
    const map: Record<string, string> = {};
    if (this.authCookies) {
      this.authCookies.split('; ').forEach(c => {
        const [k] = c.split('=');
        if (k) map[k] = c;
      });
    }
    for (const raw of setCookies) {
      const pair = raw.split(';')[0];
      const [k] = pair.split('=');
      if (k) map[k] = pair;
    }
    this.authCookies = Object.values(map).join('; ');
  }

  private async authRequest(method: string, url: string, data?: object, isJson = false): Promise<Record<string, unknown>> {
    if (url.startsWith('http://')) url = 'https://' + url.slice(7);
    const headers: Record<string, string> = { 'X-XSRF-Header': 'PingFederate' };
    if (this.authCookies) headers['Cookie'] = this.authCookies;
    if (isJson) {
      headers['content-type'] = 'application/json';
    } else if (data) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }

    const res = await axios({
      method,
      url,
      headers,
      data: data ? (isJson ? data : qs.stringify(data)) : undefined,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    this.mergeCookies(res);

    if (res.status >= 400) {
      throw new Error(`Auth request ${res.status}: ${JSON.stringify(res.data)}`);
    }
    return res.data as Record<string, unknown>;
  }

  // ── Step 1: send credentials → triggers OTP email ─────────────────────────

  async initiateOtpFlow(username: string, password: string): Promise<AuthFlowState> {
    this.debug('Initiating OTP auth flow');
    this.authCookies = '';

    const initData = await this.authRequest('post', AUTH_URL, {
      client_id: 'h4Yf0b',
      response_type: 'code',
      response_mode: 'pi.flow',
      acr_values: 'urn:volvoid:aal:bronze:2sv',
      scope: AUTH_SCOPES,
    });

    const flowId = initData['id'] as string;
    this.debug(`Flow started: ${flowId}, status: ${initData['status']}`);

    if (initData['status'] !== 'USERNAME_PASSWORD_REQUIRED') {
      throw new Error(`Unexpected auth status: ${initData['status']}`);
    }

    const credUrl = (initData['_links'] as Record<string, { href: string }>)['checkUsernamePassword'].href;
    const credData = await this.authRequest('post', `${credUrl}?action=checkUsernamePassword`, { username, password }, true);
    this.debug(`Credentials submitted, status: ${credData['status']}`);

    if (credData['status'] !== 'OTP_REQUIRED') {
      throw new Error(`Unexpected status after credentials: ${credData['status']}`);
    }

    return { flowId, cookies: this.authCookies, timestamp: Date.now() };
  }

  // ── Step 2: submit OTP → returns tokens ───────────────────────────────────

  async completeOtpFlow(otp: string, flowState: AuthFlowState): Promise<TokenSet> {
    this.debug(`Completing OTP flow (flowId: ${flowState.flowId})`);
    this.authCookies = flowState.cookies;

    const flowBase = `https://volvoid.eu.volvocars.com/pf-ws/authn/flows/${flowState.flowId}`;

    const otpData = await this.authRequest('post', `${flowBase}?action=checkOtp`, { otp }, true);
    this.debug(`OTP submitted, status: ${otpData['status']}`);

    if (otpData['status'] !== 'OTP_VERIFIED') {
      throw new Error(`OTP verification failed: ${otpData['status']}`);
    }

    const contData = await this.authRequest('post', `${flowBase}?action=continueAuthentication`);
    this.debug(`Auth continued, status: ${contData['status']}`);

    if (contData['status'] !== 'COMPLETED') {
      throw new Error(`Auth not completed: ${contData['status']}`);
    }

    const code = (contData['authorizeResponse'] as Record<string, string>)['code'];
    return this.exchangeCode(code);
  }

  // ── Exchange auth code for tokens ─────────────────────────────────────────

  private async exchangeCode(code: string): Promise<TokenSet> {
    this.debug('Exchanging auth code for tokens');
    const res = await axios.post<TokenSet>(TOKEN_URL, qs.stringify({
      code,
      grant_type: 'authorization_code',
    }), {
      headers: {
        Authorization: AUTH_BASIC,
        'X-XSRF-Header': 'PingFederate',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const tokens: TokenSet = {
      ...res.data,
      expiresAt: Date.now() + (res.data.expires_in ?? 1800) * 1000 - 30_000,
    };
    this.tokens = tokens;
    this.debug(`Tokens obtained, expires in ${res.data.expires_in}s`);
    return tokens;
  }

  // ── Refresh access token ──────────────────────────────────────────────────

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    this.debug('Refreshing access token');
    const res = await axios.post<TokenSet>(TOKEN_URL, qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }), {
      headers: {
        Authorization: AUTH_BASIC,
        'X-XSRF-Header': 'PingFederate',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const tokens: TokenSet = {
      ...res.data,
      refresh_token: res.data.refresh_token || refreshToken,
      expiresAt: Date.now() + (res.data.expires_in ?? 1800) * 1000 - 30_000,
    };
    this.tokens = tokens;
    this.debug(`Token refreshed, expires in ${res.data.expires_in}s`);
    return tokens;
  }

  setTokens(tokens: TokenSet): void {
    this.tokens = tokens;
  }

  getTokens(): TokenSet | null {
    return this.tokens;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async ensureValidToken(): Promise<string> {
    if (!this.tokens) throw new Error('Not authenticated');
    if (Date.now() >= this.tokens.expiresAt) {
      this.debug('Access token expired — refreshing');
      await this.refreshAccessToken(this.tokens.refresh_token);
    }
    return this.tokens!.access_token;
  }

  private authHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'vcc-api-key': this.vccApiKey,
      'Content-Type': 'application/json',
    };
  }

  // ── Vehicle data ──────────────────────────────────────────────────────────

  async getDoorsAndLocks(): Promise<VehicleStatus> {
    this.debug('Polling doors and locks');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/doors`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    const status: VehicleStatus = {
      locked: d.centralLock?.value === 'LOCKED',
      doors: {
        frontLeft: d.frontLeft?.value === 'OPEN',
        frontRight: d.frontRight?.value === 'OPEN',
        rearLeft: d.rearLeft?.value === 'OPEN',
        rearRight: d.rearRight?.value === 'OPEN',
        hood: d.hood?.value === 'OPEN',
        tailgate: d.tailGate?.value === 'OPEN',
      },
    };
    this.debug(`Doors: locked=${status.locked}`);
    return status;
  }

  async getFuel(): Promise<Pick<VehicleStatus, 'fuelAmount' | 'fuelAmountLevel'>> {
    this.debug('Polling fuel level');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/engine`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    const result = {
      fuelAmount: d.fuelAmount?.value as number | undefined,
      fuelAmountLevel: d.fuelAmountLevel?.value as number | undefined,
    };
    this.debug(`Fuel: ${result.fuelAmountLevel}% (${result.fuelAmount}L)`);
    return result;
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  async lock(): Promise<void> {
    this.debug('Sending lock command');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/lock`, {}, { headers: this.authHeaders(token) });
  }

  async unlock(): Promise<void> {
    this.debug('Sending unlock command');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/unlock`, {}, { headers: this.authHeaders(token) });
  }

  async startClimatisation(): Promise<void> {
    this.debug('Sending climatization-start');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-start`, {}, { headers: this.authHeaders(token) });
  }

  async stopClimatisation(): Promise<void> {
    this.debug('Sending climatization-stop');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-stop`, {}, { headers: this.authHeaders(token) });
  }

  async startEngine(durationMinutes = 15): Promise<void> {
    this.debug(`Sending engine-start (${durationMinutes}min)`);
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-start`,
      { runtimeMinutes: Math.min(durationMinutes, 15) },
      { headers: this.authHeaders(token) },
    );
  }

  async stopEngine(): Promise<void> {
    this.debug('Sending engine-stop');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-stop`, {}, { headers: this.authHeaders(token) });
  }

  async honkAndFlash(): Promise<void> {
    this.debug('Sending honk-flash');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/honk-flash`, {}, { headers: this.authHeaders(token) });
  }

  async getSupportedCommands(): Promise<string[]> {
    this.debug('Fetching supported commands');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands`,
      { headers: this.authHeaders(token) },
    );
    return resp.data.data.map((c: { command: string }) => c.command);
  }
}
