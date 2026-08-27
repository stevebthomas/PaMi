import type { ChannelId, Message, ScenarioEvent } from "./types";

/**
 * Every channel where a reply counts as answering this specific
 * requires-response event: the event's own channel, any channel it
 * explicitly names as an alternate valid venue (`alsoSatisfiedByChannels`),
 * and the channel of any other event that re-asks it (`reAsks`). This is
 * the whole mechanism — generic across any story's events, driven entirely
 * by data on the events themselves, not by hardcoded channel names.
 */
export function satisfyingChannels(event: ScenarioEvent, allEvents: ScenarioEvent[]): Set<ChannelId> {
  const channels = new Set<ChannelId>([event.channel, ...(event.alsoSatisfiedByChannels ?? [])]);
  allEvents.forEach((e) => {
    if (e.reAsks === event.id) channels.add(e.channel);
  });
  return channels;
}

/**
 * Looser sibling of the requiresResponse-only `respondedAtMinutes` tracking:
 * has the player sent ANY message, in ANY channel that counts as answering
 * this event (same `satisfyingChannels` set), at or after it fired? Doesn't
 * require the event to be `requiresResponse` — works for a plain informational
 * beat too. Built from `messages`, which every story already tracks, so
 * nothing new needs to be stored. Used by ambient/memory-aid UI (e.g. the
 * easy-difficulty fact checklist) that wants "has the player moved on from
 * this" without caring whether it was a *required* response.
 */
export function hasPlayerAddressed(event: ScenarioEvent, allEvents: ScenarioEvent[], messages: Message[]): boolean {
  const channels = satisfyingChannels(event, allEvents);
  return messages.some(
    (m) => m.senderId === "player" && channels.has(m.channel) && m.sentAtSimMinutes >= event.triggerTimeMinutes
  );
}
