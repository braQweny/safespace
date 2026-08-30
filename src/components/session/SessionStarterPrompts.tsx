/**
 * A blank first message is the hardest step in the whole product: naming a
 * difficulty from nothing, in writing, to a stranger. These fill the composer
 * rather than sending, so the user still edits and decides what actually goes.
 */
const STARTER_PROMPTS = [
  "Nie wiem, od czego zacząć.",
  "Mam trudną sytuację w pracy.",
  "Chcę uporządkować to, co czuję.",
  "Wraca do mnie rozmowa, która mnie zabolała.",
] as const;

interface SessionStarterPromptsProps {
  isDisabled: boolean;
  onSelect: (prompt: string) => void;
}

export default function SessionStarterPrompts({ isDisabled, onSelect }: SessionStarterPromptsProps) {
  return (
    <div className="mx-auto w-full max-w-3xl shrink-0">
      <p className="text-ink-muted text-xs leading-5">
        Możesz zacząć od jednego z tych zdań — resztę dopiszesz po swojemu.
      </p>
      {/* Na telefonie podpowiedzi jadą w poziomie zamiast zawijać się w trzy
          rzędy nad polem pisania — od `sm` wracają do zawijania. */}
      <ul className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {STARTER_PROMPTS.map((prompt) => (
          <li key={prompt} className="shrink-0">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => {
                onSelect(prompt);
              }}
              className="border-line-accent bg-surface text-ink-soft hover:bg-surface-soft hover:text-ink focus-visible:ring-brand-ring inline-flex min-h-11 items-center rounded-full border px-3.5 py-2 text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:whitespace-normal"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
