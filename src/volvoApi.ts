import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import * as qs from 'qs';

const BASE_URL = 'https://api.volvocars.com';
const AUTH_URL = 'https://volvoid.eu.volvocars.com/as/authorization.oauth2';
const TOKEN_URL = 'https://volvoid.eu.volvocars.com/as/token.oauth2';

// Volvo mobile app OAuth client credentials — public, extracted from the official app, not user-owned
const AUTH_BASIC = 'Basic aDRZZjBiOlU4WWtTYlZsNnh3c2c1WVFxWmZyZ1ZtSWFEcGhPc3kxUENhVXNpY1F0bzNUUjVrd2FKc2U0QVpkZ2ZJZmNMeXc='; // pragma: allowlist secret

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
  'energy:battery_charge_level',
  'energy:charging_connection_status',
  'energy:charging_system_status',
  'energy:electric_range',
  'energy:estimated_charging_time',
  'energy:recharge_status',
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

export interface RechargeStatus {
  chargeLevel?: number;         // 0–100 %
  targetChargeLevel?: number;   // 0–100 % — user-configured charge target
  electricRange?: number;       // km
  estimatedChargingTime?: number; // minutes to target
  connectionStatus?: string;    // CONNECTED | DISCONNECTED | FAULT | UNSPECIFIED
  systemStatus?: string;        // CHARGING | DONE | IDLE | SCHEDULED | FAULT | UNSPECIFIED
  chargingType?: string;        // AC | DC
  powerStatus?: string;         // PROVIDING_POWER | FULLY_CHARGED | NOT_CONNECTED | etc.
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

// ── AuthProvider interface ────────────────────────────────────────────────────

export interface AuthProvider {
  readonly authMethod: 'otp' | 'oauth';
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
}

// ── OtpAuthProvider — the existing PingFederate OTP flow ─────────────────────

export class OtpAuthProvider implements AuthProvider {
  readonly authMethod = 'otp' as const;
  private authCookies = '';
  private debug: DebugFn;

  constructor(debugFn?: DebugFn) {
    this.debug = debugFn ?? (() => undefined);
  }

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
    this.debug(`Tokens obtained, expires in ${res.data.expires_in}s`);
    return tokens;
  }

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
    this.debug(`Token refreshed, expires in ${res.data.expires_in}s`);
    return tokens;
  }
}

// ── OAuthAuthProvider — sanctioned OAuth 2.0 flow with user-owned credentials ─

export class OAuthAuthProvider implements AuthProvider {
  readonly authMethod = 'oauth' as const;
  private debug: DebugFn;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    debugFn?: DebugFn,
  ) {
    this.debug = debugFn ?? (() => undefined);
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    this.debug('Refreshing OAuth access token');
    const basicAuth = 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await axios.post<TokenSet>(TOKEN_URL, qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }), {
      headers: {
        Authorization: basicAuth,
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const tokens: TokenSet = {
      ...res.data,
      refresh_token: res.data.refresh_token || refreshToken,
      expiresAt: Date.now() + (res.data.expires_in ?? 1800) * 1000 - 30_000,
    };
    this.debug(`OAuth token refreshed, expires in ${res.data.expires_in}s`);
    return tokens;
  }
}

// ── VolvoApiClient ────────────────────────────────────────────────────────────

export class VolvoApiClient {
  private http: AxiosInstance;
  private tokens: TokenSet | null = null;
  private debug: DebugFn;

