"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { CardEditor } from "@/components/CardEditor";
import { PageShell } from "@/components/PageShell";
import { Splash } from "@/components/ui";

export default function EditPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Splash />}>
        <Edit />
      </Suspense>
    </RequireAuth>
  );
}

function Edit() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? undefined;
  const [defaults, setDefaults] = useState(() => ({ subjectId: params.get("subject") ?? undefined, unitId: params.get("unit") ?? undefined }));
  const [savedCount, setSavedCount] = useState(0);

  const leave = () => {
    if (window.history.length > 1) router.back();
    else router.push("/cards/");
  };

  return (
    <PageShell title={id ? "Edit card" : savedCount ? `New card · ${savedCount} added` : "New card"}>
      <CardEditor
        key={id ?? `new-${savedCount}`}
        cardId={id}
        defaults={defaults}
        onDone={(result) => {
          // After adding a card, stay here with an empty form for the next one.
          // The next card starts in the same subject and unit.
          if (!id && result?.saved) {
            setDefaults({ subjectId: result.saved.subject_id, unitId: result.saved.unit_id });
            setSavedCount((n) => n + 1);
            return;
          }
          leave();
        }}
      />
    </PageShell>
  );
}
