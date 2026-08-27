import { PixelAvatar } from "@/components/shared/PixelAvatar";
import type { AgentId } from "@/lib/sim/types";

const TEAM: { agentId: AgentId; name: string; title: string; blurb: string }[] = [
  { agentId: "raj", name: "Raj", title: "Engineering Manager", blurb: "Runs the squad building your features." },
  { agentId: "priya", name: "Priya", title: "Operations & Support Lead", blurb: "Hears from customers first." },
  { agentId: "derek", name: "Derek", title: "VP of Product", blurb: "Your manager." },
];

/** The static recap panel — company/role summary, team cards, and the button
 * that actually starts Day 1. Meant to sit side by side with the Sam chat. */
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="pixel-border flex h-full flex-col overflow-hidden bg-bg-window p-6">
      <div className="min-h-0 flex-1 overflow-y-auto pixel-scrollbar">
        <div className="mb-1 font-pixel text-[9px] text-ink-soft">BAZAARLOOP</div>
        <h1 className="mb-4 font-pixel text-sm leading-relaxed text-ink">NEW HIRE ORIENTATION</h1>

        <div className="mb-3 text-sm leading-relaxed text-ink">
          <span className="font-semibold">The company: </span>
          BazaarLoop is a marketplace where people buy and sell secondhand goods, think a mix of
          Etsy and eBay, built for a younger, mobile-first audience.
        </div>

        <div className="mb-4 text-sm leading-relaxed text-ink">
          <span className="font-semibold">Your role: </span>
          You&apos;re the Product Manager for Buyer Experience. Everything from search to checkout
          is your surface area.
        </div>

        <div className="mb-2 font-pixel text-[9px] text-ink-soft">YOUR TEAM</div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {TEAM.map((person) => (
            <div key={person.name} className="pixel-border bg-white p-3">
              <PixelAvatar agentId={person.agentId} sizeClassName="mb-2 h-9 w-9" />
              <div className="text-sm font-semibold text-ink">{person.name}</div>
              <div className="mb-1 text-[11px] text-ink-soft">{person.title}</div>
              <div className="text-[11px] leading-snug text-ink">{person.blurb}</div>
            </div>
          ))}
        </div>

        <p className="text-sm italic leading-relaxed text-ink-soft">
          It&apos;s Monday morning. Nothing on your calendar is guaranteed to go as planned. Your
          job today: handle whatever comes up.
        </p>
      </div>

      <button
        onClick={onStart}
        className="pixel-border mt-4 self-start bg-accent-chattr px-6 py-3 font-pixel text-xs text-white hover:-translate-y-0.5"
      >
        START YOUR DAY →
      </button>
    </div>
  );
}
