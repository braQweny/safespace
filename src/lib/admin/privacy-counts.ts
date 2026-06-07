import type { PrivacySafeCount } from "./types";

export const ADMIN_SEGMENT_PRIVACY_THRESHOLD = 5;

export function exactPrivacyCount(value: number): PrivacySafeCount {
  return {
    value,
    isSuppressed: false,
    label: String(value),
  };
}

export function segmentPrivacyCount(value: number, threshold = ADMIN_SEGMENT_PRIVACY_THRESHOLD): PrivacySafeCount {
  if (value > 0 && value < threshold) {
    return {
      value: null,
      isSuppressed: true,
      label: `<${threshold}`,
    };
  }

  return exactPrivacyCount(value);
}