  constructor(
    private readonly vccApiKey: string,
    private readonly vin: string,
    private readonly provider: AuthProvider,
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
      const tokens = await this.provider.refreshAccessToken(this.tokens.refresh_token);
      this.tokens = tokens;
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

  async getWindows(): Promise<Record<string, string>> {
    this.debug('Polling windows');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/windows`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    return {
      frontLeft:  d.frontLeftWindow?.value  ?? 'UNKNOWN',
      frontRight: d.frontRightWindow?.value ?? 'UNKNOWN',
      rearLeft:   d.rearLeftWindow?.value   ?? 'UNKNOWN',
      rearRight:  d.rearRightWindow?.value  ?? 'UNKNOWN',
      sunroof:    d.sunroof?.value          ?? 'UNKNOWN',
    };
  }

  async getDiagnostics(): Promise<{
    oilLevel: string;
    coolantLevel: string;
    brakeFluid: string;
    washerFluid: string;
    serviceWarning: string;
    distanceToService: number | undefined;
    timeToService: number | undefined;
    tyreFrontLeft: string;
    tyreFrontRight: string;
    tyreRearLeft: string;
    tyreRearRight: string;
  }> {
    this.debug('Polling diagnostics');
    const token = await this.ensureValidToken();

    const [engine, brakes, diag, tyres] = await Promise.all([
      this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/engine`,      { headers: this.authHeaders(token) }),
      this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/brakes`,      { headers: this.authHeaders(token) }),
      this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/diagnostics`, { headers: this.authHeaders(token) }),
      this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/tyres`,       { headers: this.authHeaders(token) }),
    ]);

    const e = engine.data.data;
    const b = brakes.data.data;
    const d = diag.data.data;
    const t = tyres.data.data;

    return {
      oilLevel:          e.oilLevelWarning?.value             ?? 'UNKNOWN',
      coolantLevel:      e.engineCoolantLevelWarning?.value   ?? 'UNKNOWN',
      brakeFluid:        b.brakeFluidLevelWarning?.value      ?? 'UNKNOWN',
      washerFluid:       d.washerFluidLevelWarning?.value     ?? 'UNKNOWN',
      serviceWarning:    d.serviceWarning?.value              ?? 'UNKNOWN',
      distanceToService: d.distanceToService?.value           as number | undefined,
      timeToService:     d.timeToService?.value               as number | undefined,
      tyreFrontLeft:     t.frontLeft?.value                   ?? 'UNKNOWN',
      tyreFrontRight:    t.frontRight?.value                  ?? 'UNKNOWN',
      tyreRearLeft:      t.rearLeft?.value                    ?? 'UNKNOWN',
      tyreRearRight:     t.rearRight?.value                   ?? 'UNKNOWN',
    };
  }

  async getStatistics(): Promise<{ distanceToEmptyTank?: number; distanceToEmptyBattery?: number }> {
    this.debug('Polling statistics');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/statistics`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    return {
      distanceToEmptyTank:    d.distanceToEmptyTank?.value    as number | undefined,
      distanceToEmptyBattery: d.distanceToEmptyBattery?.value as number | undefined,
    };
  }

  async getDoorsAndLocks(): Promise<VehicleStatus> {
    this.debug('Polling doors and locks');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/doors`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    // API returns camelCase with full word: frontLeftDoor, rearRightDoor, etc.
    const status: VehicleStatus = {
      locked: d.centralLock?.value === 'LOCKED',
      doors: {
        frontLeft: d.frontLeftDoor?.value === 'OPEN',
        frontRight: d.frontRightDoor?.value === 'OPEN',
        rearLeft: d.rearLeftDoor?.value === 'OPEN',
        rearRight: d.rearRightDoor?.value === 'OPEN',
        hood: d.hood?.value === 'OPEN',
        tailgate: d.tailgate?.value === 'OPEN',
      },
    };
    this.debug(`Doors: locked=${status.locked}, doors=${JSON.stringify(status.doors)}`);
    return status;
  }

  async getFuel(): Promise<Pick<VehicleStatus, 'fuelAmount' | 'fuelAmountLevel'>> {
    this.debug('Polling fuel level');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/fuel`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    const result = {
      fuelAmount: d.fuelAmount?.value as number | undefined,
      fuelAmountLevel: d.fuelAmountLevel?.value as number | undefined,
    };
    this.debug(`Fuel: ${result.fuelAmount}L (fuelAmountLevel=${result.fuelAmountLevel ?? 'n/a'})`);
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

  async honk(): Promise<void> {
    this.debug('Sending honk');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/honk`, {}, { headers: this.authHeaders(token) });
  }

  async flash(): Promise<void> {
    this.debug('Sending flash');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/flash`, {}, { headers: this.authHeaders(token) });
  }

  async honkAndFlash(): Promise<void> {
    this.debug('Sending honk-flash');
    const token = await this.ensureValidToken();
    await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/honk-flash`, {}, { headers: this.authHeaders(token) });
  }

  async getRechargeStatus(): Promise<RechargeStatus> {
    this.debug('Polling recharge status');
    const token = await this.ensureValidToken();
    // Energy API v2 — separate base path from Connected Vehicle API
    const resp = await this.http.get(
      `/energy/v2/vehicles/${this.vin}/state`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data;
    const result: RechargeStatus = {
      chargeLevel:          d.batteryChargeLevel?.status === 'OK'                                   ? d.batteryChargeLevel.value                                   as number : undefined,
      targetChargeLevel:    d.targetBatteryChargeLevel?.status === 'OK'                             ? d.targetBatteryChargeLevel.value                             as number : undefined,
      electricRange:        d.electricRange?.status === 'OK'                                        ? d.electricRange.value                                        as number : undefined,
      estimatedChargingTime: d.estimatedChargingTimeToTargetBatteryChargeLevel?.status === 'OK'    ? d.estimatedChargingTimeToTargetBatteryChargeLevel.value      as number : undefined,
      connectionStatus:     d.chargerConnectionStatus?.status === 'OK'                              ? d.chargerConnectionStatus.value                              as string : undefined,
      systemStatus:         d.chargingStatus?.status === 'OK'                                       ? d.chargingStatus.value                                       as string : undefined,
      chargingType:         d.chargingType?.status === 'OK'                                         ? d.chargingType.value                                         as string : undefined,
      powerStatus:          d.chargerPowerStatus?.status === 'OK'                                   ? d.chargerPowerStatus.value                                   as string : undefined,
    };
    this.debug(
      `Recharge: ${result.chargeLevel}% (target ${result.targetChargeLevel ?? '?'}%)` +
      ` | ${result.connectionStatus} | ${result.systemStatus}` +
      ` | type: ${result.chargingType ?? 'n/a'} | power: ${result.powerStatus ?? 'n/a'}` +
      ` | ~${result.estimatedChargingTime}min | range ${result.electricRange}km`,
    );
    return result;
  }

  async getLocation(): Promise<{ latitude: number; longitude: number; heading: number; timestamp: string } | null> {
    this.debug('Polling location');
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/location/v1/vehicles/${this.vin}/location`,
      { headers: this.authHeaders(token) },
    );
    const coords = resp.data?.data?.geometry?.coordinates;
    const props  = resp.data?.data?.properties;
    if (!coords || coords.length < 2) return null;
    // GeoJSON order is [longitude, latitude, altitude]
    return {
      longitude: coords[0] as number,
      latitude:  coords[1] as number,
      heading:   Number(props?.heading ?? 0),
      timestamp: props?.timestamp ?? '',
    };
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
