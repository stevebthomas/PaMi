import Link from "next/link";

export default function Home() {
  return (
    <div className="pixel-desktop-bg flex min-h-full flex-1 items-center justify-center p-6">
      <div className="pixel-border w-full max-w-lg bg-bg-window p-8 text-center">
        <div className="mb-2 font-pixel text-label text-ink-soft">BAZAARLOOP</div>
        <h1 className="mb-4 font-pixel text-heading leading-relaxed text-ink">PM SIMULATOR</h1>
        <p className="mb-6 text-body leading-relaxed text-ink-soft">
          You&apos;re the new PM owning the buyer experience at a Series C marketplace startup.
          It&apos;s Monday morning. Your team is on Slack. Something&apos;s about to break.
        </p>
        <Link
          href="/sim"
          className="pixel-border inline-block bg-accent-chattr px-6 py-3 font-pixel text-label text-white hover:-translate-y-0.5"
        >
          START DAY 1
        </Link>
        <p className="mt-6 text-label text-ink-soft">
          Phase 0 + 1 preview — Monday only. Requires an ANTHROPIC_API_KEY to talk to Raj, Priya, and Derek.
        </p>
      </div>
    </div>
  );
}
