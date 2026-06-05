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
    chargeLevel?: number;
    targetChargeLevel?: number;
    electricRange?: number;
    estimatedChargingTime?: number;
    connectionStatus?: string;
    systemStatus?: string;
    chargingType?: string;
    powerStatus?: string;
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
export interface AuthProvider {
    initiateOtpFlow(username: string, password: string): Promise<AuthFlowState>;
    completeOtpFlow(otp: string, flowState: AuthFlowState): Promise<TokenSet>;
    refreshAccessToken(refreshToken: string): Promise<TokenSet>;
}
export declare class OtpAuthProvider implements AuthProvider {
    private authCookies;
    private debug;
    constructor(debugFn?: DebugFn);
    private mergeCookies;
    private authRequest;
    initiateOtpFlow(username: string, password: string): Promise<AuthFlowState>;
    completeOtpFlow(otp: string, flowState: AuthFlowState): Promise<TokenSet>;
    private exchangeCode;
    refreshAccessToken(refreshToken: string): Promise<TokenSet>;
}
export declare class VolvoApiClient {
    private readonly vccApiKey;
    private readonly vin;
    private readonly provider;
    private http;
    private tokens;
    private debug;
    constructor(vccApiKey: string, vin: string, provider: AuthProvider, debugFn?: DebugFn);
    private attachInterceptors;
    setTokens(tokens: TokenSet): void;
    getTokens(): TokenSet | null;
    private ensureValidToken;
    private authHeaders;
    getWindows(): Promise<Record<string, string>>;
    getDiagnostics(): Promise<{
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
    }>;
    getStatistics(): Promise<{
        distanceToEmptyTank?: number;
        distanceToEmptyBattery?: number;
    }>;
    getDoorsAndLocks(): Promise<VehicleStatus>;
    getFuel(): Promise<Pick<VehicleStatus, 'fuelAmount' | 'fuelAmountLevel'>>;
    lock(): Promise<void>;
    unlock(): Promise<void>;
    startClimatisation(): Promise<void>;
    stopClimatisation(): Promise<void>;
    startEngine(durationMinutes?: number): Promise<void>;
    stopEngine(): Promise<void>;
    honk(): Promise<void>;
    flash(): Promise<void>;
    honkAndFlash(): Promise<void>;
    getRechargeStatus(): Promise<RechargeStatus>;
    getLocation(): Promise<{
        latitude: number;
        longitude: number;
        heading: number;
        timestamp: string;
    } | null>;
    getSupportedCommands(): Promise<string[]>;
}
export {};
//# sourceMappingURL=volvoApi.d.ts.map