import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

/**
 * Serves the JSON files written by `npm run playtest` (scripts/playtest.ts)
 * to the Reviews app. There's no database behind this — the script writes
 * files to the playtests/ directory and this route just reads them back,
 * same "client-first, no real persistence yet" pattern as the rest of the
 * app's data.
 */
export async function GET() {
  const dir = path.join(process.cwd(), "playtests");
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ playtests: [], guidanceOpportunities: null });
  }

  // guidance-opportunities.json and adversarial-gaming-report.json are
  // diagnostic artifacts, not PlaytestRecord/PlaytestAggregateRecord-shaped
  // — excluded here the same way, so they never end up misrendered as a run
  // card in the Reviews app.
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "guidance-opportunities.json" && f !== "adversarial-gaming-report.json");
  const playtests = files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  let guidanceOpportunities = null;
  const guidancePath = path.join(dir, "guidance-opportunities.json");
  if (fs.existsSync(guidancePath)) {
    try {
      guidanceOpportunities = JSON.parse(fs.readFileSync(guidancePath, "utf-8"));
    } catch {
      guidanceOpportunities = null;
    }
  }

  return NextResponse.json({ playtests, guidanceOpportunities });
}
