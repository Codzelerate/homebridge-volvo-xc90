"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VolvoApiClient = exports.OtpAuthProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const qs = __importStar(require("qs"));
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
// ── OtpAuthProvider — the existing PingFederate OTP flow ─────────────────────
class OtpAuthProvider {
    constructor(debugFn) {
        this.authCookies = '';
        this.debug = debugFn ?? (() => undefined);
    }
    mergeCookies(response) {
        const setCookies = response.headers['set-cookie'];
        if (!setCookies)
            return;
        const map = {};
        if (this.authCookies) {
            this.authCookies.split('; ').forEach(c => {
                const [k] = c.split('=');
                if (k)
                    map[k] = c;
            });
        }
        for (const raw of setCookies) {
            const pair = raw.split(';')[0];
            const [k] = pair.split('=');
            if (k)
                map[k] = pair;
        }
        this.authCookies = Object.values(map).join('; ');
    }
    async authRequest(method, url, data, isJson = false) {
        if (url.startsWith('http://'))
            url = 'https://' + url.slice(7);
        const headers = { 'X-XSRF-Header': 'PingFederate' };
        if (this.authCookies)
            headers['Cookie'] = this.authCookies;
        if (isJson) {
            headers['content-type'] = 'application/json';
        }
        else if (data) {
            headers['content-type'] = 'application/x-www-form-urlencoded';
        }
        const res = await (0, axios_1.default)({
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
        return res.data;
    }
    async initiateOtpFlow(username, password) {
        this.debug('Initiating OTP auth flow');
        this.authCookies = '';
        const initData = await this.authRequest('post', AUTH_URL, {
            client_id: 'h4Yf0b',
            response_type: 'code',
            response_mode: 'pi.flow',
            acr_values: 'urn:volvoid:aal:bronze:2sv',
            scope: AUTH_SCOPES,
        });
        const flowId = initData['id'];
        this.debug(`Flow started: ${flowId}, status: ${initData['status']}`);
        if (initData['status'] !== 'USERNAME_PASSWORD_REQUIRED') {
            throw new Error(`Unexpected auth status: ${initData['status']}`);
        }
        const credUrl = initData['_links']['checkUsernamePassword'].href;
        const credData = await this.authRequest('post', `${credUrl}?action=checkUsernamePassword`, { username, password }, true);
        this.debug(`Credentials submitted, status: ${credData['status']}`);
        if (credData['status'] !== 'OTP_REQUIRED') {
            throw new Error(`Unexpected status after credentials: ${credData['status']}`);
        }
        return { flowId, cookies: this.authCookies, timestamp: Date.now() };
    }
    async completeOtpFlow(otp, flowState) {
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
        const code = contData['authorizeResponse']['code'];
        return this.exchangeCode(code);
    }
    async exchangeCode(code) {
        this.debug('Exchanging auth code for tokens');
        const res = await axios_1.default.post(TOKEN_URL, qs.stringify({
            code,
            grant_type: 'authorization_code',
        }), {
            headers: {
                Authorization: AUTH_BASIC,
                'X-XSRF-Header': 'PingFederate',
                'content-type': 'application/x-www-form-urlencoded',
            },
        });
        const tokens = {
            ...res.data,
            expiresAt: Date.now() + (res.data.expires_in ?? 1800) * 1000 - 30000,
        };
        this.debug(`Tokens obtained, expires in ${res.data.expires_in}s`);
        return tokens;
    }
    async refreshAccessToken(refreshToken) {
        this.debug('Refreshing access token');
        const res = await axios_1.default.post(TOKEN_URL, qs.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }), {
            headers: {
                Authorization: AUTH_BASIC,
                'X-XSRF-Header': 'PingFederate',
                'content-type': 'application/x-www-form-urlencoded',
            },
        });
        const tokens = {
            ...res.data,
            refresh_token: res.data.refresh_token || refreshToken,
            expiresAt: Date.now() + (res.data.expires_in ?? 1800) * 1000 - 30000,
        };
        this.debug(`Token refreshed, expires in ${res.data.expires_in}s`);
        return tokens;
    }
}
exports.OtpAuthProvider = OtpAuthProvider;
// ── VolvoApiClient ────────────────────────────────────────────────────────────
class VolvoApiClient {
    constructor(vccApiKey, vin, provider, debugFn) {
        this.vccApiKey = vccApiKey;
        this.vin = vin;
        this.provider = provider;
        this.tokens = null;
        this.debug = debugFn ?? (() => undefined);
        this.http = axios_1.default.create({ baseURL: BASE_URL });
        this.attachInterceptors();
    }
    attachInterceptors() {
        this.http.interceptors.request.use((req) => {
            this.debug(`→ ${req.method?.toUpperCase()} ${req.baseURL}${req.url}`);
            if (req.data)
                this.debug(`  body: ${JSON.stringify(req.data)}`);
            return req;
        });
        this.http.interceptors.response.use((res) => {
            this.debug(`← ${res.status} ${res.config.url}`);
            this.debug(`  response: ${JSON.stringify(res.data)}`);
            return res;
        }, (err) => {
            const status = err.response?.status ?? 'no-response';
            const body = JSON.stringify(err.response?.data ?? {});
            this.debug(`← ERROR ${status} ${err.config?.url}: ${body}`);
            return Promise.reject(err);
        });
    }
    setTokens(tokens) {
        this.tokens = tokens;
    }
    getTokens() {
        return this.tokens;
    }
    // ── Internal helpers ──────────────────────────────────────────────────────
    async ensureValidToken() {
        if (!this.tokens)
            throw new Error('Not authenticated');
        if (Date.now() >= this.tokens.expiresAt) {
            this.debug('Access token expired — refreshing');
            const tokens = await this.provider.refreshAccessToken(this.tokens.refresh_token);
            this.tokens = tokens;
        }
        return this.tokens.access_token;
    }
    authHeaders(token) {
        return {
            Authorization: `Bearer ${token}`,
            'vcc-api-key': this.vccApiKey,
            'Content-Type': 'application/json',
        };
    }
    // ── Vehicle data ──────────────────────────────────────────────────────────
    async getWindows() {
        this.debug('Polling windows');
        const token = await this.ensureValidToken();
        const resp = await this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/windows`, { headers: this.authHeaders(token) });
        const d = resp.data.data;
        return {
            frontLeft: d.frontLeftWindow?.value ?? 'UNKNOWN',
            frontRight: d.frontRightWindow?.value ?? 'UNKNOWN',
            rearLeft: d.rearLeftWindow?.value ?? 'UNKNOWN',
            rearRight: d.rearRightWindow?.value ?? 'UNKNOWN',
            sunroof: d.sunroof?.value ?? 'UNKNOWN',
        };
    }
    async getDiagnostics() {
        this.debug('Polling diagnostics');
        const token = await this.ensureValidToken();
        const [engine, brakes, diag, tyres] = await Promise.all([
            this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/engine`, { headers: this.authHeaders(token) }),
            this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/brakes`, { headers: this.authHeaders(token) }),
            this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/diagnostics`, { headers: this.authHeaders(token) }),
            this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/tyres`, { headers: this.authHeaders(token) }),
        ]);
        const e = engine.data.data;
        const b = brakes.data.data;
        const d = diag.data.data;
        const t = tyres.data.data;
        return {
            oilLevel: e.oilLevelWarning?.value ?? 'UNKNOWN',
            coolantLevel: e.engineCoolantLevelWarning?.value ?? 'UNKNOWN',
            brakeFluid: b.brakeFluidLevelWarning?.value ?? 'UNKNOWN',
            washerFluid: d.washerFluidLevelWarning?.value ?? 'UNKNOWN',
            serviceWarning: d.serviceWarning?.value ?? 'UNKNOWN',
            distanceToService: d.distanceToService?.value,
            timeToService: d.timeToService?.value,
            tyreFrontLeft: t.frontLeft?.value ?? 'UNKNOWN',
            tyreFrontRight: t.frontRight?.value ?? 'UNKNOWN',
            tyreRearLeft: t.rearLeft?.value ?? 'UNKNOWN',
            tyreRearRight: t.rearRight?.value ?? 'UNKNOWN',
        };
    }
    async getStatistics() {
        this.debug('Polling statistics');
        const token = await this.ensureValidToken();
        const resp = await this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/statistics`, { headers: this.authHeaders(token) });
        const d = resp.data.data;
        return {
            distanceToEmptyTank: d.distanceToEmptyTank?.value,
            distanceToEmptyBattery: d.distanceToEmptyBattery?.value,
        };
    }
    async getDoorsAndLocks() {
        this.debug('Polling doors and locks');
        const token = await this.ensureValidToken();
        const resp = await this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/doors`, { headers: this.authHeaders(token) });
        const d = resp.data.data;
        // API returns camelCase with full word: frontLeftDoor, rearRightDoor, etc.
        const status = {
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
    async getFuel() {
        this.debug('Polling fuel level');
        const token = await this.ensureValidToken();
        const resp = await this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/fuel`, { headers: this.authHeaders(token) });
        const d = resp.data.data;
        const result = {
            fuelAmount: d.fuelAmount?.value,
            fuelAmountLevel: d.fuelAmountLevel?.value,
        };
        this.debug(`Fuel: ${result.fuelAmount}L (fuelAmountLevel=${result.fuelAmountLevel ?? 'n/a'})`);
        return result;
    }
    // ── Commands ──────────────────────────────────────────────────────────────
    async lock() {
        this.debug('Sending lock command');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/lock`, {}, { headers: this.authHeaders(token) });
    }
    async unlock() {
        this.debug('Sending unlock command');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/unlock`, {}, { headers: this.authHeaders(token) });
    }
    async startClimatisation() {
        this.debug('Sending climatization-start');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-start`, {}, { headers: this.authHeaders(token) });
    }
    async stopClimatisation() {
        this.debug('Sending climatization-stop');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/climatization-stop`, {}, { headers: this.authHeaders(token) });
    }
    async startEngine(durationMinutes = 15) {
        this.debug(`Sending engine-start (${durationMinutes}min)`);
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-start`, { runtimeMinutes: Math.min(durationMinutes, 15) }, { headers: this.authHeaders(token) });
    }
    async stopEngine() {
        this.debug('Sending engine-stop');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/engine-stop`, {}, { headers: this.authHeaders(token) });
    }
    async honk() {
        this.debug('Sending honk');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/honk`, {}, { headers: this.authHeaders(token) });
    }
    async flash() {
        this.debug('Sending flash');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/flash`, {}, { headers: this.authHeaders(token) });
    }
    async honkAndFlash() {
        this.debug('Sending honk-flash');
        const token = await this.ensureValidToken();
        await this.http.post(`/connected-vehicle/v2/vehicles/${this.vin}/commands/honk-flash`, {}, { headers: this.authHeaders(token) });
    }
    async getRechargeStatus() {
        this.debug('Polling recharge status');
        const token = await this.ensureValidToken();
        // Energy API v2 — separate base path from Connected Vehicle API
        const resp = await this.http.get(`/energy/v2/vehicles/${this.vin}/state`, { headers: this.authHeaders(token) });
        const d = resp.data;
        const result = {
            chargeLevel: d.batteryChargeLevel?.status === 'OK' ? d.batteryChargeLevel.value : undefined,
            targetChargeLevel: d.targetBatteryChargeLevel?.status === 'OK' ? d.targetBatteryChargeLevel.value : undefined,
            electricRange: d.electricRange?.status === 'OK' ? d.electricRange.value : undefined,
            estimatedChargingTime: d.estimatedChargingTimeToTargetBatteryChargeLevel?.status === 'OK' ? d.estimatedChargingTimeToTargetBatteryChargeLevel.value : undefined,
            connectionStatus: d.chargerConnectionStatus?.status === 'OK' ? d.chargerConnectionStatus.value : undefined,
            systemStatus: d.chargingStatus?.status === 'OK' ? d.chargingStatus.value : undefined,
            chargingType: d.chargingType?.status === 'OK' ? d.chargingType.value : undefined,
            powerStatus: d.chargerPowerStatus?.status === 'OK' ? d.chargerPowerStatus.value : undefined,
        };
        this.debug(`Recharge: ${result.chargeLevel}% (target ${result.targetChargeLevel ?? '?'}%)` +
            ` | ${result.connectionStatus} | ${result.systemStatus}` +
            ` | type: ${result.chargingType ?? 'n/a'} | power: ${result.powerStatus ?? 'n/a'}` +
            ` | ~${result.estimatedChargingTime}min | range ${result.electricRange}km`);
        return result;
    }
    async getLocation() {
        this.debug('Polling location');
        const token = await this.ensureValidToken();
        const resp = await this.http.get(`/location/v1/vehicles/${this.vin}/location`, { headers: this.authHeaders(token) });
        const coords = resp.data?.data?.geometry?.coordinates;
        const props = resp.data?.data?.properties;
        if (!coords || coords.length < 2)
            return null;
        // GeoJSON order is [longitude, latitude, altitude]
        return {
            longitude: coords[0],
            latitude: coords[1],
            heading: Number(props?.heading ?? 0),
            timestamp: props?.timestamp ?? '',
        };
    }
    async getSupportedCommands() {
        this.debug('Fetching supported commands');
        const token = await this.ensureValidToken();
        const resp = await this.http.get(`/connected-vehicle/v2/vehicles/${this.vin}/commands`, { headers: this.authHeaders(token) });
        return resp.data.data.map((c) => c.command);
    }
}
exports.VolvoApiClient = VolvoApiClient;
//# sourceMappingURL=volvoApi.js.map