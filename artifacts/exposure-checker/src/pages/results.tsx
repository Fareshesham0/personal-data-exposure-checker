import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Copy,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Download,
} from "lucide-react";

import { useExposure } from "@/lib/exposure-context";
import type {
  BreachEntry,
  RiskLevel,
  SeverityLevel,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScoreGauge } from "@/components/score-gauge";
import { FactorBreakdown } from "@/components/factor-breakdown";
import { StrengthMeter } from "@/components/strength-meter";
import { InsightsSection } from "@/components/insights-section";
import { analyzePassword } from "@/lib/password-strength";
import { downloadExposureReport } from "@/lib/pdf-report";

const RISK_COLOR: Record<RiskLevel, string> = {
  none: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  low: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  medium: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  high: "bg-red-500/10 text-red-600 border-red-500/20",
};

const RISK_LABEL: Record<RiskLevel, string> = {
  none: "Secure",
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

const SEVERITY_COLOR: Record<SeverityLevel, string> = {
  low: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  medium: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  high: "bg-red-500/10 text-red-600 border-red-500/30",
};

export default function Results() {
  const [, navigate] = useLocation();
  const {
    exposureResult,
    lastCheckedIdentifier,
    setExposureResult,
    lastCheckedPassword,
  } = useExposure();
  const { toast } = useToast();

  useEffect(() => {
    if (!exposureResult) {
      navigate("/");
    }
  }, [exposureResult, navigate]);

  if (!exposureResult) {
    return null;
  }

  const {
    exposed,
    breachCount,
    breaches,
    riskLevel,
    riskScore,
    riskExplanation,
    recommendations,
    factors,
    pwnedCount,
  } = exposureResult;

  const isPasswordCheck = !!pwnedCount || lastCheckedIdentifier === "a password";
  const passwordStrength =
    isPasswordCheck && lastCheckedPassword
      ? analyzePassword(lastCheckedPassword)
      : null;

  const maskIdentifier = (id: string | null) => {
    if (!id) return "";
    if (id.includes("@")) {
      const [local, domain] = id.split("@");
      if (local.length <= 2) return `${local[0]}***@${domain}`;
      return `${local.substring(0, 2)}***@${domain}`;
    }
    return "**** password checked";
  };

  const handleCheckAnother = () => {
    setExposureResult(null);
    navigate("/");
  };

  const handleDownloadPdf = () => {
    // Privacy guard: never include the plaintext password. Use the literal
    // "a password" placeholder for password checks; only emails are included.
    const reportIdentifier = isPasswordCheck
      ? "a password"
      : (lastCheckedIdentifier ?? "unknown");
    try {
      const filename = downloadExposureReport({
        result: exposureResult,
        identifier: reportIdentifier,
      });
      toast({
        title: "Report Downloaded",
        description: `Saved as ${filename}.`,
      });
    } catch (err) {
      toast({
        title: "Could not generate PDF",
        description:
          err instanceof Error ? err.message : "Unknown error generating PDF.",
        variant: "destructive",
      });
    }
  };

  const handleCopyReport = () => {
    const factorLine = factors
      ? `Factors: Frequency ${factors.frequency}/40 · Recency ${factors.recency}/30 · Sensitivity ${factors.sensitivity}/30\n`
      : "";
    const report = `Data Exposure Report\nStatus: ${exposed ? "Breaches Detected" : "No Breaches Found"}\nRisk Level: ${RISK_LABEL[riskLevel]}\nRisk Score: ${riskScore}/100\n${factorLine}Breaches: ${breachCount}\n\n${riskExplanation}`;
    navigator.clipboard.writeText(report).then(() => {
      toast({
        title: "Report Copied",
        description: "Summary copied to clipboard.",
      });
    });
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 w-full">
      {/* Summary Header */}
      <Card
        className={`border-2 ${
          exposed
            ? "border-red-500/20 shadow-red-500/5"
            : "border-emerald-500/20 shadow-emerald-500/5"
        } shadow-xl`}
      >
        <CardContent className="pt-6 pb-6 grid md:grid-cols-[auto,1fr,auto] items-center gap-6 text-center md:text-left">
          <div
            className={`p-4 rounded-full mx-auto md:mx-0 ${
              exposed
                ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-500"
                : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-500"
            }`}
          >
            {exposed ? (
              <ShieldAlert className="w-12 h-12" />
            ) : (
              <ShieldCheck className="w-12 h-12" />
            )}
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight font-sans">
              {exposed ? "Breaches Detected" : "No Breaches Found"}
            </h1>
            <p className="text-muted-foreground font-mono text-sm bg-muted/50 inline-block px-2 py-1 rounded">
              Checked: {maskIdentifier(lastCheckedIdentifier)}
            </p>
          </div>

          <div className="flex flex-col items-center gap-2 mx-auto md:mx-0">
            <ScoreGauge score={riskScore} level={riskLevel} />
            <Badge
              variant="outline"
              className={`px-3 py-1 text-sm font-bold border-2 ${RISK_COLOR[riskLevel]}`}
            >
              {RISK_LABEL[riskLevel]}
            </Badge>
          </div>
        </CardContent>

        <div className="bg-muted/30 border-t border-border px-6 py-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/90 leading-relaxed">
              {riskExplanation}
            </p>
          </div>
        </div>

        {/* Factor Breakdown — always shown for email checks; hidden for
            password checks because the score is single-dimension. */}
        {!isPasswordCheck && factors && (
          <div className="border-t border-border px-6 py-5 bg-muted/10">
            <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">
              Score breakdown
            </h2>
            <FactorBreakdown factors={factors} />
          </div>
        )}

        {/* Password strength meter — local zxcvbn estimate, only when we still
            hold the in-memory password from the just-completed check. */}
        {isPasswordCheck && passwordStrength && (
          <div className="border-t border-border px-6 py-5 bg-muted/10">
            <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide flex items-center gap-2">
              Password strength
              <Badge
                variant="outline"
                className="text-[10px] font-normal px-1.5 py-0 normal-case tracking-normal"
              >
                local estimate
              </Badge>
            </h2>
            <StrengthMeter strength={passwordStrength} />
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              This is an independent, second signal: even passwords that have
              not yet leaked can be weak. Computed locally in your browser with
              zxcvbn — the password was never sent for this analysis.
            </p>
          </div>
        )}

        {/* "How is this calculated?" disclosure */}
        <div className="border-t border-border px-6 py-3 bg-muted/5">
          <HowCalculated isPasswordCheck={isPasswordCheck} />
        </div>
      </Card>

      {/* Insights — only when we actually have breach records to chart. */}
      {exposed && breaches.length > 0 && (
        <InsightsSection breaches={breaches} factors={factors} />
      )}

      {/* Breach Details Section */}
      {exposed && breaches.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold font-sans">Breach Details</h2>
            <Badge variant="secondary" className="text-sm font-mono">
              {breachCount} Records
            </Badge>
          </div>

          <div className="grid gap-4">
            {breaches.map((breach, index) => (
              <BreachCard
                key={index}
                breach={breach}
                index={index}
                pwnedCount={pwnedCount}
              />
            ))}
          </div>
        </section>
      )}

      {/* Security Recommendations */}
      <section
        id="security-recommendations"
        aria-labelledby="security-recommendations-heading"
        className="space-y-4 scroll-mt-24"
      >
        <h2
          id="security-recommendations-heading"
          className="text-2xl font-bold font-sans"
        >
          Security Recommendations
        </h2>
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <ul className="space-y-4">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-foreground/90 leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8 border-t border-border/50">
        <Button
          size="lg"
          className="w-full sm:w-auto h-12 px-8 font-semibold"
          onClick={handleCheckAnother}
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Check Another
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:w-auto h-12 px-8 font-semibold"
          onClick={handleDownloadPdf}
          data-testid="download-pdf"
        >
          <Download className="w-5 h-5 mr-2" />
          Download report (PDF)
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:w-auto h-12 px-8 font-semibold"
          onClick={handleCopyReport}
        >
          <Copy className="w-5 h-5 mr-2" />
          Copy Report
        </Button>
      </div>
    </div>
  );
}

