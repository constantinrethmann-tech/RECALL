"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth, signOut, useAuth } from "@/components/auth";
import { PageShell } from "@/components/PageShell";
import { Button, ButtonLink, ErrorNote, Splash } from "@/components/ui";
import { createBackup, saveFile } from "@/lib/backup";
import { effectiveRetention, MIN_REVIEWS, type MemoryCheck } from "@/lib/calibration";
import { loadMemoryCheck, loadSettings, saveSettings } from "@/lib/data";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsScreen />
    </RequireAuth>
  );
}

function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<{ busy: boolean; message?: string; blob?: Blob }>({ busy: false });
  const [memory, setMemory] = useState<MemoryCheck | null>(null);

  useEffect(() => {
    loadMemoryCheck().then(setMemory, () => {});
  }, []);

  useEffect(() => {
    loadSettings().then(
      (s) => {
        setSettings(s);
        setSaved(s);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  if (!settings) return error ? <PageShell title="Settings"><ErrorNote>{error}</ErrorNote></PageShell> : <Splash />;

  const set = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch });
    setStatus(null);
  };
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const retentionPct = Math.round(settings.desired_retention * 100);

  async function save() {
    if (!settings) return;
    setError(null);
    try {
      await saveSettings(settings);
      setSaved(settings);
      setStatus("Saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function makeBackup() {
    setBackup({ busy: true, message: "Starting…" });
    try {
      const blob = await createBackup((message) => setBackup({ busy: true, message }));
      setBackup({ busy: false, blob, message: `Ready: ${(blob.size / 1_048_576).toFixed(1)} MB` });
    } catch (e) {
      setBackup({ busy: false, message: `Backup failed: ${(e as Error).message}` });
    }
  }

  const number = "h-12 w-28 rounded-xl border border-seam-2 bg-hull px-3.5 font-mono text-[15px] text-frost outline-none focus:border-ion/60";

  return (
    <PageShell title="Settings">
      <div className="space-y-10">
        <section className="space-y-7">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Desired retention</span>
              <span className="font-mono text-[15px] text-ion">{retentionPct}%</span>
            </div>
            <input
              type="range"
              min={80}
              max={97}
              step={1}
              value={retentionPct}
              onChange={(e) => set({ desired_retention: Number(e.target.value) / 100 })}
              className="mt-3 w-full accent-[#8FB3FF]"
            />
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist">
              How likely you should still know a card when it comes back. <span className="text-frost">90% is the sweet spot.</span> Higher means
              more reviews for a little more certainty: raise it to about 95% for the last 2–3 weeks before an exam, then back to 90%.
            </p>
          </div>

          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[15px] text-frost">New cards per day</span>
              <span className="text-[13px] text-mist">all subjects together · busiest days ≈ 6× this many reviews</span>
            </span>
            <input
              type="number"
              min={0}
              max={9999}
              value={settings.new_per_day_total}
              onChange={(e) => set({ new_per_day_total: Math.max(0, Number(e.target.value) || 0) })}
              className={number}
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[15px] text-frost">New cards per subject</span>
              <span className="text-[13px] text-mist">max per day for one subject</span>
            </span>
            <input type="number" min={0} max={9999} value={settings.new_per_day} onChange={(e) => set({ new_per_day: Math.max(0, Number(e.target.value) || 0) })} className={number} />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[15px] text-frost">Longest gap</span>
              <span className="text-[13px] text-mist">every card comes back at least this often</span>
            </span>
            <select value={settings.maximum_interval} onChange={(e) => set({ maximum_interval: Number(e.target.value) })} className={`${number} w-28`}>
              {[7, 14, 21, 30, 45, 60, 90, 180, 36500].map((d) => (
                <option key={d} value={d}>
                  {d === 36500 ? "no limit" : `${d} days`}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[15px] text-frost">Maximum reviews per day</span>
              <span className="text-[13px] text-mist">all subjects together</span>
            </span>
            <input
              type="number"
              min={0}
              max={99999}
              value={settings.max_reviews_per_day}
              onChange={(e) => set({ max_reviews_per_day: Math.max(0, Number(e.target.value) || 0) })}
              className={number}
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[15px] text-frost">New day starts at</span>
              <span className="text-[13px] text-mist">late-night sessions still count for the same day</span>
            </span>
            <select value={settings.day_starts_at} onChange={(e) => set({ day_starts_at: Number(e.target.value) })} className={`${number} w-28`}>
              {Array.from({ length: 7 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-4">
            <Button onClick={save} disabled={!dirty}>
              Save settings
            </Button>
            {status && <span className="text-[13px] text-up">{status}</span>}
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
        </section>

        <section className="space-y-3 border-t border-seam pt-8">
          <p className="eyebrow">Memory check</p>
          {!memory ? (
            <p className="text-[13.5px] text-mist">Checking…</p>
          ) : memory.n < MIN_REVIEWS ? (
            <p className="text-[13.5px] leading-relaxed text-mist">
              Needs {MIN_REVIEWS} reviews of cards you&apos;ve seen before (you have {memory.n}). Then RECALL compares how often you really remember
              cards with what FSRS predicts, and shortens all gaps automatically if you forget faster.
            </p>
          ) : (
            <div className="space-y-2 text-[13.5px] leading-relaxed text-mist">
              <p>
                Last {memory.n} returning cards: you remembered <span className="font-mono text-frost">{Math.round(memory.observed * 100)}%</span>,
                FSRS expected <span className="font-mono text-frost">{Math.round(memory.predicted * 100)}%</span>.
              </p>
              <p>
                {memory.k < 1 ? (
                  <>
                    So gaps are now <span className="font-mono text-flare">{Math.round((1 - memory.k) * 100)}% shorter</span> (scheduling target{" "}
                    {Math.round(effectiveRetention(settings.desired_retention, memory.k) * 1000) / 10}% instead of {retentionPct}%).
                  </>
                ) : (
                  <span className="text-up">Your memory keeps up with the predictions, so no adjustment is needed.</span>
                )}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-seam pt-8">
          <p className="eyebrow">How RECALL schedules</p>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-mist">
            <li>
              FSRS, the same algorithm as modern Anki. New cards: 1 min and 10 min steps, then days (2 → 11 → up to your longest gap). Forgotten
              cards come back after 10 min, then after a few days.
            </li>
            <li>A card returns when your chance of still knowing it drops to your retention target, so on a normal day you know about 95% of all cards.</li>
            <li>Cards you&apos;re most likely to forget are shown first; new cards are mixed in between.</li>
            <li>
              Recall speed counts: if you answer Good or Easy but needed much longer than usual to remember, the card comes back sooner and is
              marked harder. Pauses when you leave the app are ignored.
            </li>
            <li>Cards forgotten twice or marked hard appear as “Trouble cards”, so you can drill them in Cram mode.</li>
          </ul>
        </section>

        <section className="space-y-4 border-t border-seam pt-8">
          <p className="eyebrow">Subjects &amp; units</p>
          <p className="text-[13.5px] text-mist">Rename or delete subjects and units (and all their cards).</p>
          <ButtonLink href="/decks/" variant="ghost">
            Edit subjects &amp; units
          </ButtonLink>
        </section>

        <section className="space-y-4 border-t border-seam pt-8">
          <p className="eyebrow">Backup</p>
          <p className="text-[13.5px] text-mist">Everything in one .zip: cards, pictures, progress and brain dumps.</p>
          <div className="flex flex-wrap items-center gap-3">
            {backup.blob ? (
              <Button onClick={() => saveFile(backup.blob!, `recall-backup-${new Date().toISOString().slice(0, 10)}.zip`)}>Save backup file</Button>
            ) : (
              <Button variant="ghost" onClick={makeBackup} disabled={backup.busy}>
                {backup.busy ? "Creating…" : "Create backup"}
              </Button>
            )}
            {backup.message && <span className="font-mono text-[12px] text-mist">{backup.message}</span>}
          </div>
        </section>

        <section className="flex items-center justify-between gap-4 border-t border-seam pt-8">
          <span className="truncate font-mono text-[12px] text-dust">{session?.user.email}</span>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              router.replace("/login/");
            }}
          >
            Sign out
          </Button>
        </section>
      </div>
    </PageShell>
  );
}
