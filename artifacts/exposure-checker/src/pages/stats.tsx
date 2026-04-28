import { Link } from "wouter";
import {
  ArrowLeft,
  Activity,
  Database,
  Gauge,
  Globe,
  Server,
  ShieldOff,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { getGetMetricsQueryKey, useGetMetrics } from "@workspace/api-client-react";
import type {
  EndpointMetrics,
  ExternalCallMetrics,
  HistoryEntry,
  LatencyStats,
  Metrics,
} from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const REFRESH_INTERVAL_MS = 5_000;

function formatUptime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  if (h === 0) return `${m}m ${totalSeconds % 60}s`;
  return `${h}h ${m}m`;
}

function formatMs(value: number): string {
  if (value === 0) return "—";
  if (value < 10) return `${value.toFixed(2)} ms`;
  if (value < 1000) return `${value.toFixed(1)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function formatRelative(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

function formatExternalTarget(target: ExternalCallMetrics["target"]): string {
  switch (target) {
    case "hibp.breaches":
      return "HIBP – Public breach list";
    case "xposedornot.checkEmail":
      return "XposedOrNot – Email lookup";
    case "hibp.pwnedPasswords":
      return "HIBP – Pwned Passwords";
    default:
      return target;
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-5 flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5">{value}</p>
          {hint && (
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LatencyTable({
  rows,
}: {
  rows: Array<{ label: string; stats: LatencyStats; testIdSuffix?: string }>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Series</TableHead>
          <TableHead className="text-right">Samples</TableHead>
          <TableHead className="text-right">Mean</TableHead>
          <TableHead className="text-right">p50</TableHead>
          <TableHead className="text-right">p95</TableHead>
          <TableHead className="text-right">p99</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={r.label}
            data-testid={r.testIdSuffix ? `latency-row-${r.testIdSuffix}` : undefined}
          >
            <TableCell className="font-medium">{r.label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.stats.count}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMs(r.stats.meanMs)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMs(r.stats.p50Ms)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMs(r.stats.p95Ms)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMs(r.stats.p99Ms)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EndpointTable({ rows }: { rows: EndpointMetrics[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Endpoint</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status breakdown</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.endpoint} data-testid={`endpoint-row-${r.endpoint}`}>
            <TableCell className="font-mono text-sm">{r.endpoint}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              {r.total}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1.5">
                {r.byStatus.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  r.byStatus.map((s) => {
                    const variant =
                      s.statusCode >= 500
                        ? "destructive"
                        : s.statusCode >= 400
                          ? "secondary"
                          : "default";
                    return (
                      <Badge
                        key={s.statusCode}
                        variant={variant}
                        className="font-mono text-xs"
                      >
                        {s.statusCode} · {s.count}
                      </Badge>
                    );
                  })
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ExternalCallsTable({ rows }: { rows: ExternalCallMetrics[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Upstream</TableHead>
          <TableHead className="text-right">OK</TableHead>
          <TableHead className="text-right">Fail</TableHead>
          <TableHead className="text-right">Samples</TableHead>
          <TableHead className="text-right">Mean</TableHead>
          <TableHead className="text-right">p95</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.target}>
            <TableCell className="font-medium">
              {formatExternalTarget(r.target)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.ok}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.fail > 0 ? (
                <span className="text-destructive font-medium">{r.fail}</span>
              ) : (
                r.fail
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.latencyMs.count}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMs(r.latencyMs.meanMs)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMs(r.latencyMs.p95Ms)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CacheCard({ cache }: { cache: Metrics["hibpCache"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="w-4 h-4" />
          HIBP Breach Metadata Cache
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-medium">
              {cache.populated ? (
                <span className="text-emerald-600 dark:text-emerald-500">
                  Populated
                </span>
              ) : (
                <span className="text-muted-foreground">Empty</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entries</p>
            <p className="font-medium tabular-nums">
              {cache.entries ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last refresh</p>
            <p className="font-medium tabular-nums">
              {formatRelative(cache.ageSeconds ?? null)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Hit rate</p>
            <p className="font-medium tabular-nums">
              {(cache.hitRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
          Hits: <span className="tabular-nums">{cache.hits}</span> · Misses:{" "}
          <span className="tabular-nums">{cache.misses}</span>
        </p>
      </CardContent>
    </Card>
  );
}

interface SparklineTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  formatter: (v: number) => string;
  label?: string;
}

function SparklineTooltip({ active, payload, formatter }: SparklineTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  if (val == null) return null;
  return (
    <div className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs shadow-lg">
      {formatter(val)}
    </div>
  );
}

interface SparklineCardProps {
  title: string;
  description: string;
  data: HistoryEntry[];
  dataKey: keyof HistoryEntry;
  formatter: (v: number) => string;
  color?: string;
  testId?: string;
}

function SparklineCard({
  title,
  description,
  data,
  dataKey,
  formatter,
  color = "hsl(var(--primary))",
  testId,
}: SparklineCardProps) {
  const hasData = data.length > 0;
  const latestValue = hasData ? (data[data.length - 1]?.[dataKey] as number) : null;

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <>
            <p className="text-2xl font-semibold tabular-nums mb-3">
              {latestValue != null ? formatter(latestValue) : "—"}
            </p>
            <div
              className="h-[80px] w-full"
              role="img"
              aria-label={`${title} sparkline over the last ${data.length} minute${data.length === 1 ? "" : "s"}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <ReferenceLine
                    y={0}
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                  />
                  <Tooltip
                    content={(props) => (
                      <SparklineTooltip
                        active={props.active}
                        payload={props.payload as Array<{ value?: number }>}
                        formatter={formatter}
                      />
                    )}
                    cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "3 3" }}
                  />
                  <Line
                    type="monotone"
                    dataKey={dataKey as string}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3, fill: color }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-right">
              last {data.length} min
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Data appears after the first minute elapses.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TrendSection({ history }: { history: HistoryEntry[] }) {
  return (
    <section aria-labelledby="trends-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2
          id="trends-heading"
          className="text-lg font-semibold"
        >
          Trends
        </h2>
        <span className="text-xs text-muted-foreground">
          — per-minute aggregates, last ~15 min
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3" data-testid="trends-section">
        <SparklineCard
          title="Requests / min"
          description="Total HTTP requests received per minute."
          data={history}
          dataKey="requestsPerMin"
          formatter={(v) => `${v} req`}
          color="hsl(var(--chart-1))"
          testId="sparkline-requests"
        />
        <SparklineCard
          title="/api/check p95 latency"
          description="95th-percentile response time for /api/check at each minute boundary."
          data={history}
          dataKey="checkP95Ms"
          formatter={(v) => formatMs(v)}
          color="hsl(var(--chart-2))"
          testId="sparkline-check-p95"
        />
        <SparklineCard
          title="Cache hit-rate"
          description="HIBP breach-cache hit-rate during the minute (hits ÷ total lookups)."
          data={history}
          dataKey="cacheHitRate"
          formatter={(v) => `${(v * 100).toFixed(1)}%`}
          color="hsl(var(--chart-3))"
          testId="sparkline-cache-hit"
        />
      </div>
    </section>
  );
}

