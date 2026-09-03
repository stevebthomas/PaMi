"use client";

import { useState, type KeyboardEvent } from "react";
import { PixelAvatar, PLAYER_SPRITES, SpriteIcon } from "@/components/shared/PixelAvatar";
import type { AgentId } from "@/lib/sim/types";

const TEAM: { agentId: AgentId; name: string; title: string; blurb: string }[] = [
  { agentId: "raj", name: "Raj", title: "Engineering Manager", blurb: "Runs the squad building your features." },
  { agentId: "priya", name: "Priya", title: "Operations & Support Lead", blurb: "Hears from customers first." },
  { agentId: "derek", name: "Derek", title: "VP of Product", blurb: "Your manager." },
];

/** The static recap panel: company/role summary, team cards, and the button
 * that actually starts Day 1. Meant to sit side by side with the Sam chat. */
export function WelcomeScreen({ onStart }: { onStart: (name: string, avatarId: string) => void }) {
  const [name, setName] = useState("");
  // Pre-selected so "Start your day" never blocks on picking an avatar.
  const [avatarId, setAvatarId] = useState(PLAYER_SPRITES[0].id);
  const trimmedName = name.trim();

  function handleStart() {
    if (!trimmedName) return;
    onStart(trimmedName, avatarId);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleStart();
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border-hairline bg-surface p-6">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-1 text-caption font-semibold tracking-wide text-text-secondary">BAZAARLOOP</div>
        <h1 className="mb-4 text-heading font-bold tracking-tight text-text-primary">New Hire Orientation</h1>

        <div className="mb-3 text-body leading-relaxed text-text-primary">
          <span className="font-semibold">The company: </span>
          BazaarLoop is a marketplace where people buy and sell secondhand goods, think a mix of
          Etsy and eBay, built for a younger, mobile-first audience.
        </div>

        <div className="mb-4 text-body leading-relaxed text-text-primary">
          <span className="font-semibold">Your role: </span>
          You&apos;re the Project Manager for Buyer Experience. Everything from search to checkout
          is your surface area.
        </div>

        <div className="mb-2 text-label font-semibold uppercase tracking-wide text-text-secondary">How this works</div>
        <ul className="mb-4 list-disc pl-4 text-label leading-snug text-text-primary">
          <li>Apps open as windows from the taskbar at the bottom. Move them around, close them, reopen them anytime.</li>
          <li>Chattr is where you talk to your coworkers, in channels and DMs. Most of your day happens there.</li>
          <li>Pulse shows live platform data like checkout success and traffic.</li>
          <li>Taskflow is where engineering tickets live.</li>
          <li>Ask Claude explains any term or acronym that trips you up, no judgment.</li>
        </ul>

        <div className="mb-2 text-label font-semibold uppercase tracking-wide text-text-secondary">Your team</div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {TEAM.map((person) => (
            <div key={person.name} className="rounded-lg border border-border-hairline bg-surface p-3">
              <PixelAvatar agentId={person.agentId} sizeClassName="mb-2 h-9 w-9" />
              <div className="text-body font-semibold text-text-primary">{person.name}</div>
              <div className="mb-1 text-label text-text-secondary">{person.title}</div>
              <div className="text-label leading-snug text-text-primary">{person.blurb}</div>
            </div>
          ))}
        </div>

        <p className="text-body italic leading-relaxed text-text-secondary">
          It&apos;s Monday morning. Nothing on your calendar is guaranteed to go as planned. Your
          job today: handle whatever comes up.
        </p>
      </div>

      <div className="mt-4">
        <div id="player-avatar-label" className="mb-1 block text-caption font-semibold uppercase tracking-wide text-text-secondary">
          Pick your avatar
        </div>
        <div role="radiogroup" aria-labelledby="player-avatar-label" className="mb-3 flex gap-2">
          {PLAYER_SPRITES.map((option, i) => {
            const selected = option.id === avatarId;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Avatar option ${i + 1}`}
                onClick={() => setAvatarId(option.id)}
                className={`rounded-full outline-none transition-shadow ${
                  selected
                    ? "ring-2 ring-accent-green ring-offset-2 ring-offset-surface"
                    : "ring-1 ring-border-hairline hover:ring-text-secondary"
                }`}
              >
                <SpriteIcon
                  sprite={option.sprite}
                  bgClassName={option.bgClassName}
                  sizeClassName="h-10 w-10"
                  label={`Avatar option ${i + 1}`}
                />
              </button>
            );
          })}
        </div>

        <label htmlFor="player-name" className="mb-1 block text-caption font-semibold uppercase tracking-wide text-text-secondary">
          Your name
        </label>
        <input
          id="player-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your name…"
          className="w-full max-w-xs rounded-md border border-border-hairline bg-surface px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-secondary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
      </div>

      <button
        onClick={handleStart}
        disabled={!trimmedName}
        className="mt-3 self-start rounded-md bg-primary px-6 py-3 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Start your day
      </button>
    </div>
  );
}
