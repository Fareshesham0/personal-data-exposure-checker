import { Link } from "wouter";
import { ArrowLeft, ShieldCheck, BookOpen, Lock, Database, ScrollText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function Methodology() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 w-full">
      <header className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to checker
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-sans">
              Methodology
            </h1>
            <p className="text-muted-foreground mt-1">
              How risk scores, severity, and privacy are calculated.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Need help or want to report an issue?{" "}
          <Link
            href="/contact"
            className="text-primary hover:underline underline-offset-2"
            data-testid="methodology-contact-link"
          >
            Contact us
          </Link>
          .
        </p>
      </header>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            Overall Risk Score (Email Checks)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            For an email address, the overall risk score is a deterministic
            function of three factors. Each factor is computed independently and
            summed, then capped at 100:
          </p>
          <pre className="rounded-md bg-muted px-4 py-3 overflow-x-auto text-xs font-mono">
{`riskScore = min(frequency + recency + sensitivity, 100)`}
          </pre>
          <div className="space-y-3">
            <FormulaRow
              label="frequency"
              formula="min(numBreaches × 8, 40)"
              max={40}
              note="Number of distinct breaches the email appears in."
            />
            <FormulaRow
              label="recency"
              formula="< 6 months → 30 · < 1 year → 20 · < 2 years → 10 · older → 5"
              max={30}
              note="Based on the most recent breach date."
            />
            <FormulaRow
              label="sensitivity"
              formula="(avg(sensitivityWeight(breach.dataClasses), capped at 15) ÷ 15) × 30"
              max={30}
              note="Average sensitivity of exposed data classes across all breaches."
            />
          </div>
          <p>The qualitative bucket is then derived from the numeric score:</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Bucket label="None" range="0" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20" />
            <Bucket label="Low" range="1 – 29" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20" />
            <Bucket label="Medium" range="30 – 59" className="bg-orange-500/10 text-orange-600 border-orange-500/20" />
            <Bucket label="High" range="60 – 100" className="bg-red-500/10 text-red-600 border-red-500/20" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            Password Risk Score
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            Password scoring is based on how often the password has been seen in
            breach corpora collected by Have I Been Pwned (Pwned Passwords). It
            is a single-dimension score, so the factor breakdown is hidden in the
            UI (the API still returns a <code className="font-mono">factors</code>
            object with all three contributions equal to zero, for schema
            consistency).
          </p>
          <p>
            <strong>Independent strength estimate (zxcvbn).</strong> Alongside
            the breach lookup, a second, independent signal is shown: a local
            estimate of password strength produced by{" "}
            <code className="font-mono">zxcvbn</code> (Wheeler, 2016). zxcvbn
            returns an integer score from <strong>0 (Very Weak)</strong> to{" "}
            <strong>4 (Very Strong)</strong> based on dictionary matches,
            keyboard patterns, and entropy, and yields an estimated offline
            crack-time. This computation runs entirely in the browser — the
            password is never sent to the server for strength analysis (the
            breach lookup separately uses k-anonymity, sending only a 5-char
            SHA-1 prefix). A password can be Strong by zxcvbn but still appear
            in HIBP, or Weak yet not (yet) appear in any leak — the two signals
            answer different questions and are best read together.
          </p>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Times seen</th>
                  <th className="text-left px-3 py-2 font-semibold">Score</th>
                  <th className="text-left px-3 py-2 font-semibold">Bucket</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 100,000</td><td className="px-3 py-2">95</td><td className="px-3 py-2">High</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 10,000</td><td className="px-3 py-2">80</td><td className="px-3 py-2">High</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 1,000</td><td className="px-3 py-2">60</td><td className="px-3 py-2">Medium</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 100</td><td className="px-3 py-2">40</td><td className="px-3 py-2">Medium</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">1 – 99</td><td className="px-3 py-2">25</td><td className="px-3 py-2">Low</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">0</td><td className="px-3 py-2">0</td><td className="px-3 py-2">None</td></tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            Per-Breach Severity Score
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            Each individual breach also receives its own 0–100 severity score so
            you can prioritise which breach to act on first. The formula is:
          </p>
          <pre className="rounded-md bg-muted px-4 py-3 overflow-x-auto text-xs font-mono">
{`severity = min(sensitivity + recency + scale, 100)
  where:
    sensitivity = (sensitivityWeight(dataClasses) / 15) × 50    // 0 – 50
    recency     = age-bucketed points (see "recency" above)     // 0 – 30
    scale       = PwnCount-bucketed points                      // 0 – 20`}
          </pre>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Accounts in breach (PwnCount)</th>
                  <th className="text-left px-3 py-2 font-semibold">Scale points</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 100,000,000</td><td className="px-3 py-2">20</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 10,000,000</td><td className="px-3 py-2">15</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 1,000,000</td><td className="px-3 py-2">10</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">≥ 10,000</td><td className="px-3 py-2">5</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">&lt; 10,000</td><td className="px-3 py-2">0</td></tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            Data-Class Sensitivity Weights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            Every data class exposed in a breach contributes a weight to that
            breach's sensitivity sum (capped at 15 per breach so a single
            breach cannot dominate the average):
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <WeightCard
              tier="High"
              weight={3.0}
              tone="bg-red-500/10 text-red-600 border-red-500/20"
              items={[
                "Passwords",
                "Password hints",
                "Security questions and answers",
                "Credit cards",
                "Banking details",
                "Payment histories",
                "Social security numbers",
                "Government issued IDs",
              ]}
            />
            <WeightCard
              tier="Medium"
              weight={1.5}
              tone="bg-orange-500/10 text-orange-600 border-orange-500/20"
              items={[
                "Phone numbers",
                "Physical addresses",
                "Dates of birth",
                "Financial data",
                "Health & fitness data",
                "Medical records",
                "Bank account numbers",
                "IP addresses",
              ]}
            />
            <WeightCard
              tier="Low"
              weight={0.5}
              tone="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
              items={["Everything else (e.g. usernames, email addresses, names)"]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            k-Anonymity for Password Checks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Password lookups never transmit the raw password — or even its full
            hash — to any external service. Following Cloudflare and HIBP's
            published k-anonymity protocol, only the first 5 characters of the
            SHA-1 hash leave the server. The remote service returns the list of
            <em> all </em> hash suffixes that share that prefix (typically
            ~800 entries per range). The match check happens locally:
          </p>
          <KAnonymityDiagram />
          <p>
            This guarantees that the breach API never sees the user's password
            or its full hash, and cannot tell which specific password was
            checked from any single request — only that someone checked
            something whose hash begins with that 5-character prefix.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Data Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <ul className="space-y-2 list-disc list-inside">
            <li>
              <strong>HIBP Public Breach List</strong> (
              <code className="text-xs font-mono">/api/v3/breaches</code>) —
              curated metadata for all known breaches: name, date, affected
              account count, exposed data classes. Cached server-side for
              1 hour to minimise upstream load.
            </li>
            <li>
              <strong>XposedOrNot</strong> (
              <code className="text-xs font-mono">/v1/check-email/&lt;email&gt;</code>) —
              free per-email lookup that returns the names of breaches the
              address appears in. Combined with the HIBP metadata above to
              produce the breach details shown.
            </li>
            <li>
              <strong>HIBP Pwned Passwords</strong> (
              <code className="text-xs font-mono">/range/&lt;5-char prefix&gt;</code>) —
              k-anonymity range lookup over a corpus of more than 850 million
              previously breached passwords.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            All external HTTP calls have an 8–10 second timeout to fail fast
            under upstream degradation.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Privacy Guarantees
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          <ul className="space-y-2 list-disc list-inside">
            <li>No identifier (email or password) is persisted to disk or any database.</li>
            <li>Server logs explicitly redact request bodies and identifiers — only method, URL path, status, and duration are recorded.</li>
            <li>For password checks, only the first 5 characters of a SHA-1 hash are transmitted externally.</li>
            <li>The frontend masks the checked identifier after the lookup completes (passwords become the literal string <code className="text-xs font-mono">"a password"</code> in client memory).</li>
            <li>Helmet sets safe HTTP headers; per-IP rate limiting protects the upstream APIs and the user from abuse.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            References
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <ol className="space-y-3 list-decimal list-inside">
            <li>
              Ali, J. (2018). <em>Validating leaked passwords with k-Anonymity.</em>{" "}
              <a
                href="https://blog.cloudflare.com/validating-leaked-passwords-with-k-anonymity/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                blog.cloudflare.com/validating-leaked-passwords-with-k-anonymity
              </a>
            </li>
            <li>
              Hunt, T. <em>Have I Been Pwned API v3 documentation.</em>{" "}
              <a
                href="https://haveibeenpwned.com/API/v3"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                haveibeenpwned.com/API/v3
              </a>
            </li>
            <li>
              National Institute of Standards and Technology (2017).{" "}
              <em>NIST Special Publication 800-63B — Digital Identity Guidelines: Authentication and Lifecycle Management.</em>{" "}
              <a
                href="https://pages.nist.gov/800-63-3/sp800-63b.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                pages.nist.gov/800-63-3/sp800-63b.html
              </a>
            </li>
            <li>
              European Parliament &amp; Council (2016).{" "}
              <em>Regulation (EU) 2016/679 (General Data Protection Regulation), Article 32 — Security of processing.</em>{" "}
              <a
                href="https://gdpr-info.eu/art-32-gdpr/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                gdpr-info.eu/art-32-gdpr
              </a>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function FormulaRow({
  label,
  formula,
  max,
  note,
}: {
  label: string;
  formula: string;
  max: number;
  note: string;
}) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <code className="text-xs font-mono font-semibold text-primary">
          {label}
        </code>
        <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
          max {max}
        </span>
      </div>
      <pre className="mt-1 text-xs font-mono text-foreground/90 whitespace-pre-wrap break-words">
        {formula}
      </pre>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Bucket({
  label,
  range,
  className,
}: {
  label: string;
  range: string;
  className: string;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${className}`}>
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-xs font-mono opacity-80 mt-0.5">{range}</div>
    </div>
  );
}

function WeightCard({
  tier,
  weight,
  tone,
  items,
}: {
  tier: string;
  weight: number;
  tone: string;
  items: string[];
}) {
  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold">{tier}</span>
        <Badge variant="outline" className="bg-background/50 font-mono text-xs">
          ×{weight.toFixed(1)}
        </Badge>
      </div>
      <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function KAnonymityDiagram() {
  const nodes = [
    { x: 60, label: "Browser", sub: "raw password" },
    { x: 230, label: "PDEC server", sub: "SHA-1(pw)" },
    { x: 410, label: "Send prefix", sub: "first 5 hex chars" },
    { x: 590, label: "HIBP API", sub: "/range/{prefix}" },
    { x: 770, label: "Local match", sub: "compare suffixes" },
  ];
  const boxW = 130;
  const boxH = 64;
  const boxY = 70;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-4 space-y-4">
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 900 220"
          role="img"
          aria-labelledby="kanon-title kanon-desc"
          className="w-full h-auto min-w-[640px] text-foreground"
        >
          <title id="kanon-title">k-Anonymity password lookup flow</title>
          <desc id="kanon-desc">
            Browser sends raw password to PDEC over TLS. PDEC computes SHA-1
            locally, transmits only the first 5 hex characters of the hash to
            the HIBP range API, then matches the returned hash suffixes
            locally. The remote service never sees the password or its full
            hash.
          </desc>

          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
            </marker>
          </defs>

          {nodes.map((node, i) => {
            const isExternal = node.label === "HIBP API";
            return (
              <g key={node.label}>
                <rect
                  x={node.x}
                  y={boxY}
                  width={boxW}
                  height={boxH}
                  rx="8"
                  ry="8"
                  className={
                    isExternal
                      ? "fill-orange-500/10 stroke-orange-500/60"
                      : "fill-primary/5 stroke-primary/40"
                  }
                  strokeWidth="1.5"
                />
                <text
                  x={node.x + boxW / 2}
                  y={boxY + 26}
                  textAnchor="middle"
                  className="text-[13px] font-semibold fill-current"
                >
                  {node.label}
                </text>
                <text
                  x={node.x + boxW / 2}
                  y={boxY + 46}
                  textAnchor="middle"
                  className="text-[11px] fill-muted-foreground font-mono"
                >
                  {node.sub}
                </text>
                <text
                  x={node.x + boxW / 2}
                  y={boxY - 8}
                  textAnchor="middle"
                  className="text-[10px] fill-muted-foreground uppercase tracking-wider"
                >
                  Step {i + 1}
                </text>
                {i < nodes.length - 1 && (
                  <line
                    x1={node.x + boxW + 4}
                    y1={boxY + boxH / 2}
                    x2={nodes[i + 1].x - 4}
                    y2={boxY + boxH / 2}
                    className="stroke-primary"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                  />
                )}
              </g>
            );
          })}

          <text
            x={(60 + 230 + boxW) / 2 + boxW / 2 - 5}
            y={boxY + boxH + 22}
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground italic"
          >
            over TLS
          </text>
          <text
            x={(410 + 590 + boxW) / 2 + boxW / 2 - 5}
            y={boxY + boxH + 22}
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground italic"
          >
            no full hash leaves PDEC
          </text>
          <text
            x={(590 + 770 + boxW) / 2 + boxW / 2 - 5}
            y={boxY + boxH + 22}
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground italic"
          >
            ~800 suffixes returned
          </text>
        </svg>
      </div>

      <ol className="space-y-2 text-xs sr-only md:not-sr-only">
        <li><span className="font-semibold text-foreground">1.</span> Browser submits the password to PDEC over TLS — it never reaches a third party.</li>
        <li><span className="font-semibold text-foreground">2.</span> PDEC computes <code className="font-mono">SHA-1(password)</code> locally (40 hex characters).</li>
        <li><span className="font-semibold text-foreground">3.</span> Only the first 5 hex characters of the hash are sent to HIBP (<code className="font-mono">GET /range/AABBC</code>).</li>
        <li><span className="font-semibold text-foreground">4.</span> HIBP returns ~800 hash suffixes that share that prefix, each with a count.</li>
        <li><span className="font-semibold text-foreground">5.</span> PDEC compares the suffix locally — if it matches, return the count to the user; otherwise no exposure.</li>
      </ol>
    </div>
  );
}
