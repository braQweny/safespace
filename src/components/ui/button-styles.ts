/**
 * Wspólne klasy przycisków i pól — tylko te, które kilka plików pisało
 * identycznie. Dwa kształty z przewodnika: pigułka (`rounded-full`, 44 px) do
 * akcji w wierszu i drugorzędnych, blok (`rounded-[14px]`, 48 px) do głównego
 * kroku i pól. Warianty z innymi odstępami zostają przy swoich komponentach —
 * wciśnięte w jedną klasę zmieniłyby wygląd.
 *
 * `ui/button.tsx` (shadcn) zostaje przy swoich domyślnych wariantach: używa go
 * tylko `SubmitButton`, który nadpisuje kształt klasami i dostaje po scaleniu
 * kilka klas bazy (`shadow-xs`, `py-2`) — przepisanie wariantów zmieniłoby ten
 * przycisk.
 */

/** Pigułka z obrysem: „Anuluj”, „Zamknij”, „Edytuj” w kartach i dialogach. */
export const PILL_OUTLINE =
  "border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Pigułka z obrysem w pasku i na karcie rozmowy (szerszy odstęp, bez stanu wyłączonego). */
export const PILL_OUTLINE_SOFT =
  "border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2";

/** Mniejsza pigułka przy wierszu listy (36 px): łączona przez `cn` z pigułką. */
export const PILL_SMALL_SIZE = "h-9 px-3 text-xs";

/** Cicha pigułka usuwania: kolor błędu dopiero pod kursorem. */
export const PILL_QUIET_DANGER =
  "text-ink-muted hover:bg-danger-soft hover:text-danger focus-visible:ring-danger-strong inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Pigułka potwierdzająca usunięcie. */
export const PILL_DANGER =
  "bg-danger text-surface hover:bg-danger-strong focus-visible:ring-danger-strong disabled:bg-danger-line inline-flex h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed";

/** Pigułka w kolorze marki (np. „Wróć do panelu” bez rozmowy). */
export const PILL_BRAND =
  "bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2";

/** Blok główny (48 px) na stronach błędów i blokady. */
export const BLOCK_PRIMARY =
  "bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-12 items-center justify-center rounded-[14px] px-5 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2";

/** Blok główny na całą szerokość karty („Porozmawiaj o tej osobie / o tym”). */
export const BLOCK_PRIMARY_FULL =
  "bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex min-h-12 w-full items-center justify-center rounded-[14px] px-5 py-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2";

/** Blok z obrysem na całą szerokość ekranu logowania („Kontynuuj z Google”). */
export const BLOCK_OUTLINE_AUTH =
  "border-line-accent text-brand-deep hover:bg-surface-soft focus-visible:ring-brand-ring bg-surface flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border px-4 text-[15px] font-medium transition-colors focus:outline-none focus-visible:ring-2";

/** Blok wysyłki prostych formularzy logowania (przypomnienie hasła, ponowny e-mail). */
export const BLOCK_PRIMARY_AUTH =
  "bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-12 w-full items-center justify-center rounded-[14px] px-6 text-[15px] font-semibold transition-colors focus:outline-none focus-visible:ring-2";

/** Pole formularza w dialogach kart (obrys `line-control`, ≥3:1). */
export const FIELD =
  "border-line-control bg-surface text-ink placeholder:text-ink-muted focus-visible:ring-brand-ring block w-full rounded-[14px] border px-4 py-3 text-base leading-relaxed focus:outline-none focus-visible:ring-2";

/** Pole prostych formularzy logowania (przypomnienie hasła, ponowny e-mail). */
export const FIELD_AUTH =
  "border-line-strong bg-surface text-ink focus-visible:ring-brand-ring placeholder:text-ink-muted h-12 w-full rounded-[14px] border px-3.5 text-[15px] focus:ring-2 focus:outline-none";
