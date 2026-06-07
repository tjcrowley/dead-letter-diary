import {
  startRegistration,
  startAuthentication,
  base64URLStringToBuffer,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api } from "./api";

/**
 * PRF extension types (WebAuthn Level 3, not yet in TypeScript DOM lib).
 * Used to extend AuthenticationExtensionsClientInputs at runtime.
 */
interface PrfExtension {
  prf?: { eval?: { first: ArrayBuffer } } | Record<string, never>;
}

type OptionsWithPrf<T> = Omit<T, "extensions"> & {
  extensions?: AuthenticationExtensionsClientInputs & PrfExtension;
};

interface RegisterResult {
  credentialId: string;
  prfCapable: boolean;
}

interface AuthenticateResult {
  userId: string;
  /** PRF output — stays client-side, NEVER sent to server. */
  prfResult: ArrayBuffer | null;
}

/**
 * Register a new passkey for the current session user.
 * Requests PRF extension during registration to discover device support.
 */
export async function registerPasskey(): Promise<RegisterResult> {
  // 1. Get registration options from server (requires active session)
  const options =
    await api.post<PublicKeyCredentialCreationOptionsJSON>(
      "/api/webauthn/register-options"
    );

  // 2. Add PRF extension to discover device support
  const modifiedOptions = {
    ...options,
    extensions: {
      ...options.extensions,
      prf: {},
    },
  } as OptionsWithPrf<PublicKeyCredentialCreationOptionsJSON> as PublicKeyCredentialCreationOptionsJSON;

  // 3. Run browser registration ceremony (biometric prompt)
  const attResp = await startRegistration({ optionsJSON: modifiedOptions });

  // 4. Check if device supports PRF
  const prfEnabled =
    (
      attResp.clientExtensionResults as unknown as {
        prf?: { enabled?: boolean };
      }
    )?.prf?.enabled ?? false;

  // 5. Verify attestation on server
  const verifyResult = await api.post<{ credentialId: string }>(
    "/api/webauthn/register-verify",
    { attestation: attResp, prfEnabled }
  );

  return {
    credentialId: verifyResult.credentialId,
    prfCapable: prfEnabled,
  };
}

/**
 * Authenticate with a registered passkey.
 * Evaluates PRF extension to derive a device-bound secret.
 * The PRF result stays client-side — NEVER sent to server.
 */
export async function authenticatePasskey(): Promise<AuthenticateResult> {
  // 1. Get authentication options + HKDF salt from server
  const { options, hkdfSalt } = await api.post<{
    options: PublicKeyCredentialRequestOptionsJSON;
    hkdfSalt: string;
  }>("/api/webauthn/auth-options");

  // 2. Convert base64url salt to ArrayBuffer for PRF eval
  const saltBuffer = base64URLStringToBuffer(hkdfSalt);

  // 3. Add PRF eval extension with salt
  const modifiedOptions = {
    ...options,
    extensions: {
      ...options.extensions,
      prf: { eval: { first: saltBuffer } },
    },
  } as OptionsWithPrf<PublicKeyCredentialRequestOptionsJSON> as PublicKeyCredentialRequestOptionsJSON;

  // 4. Run browser authentication ceremony (biometric prompt)
  const authResp = await startAuthentication({ optionsJSON: modifiedOptions });

  // 5. Extract PRF result (stays client-side, never sent to server)
  const prfResult =
    (
      authResp.clientExtensionResults as unknown as {
        prf?: { results?: { first?: ArrayBuffer } };
      }
    )?.prf?.results?.first ?? null;

  // 6. Verify authentication on server (sends auth response, NOT PRF result)
  const verifyResult = await api.post<{ id: string }>(
    "/api/webauthn/auth-verify",
    { response: authResp }
  );

  return {
    userId: verifyResult.id,
    prfResult, // kept in memory for Phase 3 key derivation
  };
}
