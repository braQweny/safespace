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
    <div className="shrink-0">
      <p className="text-ink-muted text-xs leading-5">Możesz zacząć od jednego z tych zdań — dopiszesz resztę sam.</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {STARTER_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => {
                onSelect(prompt);
              }}
              className="border-line-accent bg-surface text-ink-soft hover:border-brand-ring hover:bg-surface-hover focus:ring-brand-ring inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
