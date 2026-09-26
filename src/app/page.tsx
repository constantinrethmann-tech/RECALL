"use client";

import { useRouter } from "next/navigation";
import { RequireAuth, signOut, useAuth } from "@/components/auth";
import { Upload } from "@/components/icons";
import { OverviewList, TodayPanel, useOverview } from "@/components/Overview";
import { ErrorNote, IconLink, Splash, Wordmark } from "@/components/ui";

export default function HomePage() {
  return (
    <RequireAuth>
      <Home />
    </RequireAuth>
  );
}

function Home() {
  const { data, error, reload } = useOverview();
  const { session } = useAuth();
  const router = useRouter();

  if (!data && !error) return <Splash />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
      <aside className="flex min-h-dvh flex-col lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-seam">
        <header className="pt-safe">
          <div className="flex h-16 items-center justify-between pl-5 pr-2">
            <Wordmark />
            <IconLink href="/import/" label="Import a deck">
              <Upload />
            </IconLink>
          </div>
        </header>

        <div className="flex-1 space-y-6 pt-2">
          {error && (
            <div className="px-4">
              <ErrorNote onRetry={reload}>{error}</ErrorNote>
            </div>
          )}
          {data && (
            <>
              <div className="px-4 lg:hidden">
                <TodayPanel data={data} />
              </div>
              <OverviewList data={data} />
            </>
          )}
        </div>

        <footer className="pb-safe flex items-center justify-between gap-2 border-t border-seam px-5 pt-3">
          <span className="truncate font-mono text-[11px] text-dust">{session?.user.email}</span>
          <button
            onClick={async () => {
              await signOut();
              router.replace("/login/");
            }}
            className="h-10 shrink-0 text-[13px] text-mist hover:text-frost"
          >
            Sign out
          </button>
        </footer>
      </aside>

      <main className="hidden min-h-dvh place-items-center p-10 lg:grid">
        {data && (
          <div className="w-full max-w-md space-y-6">
            <TodayPanel data={data} large />
            <p className="text-center font-mono text-[11px] leading-6 text-dust">
              space show answer · 1 2 3 4 again hard good easy · z undo
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