function HowCalculated({ isPasswordCheck }: { isPasswordCheck: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          data-testid="how-calculated-trigger"
        >
          <HelpCircle className="w-4 h-4" />
          How is this calculated?
          {open ? (
            <ChevronUp className="w-4 h-4 ml-auto" />
          ) : (
            <ChevronDown className="w-4 h-4 ml-auto" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="text-sm text-muted-foreground leading-relaxed mt-3 space-y-2">
        {isPasswordCheck ? (
          <p>
            Password risk is a single-dimension score derived from how many
            times the password appears in HIBP's Pwned Passwords corpus. Higher
            counts mean attackers actively use this password in
            credential-stuffing attacks.
          </p>
        ) : (
          <p>
            The 0–100 risk score is the sum of three weighted factors:{" "}
            <strong>Frequency</strong> (max 40, from the number of breaches),{" "}
            <strong>Recency</strong> (max 30, from the most recent breach
            date), and <strong>Sensitivity</strong> (max 30, from the average
            sensitivity of exposed data classes). Each individual breach below
            also has its own 0–100 severity badge.
          </p>
        )}
        <p>
          See the{" "}
          <Link
            href="/methodology"
            className="text-primary hover:underline font-medium"
          >
            full methodology page
          </Link>{" "}
          for the exact formulas, weight tables, k-anonymity protocol, data
          sources, and academic references.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function BreachCard({
  breach,
  index,
  pwnedCount,
}: {
  breach: BreachEntry;
  index: number;
  pwnedCount?: number | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card
      className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
      style={{ animationDelay: `${index * 80}ms` }}
      data-testid="breach-card"
    >
      <CardHeader className="pb-3 border-b border-border/20 bg-muted/10">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
              {breach.name}
              {breach.isVerified && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs px-1.5 py-0"
                >
                  Verified
                </Badge>
              )}
              {breach.isSensitive && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  Sensitive
                </Badge>
              )}
              {typeof breach.severityScore === "number" && breach.severityLevel && (
                <Badge
                  variant="outline"
                  className={`text-xs px-2 py-0 font-mono border ${SEVERITY_COLOR[breach.severityLevel]}`}
                  data-testid="breach-severity-badge"
                  title={`Per-breach severity score (0-100)`}
                >
                  Severity {breach.severityScore} · {breach.severityLevel}
                </Badge>
              )}
            </CardTitle>
            {breach.domain && (
              <p className="text-sm text-muted-foreground font-mono mt-1">
                {breach.domain}
              </p>
            )}
          </div>

          <div className="flex flex-wrap sm:flex-col gap-2 sm:gap-1 text-sm text-muted-foreground text-left sm:text-right">
            {breach.breachDate && (
              <span className="font-medium whitespace-nowrap">
                Breached:{" "}
                {new Date(breach.breachDate).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                })}
              </span>
            )}
            {breach.pwnCount ? (
              <span className="whitespace-nowrap">
                Accounts:{" "}
                <span className="font-mono text-foreground font-semibold">
                  {breach.pwnCount.toLocaleString()}
                </span>
              </span>
            ) : pwnedCount ? (
              <span className="whitespace-nowrap">
                Times seen:{" "}
                <span className="font-mono text-foreground font-semibold">
                  {pwnedCount.toLocaleString()}
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {breach.dataClasses.map((dc) => {
            const isHighRisk = [
              "Passwords",
              "Credit cards",
              "Social security numbers",
              "Personal health data",
              "Bank account numbers",
            ].includes(dc);
            return (
              <Badge
                key={dc}
                variant="outline"
                className={`text-xs ${
                  isHighRisk
                    ? "border-red-500/30 text-red-600 bg-red-500/5"
                    : "border-border/50 text-foreground/70"
                }`}
              >
                {dc}
              </Badge>
            );
          })}
        </div>

        {breach.description && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="text-sm text-foreground/80 leading-relaxed prose prose-sm max-w-none prose-a:text-primary dark:prose-invert">
              <p className={!isOpen ? "line-clamp-2" : ""}>{breach.description}</p>
            </div>

            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 p-0 text-primary hover:bg-transparent hover:text-primary/80 mt-2 font-medium"
              >
                {isOpen ? (
                  <>
                    Read less <ChevronUp className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    Read more <ChevronDown className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
