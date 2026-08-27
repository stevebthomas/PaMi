import { create } from "zustand";
import { estimateCostUsd } from "@/lib/costEstimate";

/** Every distinct kind of Claude call this app makes, for the cost
 * breakdown. `reply` = a primary NPC reply to the player; `reaction-reply` =
 * a triggered second-agent reaction; `gate` = the Stage B cross-functional
 * classifier; the rest are the existing scoring/help infra calls. */
export type ApiCallType =
  | "reply"
  | "reaction-reply"
  | "evaluate"
  | "coordination"
  | "study-areas"
  | "help"
  | "gate"
  | "cs-template"
  | "tradeoff"
  | "suggest-followup";

export interface ApiCallLogEntry {
  id: string;
  timestamp: number;
  callType: ApiCallType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface GateSkipLogEntry {
  id: string;
  timestamp: number;
  /** Which Stage A rule skipped it, e.g. "no keyword overlap" / "message too
   * short" / "nothing pending" — see stageAShouldSkip's three bullets. */
  reason: string;
}

interface CostState {
  calls: ApiCallLogEntry[];
  gateSkips: GateSkipLogEntry[];
  recordCall: (entry: { callType: ApiCallType; model: string; inputTokens: number; outputTokens: number }) => void;
  recordGateSkip: (reason: string) => void;
}

let idCounter = 0;
function makeLogId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const useCostStore = create<CostState>((set) => ({
  calls: [],
  gateSkips: [],
  recordCall: (entry) =>
    set((s) => ({
      calls: [
        ...s.calls,
        {
          ...entry,
          id: makeLogId("call"),
          timestamp: Date.now(),
          estimatedCostUsd: estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens),
        },
      ],
    })),
  recordGateSkip: (reason) =>
    set((s) => ({ gateSkips: [...s.gateSkips, { id: makeLogId("skip"), timestamp: Date.now(), reason }] })),
}));

export interface SessionCostSummary {
  totalCalls: number;
  totalEstimatedCostUsd: number;
  callsByType: Record<ApiCallType, number>;
  /** Primary NPC replies that never triggered a second agent. */
  singleAgentReplyCalls: number;
  /** Stage B gate calls + the reaction replies they triggered — the whole
   * cost of the agent-to-agent feature. */
  gatedCrossFunctionalCalls: number;
  /** Stage A skips — free, no API call made. */
  stageAFreeSkips: number;
  /** stageAFreeSkips / (stageAFreeSkips + gate calls) — the proof the cheap
   * pre-filter is actually doing work, not just the gate call itself. */
  stageAFilterRate: number;
}

/** Plain function (not a hook) so it can be called from anywhere, including
 * a console — reads the store's current state directly. */
export function getSessionCostSummary(): SessionCostSummary {
  const { calls, gateSkips } = useCostStore.getState();

  const callsByType = calls.reduce(
    (acc, c) => {
      acc[c.callType] = (acc[c.callType] ?? 0) + 1;
      return acc;
    },
    {
      reply: 0,
      "reaction-reply": 0,
      evaluate: 0,
      coordination: 0,
      "study-areas": 0,
      help: 0,
      gate: 0,
      "cs-template": 0,
      tradeoff: 0,
      "suggest-followup": 0,
    } as Record<ApiCallType, number>
  );

  const totalEstimatedCostUsd = calls.reduce((sum, c) => sum + c.estimatedCostUsd, 0);
  const gateCallCount = callsByType.gate;
  const denominator = gateSkips.length + gateCallCount;

  return {
    totalCalls: calls.length,
    totalEstimatedCostUsd,
    callsByType,
    singleAgentReplyCalls: callsByType.reply,
    gatedCrossFunctionalCalls: gateCallCount + callsByType["reaction-reply"],
    stageAFreeSkips: gateSkips.length,
    stageAFilterRate: denominator === 0 ? 0 : gateSkips.length / denominator,
  };
}