function RateLimitCard({ rl }: { rl: Metrics["rateLimit"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldOff className="w-4 h-4" />
          Rate Limiter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">
            Rejected (429) since startup
          </p>
          <p className="text-2xl font-semibold tabular-nums">{rl.rejected429}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Active policies</p>
          {rl.policies.length === 0 ? (
            <p className="text-xs text-muted-foreground">None registered</p>
          ) : (
            <ul className="space-y-1">
              {rl.policies.map((p) => (
                <li
                  key={p.endpoint}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="font-mono">{p.endpoint}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {p.max} / {Math.round(p.windowMs / 1000)}s
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Stats() {
  const { data, isLoading, isError, error } = useGetMetrics({
    query: {
      queryKey: getGetMetricsQueryKey(),
      refetchInterval: REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: false,
    },
  });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6 w-full">
      <header className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to checker
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
              <Gauge className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-sans">
                Performance metrics
              </h1>
              <p className="text-muted-foreground mt-1">
                Live in-memory snapshot of the API server. Refreshes every 5
                seconds.
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5 self-start">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Auto-refresh
          </Badge>
        </div>
        <p
          className="text-xs text-muted-foreground italic border border-dashed border-border/60 rounded-md px-3 py-2"
          data-testid="privacy-note"
        >
          Privacy: no identifiers (emails, passwords, hashes, IP addresses) are
          recorded anywhere on this page — only request paths, status codes,
          durations, and counters.
        </p>
      </header>

      {isLoading && (
        <p className="text-muted-foreground" data-testid="stats-loading">
          Loading metrics…
        </p>
      )}

      {isError && (
        <Card className="border-destructive">
          <CardContent className="p-5">
            <p className="text-destructive font-medium">
              Failed to load metrics
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {(error as Error | undefined)?.message ?? "Unknown error"}
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-6" data-testid="stats-content">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Server}
              label="Uptime"
              value={formatUptime(data.uptimeSeconds)}
              hint={`Started ${new Date(data.startedAt).toLocaleString()}`}
              testId="stat-uptime"
            />
            <StatCard
              icon={Activity}
              label="Total requests"
              value={data.requests.total}
              hint={`All HTTP requests since startup. Email: ${data.requests.checkByType.email} · Password: ${data.requests.checkByType.password}`}
              testId="stat-requests-total"
            />
            <StatCard
              icon={Globe}
              label="Errors"
              value={`${data.requests.errors4xx + data.requests.errors5xx}`}
              hint={`4xx: ${data.requests.errors4xx} · 5xx: ${data.requests.errors5xx}`}
              testId="stat-errors"
            />
            <StatCard
              icon={ShieldOff}
              label="Rate limited"
              value={data.requests.rateLimited429}
              hint="429 responses since startup"
              testId="stat-rate-limited"
            />
          </section>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-4 h-4" />
                Per-endpoint requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EndpointTable rows={data.requests.perEndpoint} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="w-4 h-4" />
                Latency (rolling window)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LatencyTable
                rows={[
                  {
                    label: "All HTTP requests",
                    stats: data.latency.allHttpMs,
                    testIdSuffix: "all-http",
                  },
                  {
                    label: "/api/check only",
                    stats: data.latency.checkMs,
                    testIdSuffix: "check",
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4" />
                External call performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExternalCallsTable rows={data.externalCalls} />
            </CardContent>
          </Card>

          <section className="grid md:grid-cols-2 gap-4">
            <CacheCard cache={data.hibpCache} />
            <RateLimitCard rl={data.rateLimit} />
          </section>

          <TrendSection history={data.history} />
        </div>
      )}
    </div>
  );
}
