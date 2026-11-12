export const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
export const PASSWORD_HASH_ITERATIONS = 600_000;

export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 1 || length > 4096) throw new Error("Invalid random byte length");
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

export function base64url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_HASH_ITERATIONS },
    key,
    256,
  ));
  return `${PASSWORD_HASH_ALGORITHM}$${PASSWORD_HASH_ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [algorithm, roundsText, saltText, expectedText, extra] = storedHash.split("$");
    if (extra !== undefined || algorithm !== PASSWORD_HASH_ALGORITHM) return false;
    const rounds = Number(roundsText);
    // Accept the current format and bounded PBKDF2 cost upgrades, never attacker-chosen extremes.
    if (!Number.isInteger(rounds) || rounds < 600_000 || rounds > 1_000_000) return false;

    const salt = fromBase64(saltText);
    const expected = fromBase64(expectedText);
    if (salt.length !== 16 || expected.length !== 32) return false;

    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const derived = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
      key,
      256,
    ));

    let difference = 0;
    for (let i = 0; i < derived.length; i++) difference |= derived[i] ^ expected[i];
    return difference === 0;
  } catch {
    return false;
  }
}
