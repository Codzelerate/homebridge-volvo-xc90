# OAuth Migration Plan — moving to Volvo's sanctioned authentication

> **Status:** Planned, not yet started. This document is the spec + research for migrating
> `homebridge-volvo-xc90` from its current unofficial auth to Volvo's compliant OAuth 2.0 flow.
> It is excluded from the npm package (the `files` whitelist ships only `dist` + `config.schema.json`).

---

## 1. Why we're doing this

The current authentication (`src/volvoApi.ts`) hardcodes **Volvo's own mobile-app OAuth client
credential** (`AUTH_BASIC` / client_id `h4Yf0b`) and drives a PingFederate OTP flow using the
user's Volvo ID. This gives a dead-simple 2-minute setup — but it plausibly breaches the **Volvo
Cars Developer Portal Terms & Conditions §4.2**:

- **§4.2(ii)** — *"forge headers or otherwise manipulate identifiers in order to disguise the origin
  of any content."* We present Volvo's app credential, disguising third-party requests as the
  official app.
- **§4.2(i)** — *"circumvent any security means or access control technology."* The app credential
  grants access a properly-issued developer client would not.
- **§4.2(vi)** — *"obtaining unauthorised access … without prior authorisation."* The credential was
  never issued to us.

The Connected Vehicle API Agreement §2.1 conditions the API licence on T&C compliance, so the breach
also voids the API licence itself.

**Proven side effect:** the public client is refused exactly one scope — `conve:engine_start_stop` —
while permitting `lock`, `unlock`, `climatization_start_stop`, `honk_flash`. Controlled test (auth-init
with single scopes) confirmed: every command scope accepted *except* engine start/stop. This is why
Remote Start returns 403 and cannot be fixed under the current model.

**Goal:** migrate to credentials the user is properly issued, eliminating the §4.2 exposure — and, as
a bonus, unlocking Remote Start and any other gated scope.

---

## 2. Target architecture — OAuth 2.0 Authorization Code + PKCE (Model A)

**Model A: each user brings their own published-app credentials.** Chosen over "Codzelerate publishes
one shared app" because Volvo requires a **confidential client** (a `client_secret` is mandatory even
with PKCE), and shipping a secret in a public npm package is itself a problem. With Model A each user's
secret stays on their own machine and each user is fully self-authorized — the cleanest legal posture,
zero infrastructure for Codzelerate.

### Exact mechanics (verified from two working references)

Reference implementations:
- **`thomasddn/volvo-cars-api`** (Python — the Home Assistant Volvo integration backend)
- **`jcfield-boop/homebridge-volvoEX30`** (`scripts/volvo-oauth.js` — the setup tool)

Endpoints (EU): `https://volvoid.eu.volvocars.com/as/authorization.oauth2` and `/as/token.oauth2`

| Step | Detail |
|---|---|
| **PKCE verifier** | `token_urlsafe(96)[:128]` (length 43–128) |
| **PKCE challenge** | `base64url(sha256(verifier))` with `=` padding stripped |
| **Challenge method** | `S256` |
| **Client auth** | `Authorization: Basic base64(client_id:client_secret)` — secret **required** |
| **Authorize params** | `response_type=code`, `client_id`, `redirect_uri`, `scope` (space-joined), `code_challenge`, `code_challenge_method=S256`, `state` |
| **Token exchange** | `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier` + Basic header |
| **Refresh** | `grant_type=refresh_token`, `refresh_token` + Basic header |

### The redirect URI trick — no hosted callback needed

Volvo requires a **real, non-localhost** redirect URI, but it does **not** need to capture anything.
The EX30 tool registers its **GitHub repo URL** as the redirect target. Flow:

1. User opens the authorize URL, logs in with their Volvo ID.
2. Volvo redirects the browser to the registered URL (it can 404 / do nothing).
3. User **copies the full redirect URL** (containing `?code=…&state=…`) from the browser address bar.
4. User pastes it into the setup tool, which extracts `code` and exchanges it for a refresh token.

No server, no hosting. The redirect target just has to exist and be non-localhost.

---

## 3. The new user setup flow

1. Register **and publish** a Volvo app at `developer.volvocars.com/account/`. Publishing auto-issues
   `client_id` + `client_secret` (dynamic client registration). During publish the user:
   - selects scopes (including `conve:engine_start_stop` if they want Remote Start),
   - registers a redirect URI (the plugin's GitHub URL works fine).
2. Run a setup tool (e.g. `npm run oauth` or a documented node script) that performs the PKCE
   auth-code dance and prints an initial **refresh token**.
3. Put `clientId`, `clientSecret`, `vccApiKey`, and the initial `refreshToken` into the Homebridge config.
4. The plugin uses `clientId` + `clientSecret` to refresh tokens from then on.

---

## 4. Non-breaking, phased migration (CRITICAL CONSTRAINT)

Existing installs must keep working. Each phase ships and is revertible on its own. All new config is
**optional** — absent ⇒ today's behavior.

- **Phase 0 — the seam (zero behavior change).** Extract current auth into `OtpAuthProvider`
  implementing an `AuthProvider` interface. Platform talks to the interface. Verify auth works
  identically, ship.
- **Phase 1 — add `OAuthAuthProvider`.** Selected when the user supplies `clientId` + `clientSecret`;
  otherwise falls back to the existing OTP flow, which **keeps working but logs a deprecation warning.**
  Namespace stored tokens by auth method (`authMethod: 'otp' | 'oauth'`) in the state file
  (`homebridge-volvo-xc90.json` in the Homebridge storage path) so they never cross-contaminate.
- **Phase 2 — wire scopes + Remote Start.** OAuth provider can request `engine_start_stop`. Flip the
  Remote Start gate from `showEngine === true` to `showEngine === true && provider.supportsEngine()`
  so the switch only appears under OAuth. (Remote Start is currently hidden/opt-in; switch code retained.)
- **Phase 3 — setup tool + docs.** Build the OAuth helper and write the migration guide.
- **Phase 4 — `v2.0.0` (later, breaking).** Remove the extracted `AUTH_BASIC` credential and the OTP
  path entirely. This release is the fully-compliant one; the major version properly signals the break.

---

## 5. Files & conventions

- `src/volvoApi.ts` — current auth: `initiateOtpFlow`, `completeOtpFlow`, `refreshAccessToken`,
  `setTokens`, `exchangeCode`, `AUTH_BASIC`, `AUTH_SCOPES`. The new `AuthProvider` interface and both
  providers live here (or split into `src/auth/`).
- `src/platform.ts` — persisted-state load/save (`loadState`/`saveState`), the `authenticate()`
  orchestration, config interface (`VolvoConfig`). Add `clientId`, `clientSecret`, `refreshToken`
  (optional) fields.
- `config.schema.json` — add the new OAuth fields (likely a new "Authentication (OAuth)" section);
  keep the existing sections intact.
- Conventions: bump `version`, update `CHANGELOG.md`, `npm run build` (cleans `dist` first), commit,
  tag `vX.Y.Z`, push (GitHub Actions publishes to npm). **Push requires `gh auth switch --user
  sunil-zacharia`.**
- Preserve the README structure and the Disclaimer / Privacy & security / Known limitations sections;
  update them as the migration lands.

---

## 6. Start here

Begin with **Phase 0** (the `AuthProvider` seam) and confirm nothing changed before touching anything
else. Read `src/volvoApi.ts` and `src/platform.ts` first to map the current auth structure.
