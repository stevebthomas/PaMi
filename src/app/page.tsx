import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-lg rounded-lg border border-border-hairline bg-surface p-8 text-center">
        {/* PaMi is the product brand; BazaarLoop is the in-fiction company (named in the
            subtitle below). Only one lockup variant exists — the wordmark is near-black, so a
            dark-mode variant is still needed (flagged in DESIGN.md). */}
        <img
          src="/brand/pami_lockup_horizontal_final.png"
          alt="PaMi"
          width={220}
          height={99}
          className="mx-auto mb-4 block h-auto w-[220px]"
        />
        <p className="mb-6 text-body leading-relaxed text-text-secondary">
          You&apos;re the new PM owning the buyer experience at BazaarLoop, a Series C marketplace
          startup. It&apos;s Monday morning. Your team is on Slack. Something&apos;s about to break.
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
