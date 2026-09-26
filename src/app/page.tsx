"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth";
import { AppNav } from "@/components/AppNav";
import { ModeSwitch, OverviewList, TodayPanel, useOverview } from "@/components/Overview";
import { ErrorNote, Splash, Wordmark } from "@/components/ui";
import type { StudyMode } from "@/lib/types";

export default function HomePage() {
  return (
    <RequireAuth>
      <Home />
    </RequireAuth>
  );
}

function Home() {
  const { data, error, reload } = useOverview();
  const [mode, setMode] = useState<StudyMode>("learn");

  if (!data && !error) return <Splash />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
      <aside className="flex min-h-dvh flex-col lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-seam">
        <header className="pt-safe">
          <div className="flex h-16 items-center justify-between pl-5 pr-1">
            <Wordmark />
            <AppNav />
          </div>
        </header>

        <div className="pb-safe flex-1 space-y-6 pt-2">
          {error && (
            <div className="px-4">
              <ErrorNote onRetry={reload}>{error}</ErrorNote>
            </div>
          )}
          {data && (
            <>
              <div className="px-4 lg:hidden">
                <TodayPanel data={data} mode={mode} />
              </div>
              {data.subjects.length > 0 && <ModeSwitch mode={mode} onChange={setMode} />}
              <OverviewList data={data} mode={mode} />
            </>
          )}
        </div>
      </aside>

      <main className="hidden min-h-dvh place-items-center p-10 lg:grid">
        {data && (
          <div className="w-full max-w-md space-y-6">
            <TodayPanel data={data} mode={mode} large />
            <p className="text-center font-mono text-[11px] leading-6 text-dust">
              space show answer · 1 2 3 4 again hard good easy · z undo · e edit
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
