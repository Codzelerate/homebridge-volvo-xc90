import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://api.volvocars.com';
const TOKEN_URL = 'https://volvoid.eu.volvocars.com/as/token.oauth2';

export interface VehicleStatus {
  fuelAmount?: number;        // litres
  fuelAmountLevel?: number;   // percent
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

export class VolvoApiClient {
  private http: AxiosInstance;
  private tokens: TokenSet | null = null;

  constructor(
    private readonly vccApiKey: string,
    private readonly vin: string,
  ) {
    this.http = axios.create({ baseURL: BASE_URL });
  }

  // --- Auth ---

  async authenticate(username: string, password: string): Promise<void> {
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
  }

  async refreshTokens(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available — re-authenticate');
    }

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
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/doors`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    return {
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
  }

  async getFuel(): Promise<Pick<VehicleStatus, 'fuelAmount' | 'fuelAmountLevel'>> {
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/engine`,
      { headers: this.authHeaders(token) },
    );
    const d = resp.data.data;
    return {
      fuelAmount: d.fuelAmount?.value,
      fuelAmountLevel: d.fuelAmountLevel?.value,
    };
  }

  // --- Commands ---

  async lock(): Promise<void> {
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/lock`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async unlock(): Promise<void> {
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/unlock`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async startClimatisation(): Promise<void> {
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-start`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async stopClimatisation(): Promise<void> {
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-stop`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async startEngine(durationMinutes = 15): Promise<void> {
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-start`,
      { runtimeMinutes: Math.min(durationMinutes, 15) },
      { headers: this.authHeaders(token) },
    );
  }

  async stopEngine(): Promise<void> {
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-stop`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async honkAndFlash(): Promise<void> {
    const token = await this.ensureValidToken();
    await this.http.post(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands/honk-flash`,
      {},
      { headers: this.authHeaders(token) },
    );
  }

  async getSupportedCommands(): Promise<string[]> {
    const token = await this.ensureValidToken();
    const resp = await this.http.get(
      `/connected-vehicle/v2/vehicles/${this.vin}/commands`,
      { headers: this.authHeaders(token) },
    );
    return resp.data.data.map((c: { command: string }) => c.command);
  }
}
