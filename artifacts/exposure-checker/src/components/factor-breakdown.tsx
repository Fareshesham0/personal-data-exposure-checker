import type { RiskFactors } from "@workspace/api-client-react";

interface FactorBreakdownProps {
  factors: RiskFactors;
}

const FACTOR_ROWS: Array<{
  key: keyof RiskFactors;
  label: string;
  max: number;
  description: string;
  colorClass: string;
}> = [
  {
    key: "frequency",
    label: "Frequency",
    max: 40,
    description: "How many breaches your email appears in",
    colorClass: "bg-orange-500",
  },
  {
    key: "recency",
    label: "Recency",
    max: 30,
    description: "How recent the most recent breach is",
    colorClass: "bg-red-500",
  },
  {
    key: "sensitivity",
    label: "Sensitivity",
    max: 30,
    description: "How sensitive the exposed data classes are",
    colorClass: "bg-yellow-500",
  },
];

export function FactorBreakdown({ factors }: FactorBreakdownProps) {
  return (
    <div className="space-y-3" data-testid="factor-breakdown">
      {FACTOR_ROWS.map((row) => {
        const value = Math.max(0, Math.min(factors[row.key] ?? 0, row.max));
        const pct = (value / row.max) * 100;
        return (
          <div key={row.key} data-testid={`factor-${row.key}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {value} <span className="opacity-60">/ {row.max}</span>
              </span>
            </div>
            <div
              className="mt-1.5 h-2 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={value}
              aria-valuemin={0}
              aria-valuemax={row.max}
              aria-label={row.label}
            >
              <div
                className={`h-full ${row.colorClass} transition-all duration-700 ease-out`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
          </div>
        );
      })}
    </div>
  );
}
