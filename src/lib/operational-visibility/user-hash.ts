const USER_HASH_PREFIX = "usr";
const USER_HASH_HEX_LENGTH = 32;

function hasUsableValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashOperationalUserId(userId: unknown, hashSecret: unknown) {
  if (!hasUsableValue(userId) || !hasUsableValue(hashSecret)) {
    return null;
  }

  try {
    const encoder = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      encoder.encode(hashSecret.trim()),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"],
    );
    const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(userId.trim()));
    const hexDigest = toHex(signature).slice(0, USER_HASH_HEX_LENGTH);

    return `${USER_HASH_PREFIX}_${hexDigest}`;
  } catch {
    return null;
  }
}
