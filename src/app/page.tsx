import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-lg rounded-lg border border-border-hairline bg-surface p-8 text-center">
        <div className="mb-2 text-label font-semibold tracking-wide text-text-secondary">BAZAARLOOP</div>
        <h1 className="mb-4 text-display font-bold tracking-tight text-text-primary">PM Simulator</h1>
        <p className="mb-6 text-body leading-relaxed text-text-secondary">
          You&apos;re the new PM owning the buyer experience at a Series C marketplace startup.
          It&apos;s Monday morning. Your team is on Slack. Something&apos;s about to break.
        </p>
        <Link
          href="/sim"
          className="inline-block rounded-md bg-primary px-6 py-3 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Start Day 1
        </Link>
        <p className="mt-6 text-label text-text-secondary">
          Day 1 is the complete playable scenario. Requires an ANTHROPIC_API_KEY to talk to Raj, Priya, and Derek.
        </p>
      </div>
    </div>
  );
}
