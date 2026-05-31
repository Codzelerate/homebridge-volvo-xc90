import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = 'https://api.volvocars.com';
const TOKEN_URL = 'https://volvoid.eu.volvocars.com/as/token.oauth2';

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
  engineRunning?: boolean;
  climatisationActive?: boolean;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expiresAt: number;
}

type DebugFn = (msg: string) => void;

export class VolvoApiClient {
  private http: AxiosInstance;
  private tokens: TokenSet | null = null;
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
      if (req.data) {
        this.debug(`  body: ${JSON.stringify(req.data)}`);
      }
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

  // --- Auth ---

  async authenticate(username: string, password: string): Promise<void> {
    this.debug(`Authenticating as ${username}`);
    const params = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
      scope: 'openid email profile care_by_volvo:financial_information:invoice:read '
        + 'care_by_volvo:financial_information:payment_method '
        + 'order:read owner:read '
        + 'tsp_customer_api:all',
    });

    const resp = await axios.post<TokenSet>(TOKEN_URL, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic aDRZZjBiOlU4WWtTYlZsNnh3c2c1WVFxWmZyZ1ZtSWFEcGhPc3RFMjJpMWJ5VHRwclc0V2xVcVhRMTg4OTZRTWFSK2NuSWU0OXNGOEw2NndEd0FPajNjbHFwdA==',
      },
    });

    this.tokens = {
      ...resp.data,
      expiresAt: Date.now() + resp.data.expires_in * 1000 - 30_000,
    };
    this.debug(`Token acquired, expires in ${resp.data.expires_in}s`);
  }

  async refreshTokens(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available — re-authenticate');
    }
    this.debug('Refreshing access token');

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token,
    });

    const resp = await axios.post<TokenSet>(TOKEN_URL, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic aDRZZjBiOlU4WWtTYlZsNnh3c2c1WVFxWmZyZ1ZtSWFEcGhPc3RFMjJpMWJ5VHRwclc0V2xVcVhRMTg4OTZRTWFSK2NuSWU0OXNGOEw2NndEd0FPajNjbHFwdA==',
      },
    });

    this.tokens = {
      ...resp.data,
      expiresAt: Date.now() + resp.data.expires_in * 1000 - 30_000,
    };
    this.debug(`Token refreshed, expires in ${resp.data.expires_in}s`);
  }

  setTokens(tokens: TokenSet): void {
    this.tokens = tokens;
  }

  getTokens(): TokenSet | null {
    return this.tokens;
  }

  private async ensureValidToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('Not authenticated');
    }
    if (Date.now() >= this.tokens.expiresAt) {
      this.debug('Token expired — refreshing');
      await this.refreshTokens();
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

  // --- Vehicle data ---

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
    this.debug(`Doors result: locked=${status.locked}, doors=${JSON.stringify(status.doors)}`);
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
    this.debug(`Fuel result: ${result.fuelAmountLevel}% (${result.fuelAmount}L)`);
    return result;
  }

  // --- Commands ---

  async lock(): Promise<void> {
    this.debug('Sending lock command');
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/lock`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async unlock(): Promise<void> {
    this.debug('Sending unlock command');
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/unlock`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async startClimatisation(): Promise<void> {
    this.debug('Sending climatization-start command');
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-start`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async stopClimatisation(): Promise<void> {
    this.debug('Sending climatization-stop command');
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-stop`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async startEngine(durationMinutes = 15): Promise<void> {
    this.debug(`Sending engine-start command (${durationMinutes} min)`);
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-start`,
      { runtimeMinutes: Math.min(durationMinutes, 15) },
      { headers: this.authHeaders(token) },
    );
  }

  async stopEngine(): Promise<void> {
    this.debug('Sending engine-stop command');
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-stop`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async honkAndFlash(): Promise<void> {
    this.debug('Sending honk-flash command');
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/honk-flash`,
      {},
      { headers: this.authHeaders(token) },
    );
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
