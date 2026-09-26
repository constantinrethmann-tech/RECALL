"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { OverviewList, useOverview } from "@/components/Overview";
import { ReviewSession } from "@/components/ReviewSession";
import { ButtonLink, ErrorNote, Splash, Wordmark } from "@/components/ui";
import { loadStudy, recordReview, undoReview, type StudyLoad } from "@/lib/data";
import { signedImageUrls } from "@/lib/images";
import type { Scope, StudyCard } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";

const persist = { record: recordReview, undo: undoReview };

export default function StudyPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Splash />}>
        <Study />
      </Suspense>
    </RequireAuth>
  );
}

function Study() {
  const router = useRouter();
  const params = useSearchParams();
  const unitId = params.get("unit");
  const subjectId = params.get("subject");
  const scope: Scope = unitId ? { kind: "unit", id: unitId } : subjectId ? { kind: "subject", id: subjectId } : { kind: "all" };
  const scopeKey = `${scope.kind}:${unitId ?? subjectId ?? ""}`;
  const wide = useMediaQuery("(min-width: 1024px)");

  const [state, setState] = useState<{ key: string; load?: StudyLoad; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const s: Scope = unitId ? { kind: "unit", id: unitId } : subjectId ? { kind: "subject", id: subjectId } : { kind: "all" };
    loadStudy(s).then(
      (load) => !cancelled && setState({ key: scopeKey, load }),
      (e: Error) => !cancelled && setState({ key: scopeKey, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [scopeKey, unitId, subjectId]);

  const exit = useCallback(() => router.push("/"), [router]);
  const current = state?.key === scopeKey ? state : null;
  const load = current?.load;

  const describe = useCallback(
    (c: StudyCard) => {
      if (!load) return "";
      const parts =
        scope.kind === "unit"
          ? [c.section ?? load.units.get(c.unitId)?.name]
          : scope.kind === "subject"
            ? [load.units.get(c.unitId)?.name, c.section]
            : [load.subjects.get(c.subjectId)?.name, load.units.get(c.unitId)?.name, c.section];
      return parts.filter(Boolean).join(" · ");
    },
    [load, scope.kind],
  );

  let body;
  if (current?.error) {
    body = (
      <div className="grid h-dvh place-items-center px-6">
        <div className="w-full max-w-sm space-y-5">
          <ErrorNote>{current.error}</ErrorNote>
          <ButtonLink href="/" variant="ghost" className="w-full">
            Back to overview
          </ButtonLink>
        </div>
      </div>
    );
  } else if (!load) {
    body = <Splash label="Preparing cards" />;
  } else {
    body = (
      <ReviewSession
        key={scopeKey}
        title={load.title}
        initial={load.plan}
        dayEnd={load.dayEnd}
        retention={load.settings.desired_retention}
        describe={describe}
        persist={persist}
        loadImages={signedImageUrls}
        onExit={exit}
      />
    );
  }

  // The review stays at the same place in the tree when the sidebar comes and goes,
  // so resizing the window never restarts the session.
  return (
    <div className="h-dvh lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
      {wide && <Sidebar active={scope} />}
      <section className="min-w-0">{body}</section>
    </div>
  );
}

function Sidebar({ active }: { active: Scope }) {
  const { data, error, reload } = useOverview();
  return (
    <aside className="h-dvh overflow-y-auto border-r border-seam">
      <div className="flex h-14 items-center px-5">
        <Link href="/" aria-label="Overview">
          <Wordmark />
        </Link>
      </div>
      <div className="h-px bg-seam" />
      <div className="pt-4">
        {error && (
          <div className="px-4">
            <ErrorNote onRetry={reload}>{error}</ErrorNote>
          </div>
        )}
        {data && <OverviewList data={data} active={active} />}
      </div>
    </aside>
  );
}
