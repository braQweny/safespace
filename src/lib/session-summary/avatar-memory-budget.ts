/** Limity dotyczą znaków Unicode, nie jednostek UTF-16 ani liczby tur rozmowy. */
export const AVATAR_MEMORY_MAX_CHARS = 6000;
export const AVATAR_MEMORY_BATCH_MAX_CHARS = 48_000;
// Osobny bezpiecznik ogranicza narzut metadanych przy bardzo krótkich wiadomościach.
export const AVATAR_MEMORY_BATCH_MAX_MESSAGES = 128;

export function isWithinAvatarMemoryBudget(messages: readonly { content: string }[], previousMemory: string) {
  return (
    Array.from(previousMemory).length <= AVATAR_MEMORY_MAX_CHARS &&
    messages.length <= AVATAR_MEMORY_BATCH_MAX_MESSAGES &&
    messages.reduce((total, message) => total + Array.from(message.content).length, 0) <= AVATAR_MEMORY_BATCH_MAX_CHARS
  );
}
