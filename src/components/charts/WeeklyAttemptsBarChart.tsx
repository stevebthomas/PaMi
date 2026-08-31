"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";

/**
 * Weekly-attempts bar chart — the recharts route (Tremor idiom: recharts under
 * the hood, styled with the token system, no gridlines/axes chrome).
 *
 * recharts fits here because this is a plain categorical bar series with no
 * fixed-domain / custom-interpolation demands (unlike RateSparkline). Kept
 * deliberately monochrome per DESIGN.md — volume is not a good/bad signal, so
 * the accent green is NOT spent on it; bars are neutral warm-gray and the one
 * in-progress day is dimmed rather than recolored.
 */

type Datum = { label: string; value: number; muted?: boolean };

function ChartTooltip({
  active,
  payload,
  formatValue,
}: {
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
  formatValue: (n: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-[var(--radius-control)] border border-border-hairline bg-surface px-2 py-1 font-mono text-[10px] tabular-nums text-text-primary shadow-sm">
      {d.label} · {formatValue(d.value)}
    </div>
  );
}

function AxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={(y ?? 0) + 12} textAnchor="middle" className="fill-text-secondary text-[10px]">
      {payload?.value}
    </text>
  );
}

export function WeeklyAttemptsBarChart({
  data,
  formatValue,
}: {
  data: Datum[];
  formatValue: (n: number) => string;
}) {
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="24%">
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={<AxisTick />} height={20} />
          <Tooltip
            cursor={{ fill: "var(--color-text-secondary)", fillOpacity: 0.06 }}
            content={<ChartTooltip formatValue={formatValue} />}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill="var(--color-chart-2)" fillOpacity={d.muted ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
