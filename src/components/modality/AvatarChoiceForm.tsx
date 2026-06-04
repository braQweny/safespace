import { useState } from "react";
import type { ModalityAvatar, ModalityId, SelectedModalityAvatar } from "@/lib/modalities";

interface AvatarChoiceFormProps {
  modalities: readonly ModalityAvatar[];
  currentSelection: SelectedModalityAvatar | null;
}

export default function AvatarChoiceForm({ modalities, currentSelection }: AvatarChoiceFormProps) {
  const [selectedModalityId, setSelectedModalityId] = useState<ModalityId | "">(currentSelection?.modalityId ?? "");
  const selectedModality = modalities.find((modality) => modality.modalityId === selectedModalityId) ?? null;

  return (
    <form method="POST" action="/api/profile/avatar" className="mt-8 rounded-lg border border-[#c8ddd7] bg-white p-5">
      <label htmlFor="modalityId" className="text-sm font-semibold text-[#173f39]">
        Wybierz nurt i awatara
      </label>
      <select
        id="modalityId"
        name="modalityId"
        value={selectedModalityId}
        onChange={(event) => {
          const nextModality = modalities.find((modality) => modality.modalityId === event.target.value);
          setSelectedModalityId(nextModality?.modalityId ?? "");
        }}
        className="mt-2 h-11 w-full rounded-lg border border-[#b8d2ca] bg-white px-3 text-sm text-[#10231f] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none"
      >
        <option value="">Wybierz jedna z pieciu opcji</option>
        {modalities.map((modality) => (
          <option key={modality.modalityId} value={modality.modalityId}>
            {modality.avatarName} - {modality.modalityName}
          </option>
        ))}
      </select>

      {selectedModality ? (
        <div className="mt-4 rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-4 text-sm leading-6 text-[#38524b]">
          <p className="font-semibold text-[#10231f]">{selectedModality.avatarName}</p>
          <p className="mt-1">{selectedModality.explanation}</p>
          <p className="mt-2 text-[#52645f]">{selectedModality.focus}</p>
        </div>
      ) : null}

      <input type="hidden" name="avatarId" value={selectedModality?.avatarId ?? ""} />

      <button
        type="submit"
        disabled={!selectedModality}
        className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-[#1f6f65] px-5 text-sm font-medium text-white transition-colors hover:bg-[#185950] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#9abbb4]"
      >
        Zapisz wybor
      </button>
    </form>
  );
}
