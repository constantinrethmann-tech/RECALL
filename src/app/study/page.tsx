"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { ModeSwitch, OverviewList, useOverview } from "@/components/Overview";
import { ReviewSession } from "@/components/ReviewSession";
import { ButtonLink, ErrorNote, Splash, Wordmark } from "@/components/ui";
import { loadStudy, recordReview, undoReview, type StudyLoad } from "@/lib/data";
import { signedImageUrls } from "@/lib/images";
import { scopeFromParams, scopeKey } from "@/lib/scope";
import type { Scope, StudyCard, StudyMode } from "@/lib/types";
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
  const query = params.toString();
  const { scope, mode } = useMemo(() => scopeFromParams(new URLSearchParams(query)), [query]);
  const key = scopeKey(scope, mode);
  const wide = useMediaQuery("(min-width: 1024px)");

  const [state, setState] = useState<{ key: string; load?: StudyLoad; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStudy(scope, mode).then(
      (load) => !cancelled && setState({ key, load }),
      (e: Error) => !cancelled && setState({ key, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, scope, mode]);

  const exit = useCallback(() => router.push("/"), [router]);
  const current = state?.key === key ? state : null;
  const load = current?.load;

  const describe = useCallback(
    (c: StudyCard) => {
      if (!load) return "";
      const parts = scope.unitId
        ? [c.section ?? load.units.get(c.unitId)?.name]
        : scope.subjectId
          ? [load.units.get(c.unitId)?.name, c.section]
          : [load.subjects.get(c.subjectId)?.name, load.units.get(c.unitId)?.name, c.section];
      return parts.filter(Boolean).join(" · ");
    },
    [load, scope.unitId, scope.subjectId],
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
    body = <Splash label={mode === "cram" ? "Shuffling cards" : "Preparing cards"} />;
  } else {
    body = (
      <ReviewSession
        key={key}
        title={load.title}
        mode={mode}
        initial={load.plan}
        dayEnd={load.dayEnd}
        retention={load.retention}
        maxInterval={load.settings.maximum_interval}
        thinkBaselineMs={load.thinkBaselineMs}
        describe={describe}
        persist={mode === "learn" ? persist : null}
        loadImages={signedImageUrls}
        editable
        onExit={exit}
      />
    );
  }

  // The review stays at the same place in the tree when the sidebar comes and goes,
  // so resizing the window never restarts the session.
  return (
    <div className="h-dvh lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
      {wide && <Sidebar active={scope} mode={mode} />}
      <section className="min-w-0">{body}</section>
    </div>
  );
}

function Sidebar({ active, mode }: { active: Scope; mode: StudyMode }) {
  const { data, error, reload } = useOverview();
  const router = useRouter();
  return (
    <aside className="h-dvh overflow-y-auto border-r border-seam">
      <div className="flex h-14 items-center px-5">
        <Link href="/" aria-label="Overview">
          <Wordmark />
        </Link>
      </div>
      <div className="h-px bg-seam" />
      <div className="space-y-6 pt-4">
        {error && (
          <div className="px-4">
            <ErrorNote onRetry={reload}>{error}</ErrorNote>
          </div>
        )}
        {data && (
          <>
            <ModeSwitch
              mode={mode}
              onChange={(m) => {
                const p = new URLSearchParams(window.location.search);
                if (m === "cram") p.set("mode", "cram");
                else p.delete("mode");
                router.push(`/study/?${p.toString()}`);
              }}
            />
            <OverviewList data={data} active={active} mode={mode} />
          </>
        )}
      </div>
    </aside>
  );
}
