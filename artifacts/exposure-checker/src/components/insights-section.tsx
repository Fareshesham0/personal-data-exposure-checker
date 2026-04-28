import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";
import { ArrowDown, ChevronDown, ChevronUp } from "lucide-react";

import type {
  BreachEntry,
  RiskFactors,
  SeverityLevel,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const HIGH_SENSITIVITY_CLASSES = new Set([
  "Passwords",
  "Credit cards",
  "Credit card CVV",
  "Social security numbers",
  "Personal health data",
  "Bank account numbers",
]);

const SEVERITY_FILL: Record<SeverityLevel, string> = {
  low: "hsl(var(--severity-low))",
  medium: "hsl(var(--severity-medium))",
  high: "hsl(var(--severity-high))",
};

const SEVERITY_LABEL: Record<SeverityLevel, string> = {
  low: "Low severity",
  medium: "Medium severity",
  high: "High severity",
};

const FACTOR_FILL = {
  frequency: "hsl(var(--chart-1))",
  recency: "hsl(var(--chart-2))",
  sensitivity: "hsl(var(--chart-3))",
} as const;

const FACTOR_CAPS = {
  frequency: 40,
  recency: 30,
  sensitivity: 30,
} as const;

interface InsightsSectionProps {
  breaches: BreachEntry[];
  factors: RiskFactors | null | undefined;
}

export function InsightsSection({ breaches, factors }: InsightsSectionProps) {
  const [open, setOpen] = useState(true);
  const timelineData = useMemo(() => {
    return breaches
      .filter((b) => !!b.breachDate)
      .map((b) => ({
        x: new Date(b.breachDate as string).getTime(),
        y: 1,
        z: Math.min(Math.max(b.pwnCount ?? 1, 1), 1_000_000_000),
        name: b.name,
        severityScore: b.severityScore,
        severityLevel: b.severityLevel,
        breachDate: b.breachDate as string,
        pwnCount: b.pwnCount ?? 0,
      }));
  }, [breaches]);

  const dataClassData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of breaches) {
      for (const dc of b.dataClasses) {
        counts.set(dc, (counts.get(dc) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([dc, count]) => ({
        dataClass: dc,
        count,
        isHighRisk: HIGH_SENSITIVITY_CLASSES.has(dc),
      }))
      .sort((a, b) => b.count - a.count);
  }, [breaches]);

  const compositionData = useMemo(() => {
    if (!factors) return [];
    return [
      {
        name: "Score",
        frequency: factors.frequency,
        recency: factors.recency,
        sensitivity: factors.sensitivity,
      },
    ];
  }, [factors]);

  const totalScore = factors
    ? factors.frequency + factors.recency + factors.sensitivity
    : 0;

  if (breaches.length === 0) return null;

  const xDomain: [number, number] | undefined =
    timelineData.length > 0
      ? (() => {
          const xs = timelineData.map((d) => d.x);
          const min = Math.min(...xs);
          const max = Math.max(...xs);
          if (min === max) {
            const pad = 1000 * 60 * 60 * 24 * 90;
            return [min - pad, max + pad];
          }
          const pad = Math.max((max - min) * 0.05, 1000 * 60 * 60 * 24 * 30);
          return [min - pad, max + pad];
        })()
      : undefined;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      asChild
    >
      <section
        id="insights"
        aria-labelledby="insights-heading"
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              data-testid="insights-toggle"
              aria-expanded={open}
              aria-controls="insights-content"
            >
              <h2
                id="insights-heading"
                className="text-2xl font-bold font-sans group-hover:text-primary transition-colors"
              >
                Insights
              </h2>
              {open ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <a
            href="#security-recommendations"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            data-testid="skip-to-summary"
          >
            <ArrowDown className="w-4 h-4" />
            Skip to summary
          </a>
        </div>

        <CollapsibleContent
          id="insights-content"
          className="grid gap-4 lg:grid-cols-2"
        >
        {/* Breach Timeline */}
        <Card
          className="border-border/50 lg:col-span-2"
          data-testid="chart-timeline-card"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Breach Timeline</CardTitle>
            <p className="text-xs text-muted-foreground">
              Each dot is one breach plotted by its disclosed date. Dot size
              reflects how many accounts were exposed; color reflects per-breach
              severity.
            </p>
          </CardHeader>
          <CardContent>
            <div
              className="h-[220px] w-full"
              role="img"
              aria-label={`Scatter plot timeline of ${timelineData.length} breach${timelineData.length === 1 ? "" : "es"} you appear in, plotted by breach date and colored by severity.`}
              data-testid="chart-timeline"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 16, right: 24, bottom: 8, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Date"
                    domain={xDomain}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                      })
                    }
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 2]}
                    hide
                  />
                  <ZAxis
                    type="number"
                    dataKey="z"
                    range={[60, 360]}
                    name="Accounts exposed"
                  />
                  <Tooltip
                    cursor={{
                      stroke: "hsl(var(--border))",
                      strokeDasharray: "3 3",
                    }}
                    content={<TimelineTooltip />}
                  />
                  <Scatter data={timelineData}>
                    {timelineData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={SEVERITY_FILL[d.severityLevel]}
                        fillOpacity={0.85}
                        stroke={SEVERITY_FILL[d.severityLevel]}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <SeverityLegend />
          </CardContent>
        </Card>

        {/* Data-Class Exposure */}
        <Card
          className="border-border/50"
          data-testid="chart-dataclass-card"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Data-Class Exposure</CardTitle>
            <p className="text-xs text-muted-foreground">
              How many of your breaches exposed each type of data. High-
              sensitivity classes (passwords, financial, health) are highlighted
              in red.
            </p>
          </CardHeader>
          <CardContent>
            <div
              className="w-full"
              style={{ height: Math.max(200, dataClassData.length * 26) }}
              role="img"
              aria-label={`Horizontal bar chart of ${dataClassData.length} data class${dataClassData.length === 1 ? "" : "es"} exposed across your breaches, sorted by frequency.`}
              data-testid="chart-dataclass"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dataClassData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    type="category"
                    dataKey="dataClass"
                    width={150}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--foreground))",
                    }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip content={<DataClassTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {dataClassData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          d.isHighRisk
                            ? "hsl(var(--severity-high))"
                            : "hsl(var(--chart-1))"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Score Composition */}
        <Card
          className="border-border/50"
          data-testid="chart-composition-card"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score Composition</CardTitle>
            <p className="text-xs text-muted-foreground">
              How your overall {totalScore}/100 risk score breaks down across
              the three weighted factors.
            </p>
          </CardHeader>
          <CardContent>
            {factors ? (
              <div
                className="h-[140px] w-full"
                role="img"
                aria-label={`Stacked horizontal bar showing score composition: frequency ${factors.frequency} of 40, recency ${factors.recency} of 30, sensitivity ${factors.sensitivity} of 30.`}
                data-testid="chart-composition"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={compositionData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                    barSize={36}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{
                        fontSize: 11,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      hide
                    />
                    <Tooltip
                      content={<CompositionTooltip />}
                      cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                    />
                    <Legend
                      content={<CompositionLegend />}
                      verticalAlign="bottom"
                    />
                    <Bar
                      dataKey="frequency"
                      stackId="score"
                      fill={FACTOR_FILL.frequency}
                      name={`Frequency (max ${FACTOR_CAPS.frequency})`}
                    />
                    <Bar
                      dataKey="recency"
                      stackId="score"
                      fill={FACTOR_FILL.recency}
                      name={`Recency (max ${FACTOR_CAPS.recency})`}
                    />
                    <Bar
                      dataKey="sensitivity"
                      stackId="score"
                      fill={FACTOR_FILL.sensitivity}
                      name={`Sensitivity (max ${FACTOR_CAPS.sensitivity})`}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Score breakdown is unavailable for this check.
              </p>
            )}
          </CardContent>
        </Card>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function SeverityLegend() {
  return (
    <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
      {(["low", "medium", "high"] as SeverityLevel[]).map((lvl) => (
        <span key={lvl} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: SEVERITY_FILL[lvl] }}
            aria-hidden
          />
          {SEVERITY_LABEL[lvl]}
        </span>
      ))}
    </div>
  );
}

interface TooltipPayloadEntry {
  payload?: {
    name?: string;
    breachDate?: string;
    severityScore?: number;
    severityLevel?: SeverityLevel;
    pwnCount?: number;
    dataClass?: string;
    count?: number;
    isHighRisk?: boolean;
  };
  value?: number | string;
  dataKey?: string;
  name?: string;
  color?: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function TimelineTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const date = p.breachDate
    ? new Date(p.breachDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold">{p.name}</div>
      <div className="text-muted-foreground">Breached: {date}</div>
      <div>
        Severity:{" "}
        <span className="font-mono font-medium">{p.severityScore}/100</span>{" "}
        <span className="text-muted-foreground">({p.severityLevel})</span>
      </div>
      {typeof p.pwnCount === "number" && p.pwnCount > 0 && (
        <div className="text-muted-foreground">
          {p.pwnCount.toLocaleString()} accounts exposed
        </div>
      )}
    </div>
  );
}

function DataClassTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold">{p.dataClass}</div>
      <div>
        Appears in{" "}
        <span className="font-mono font-medium">{p.count}</span> of your
        breaches
      </div>
      {p.isHighRisk && (
        <div className="text-[hsl(var(--severity-high))] mt-0.5">
          High-sensitivity class
        </div>
      )}
    </div>
  );
}

function CompositionTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs shadow-lg space-y-1">
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          <span>{entry.name}</span>
          <span className="font-mono ml-auto">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

interface LegendItem {
  value?: string;
  color?: string;
}

function CompositionLegend({ payload }: { payload?: LegendItem[] }) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs text-muted-foreground">
      {payload.map((entry, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          {entry.value}
        </span>
      ))}
    </div>
  );
}
