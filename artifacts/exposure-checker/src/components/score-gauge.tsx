import type { RiskLevel } from "@workspace/api-client-react";

interface ScoreGaugeProps {
  score: number;
  level: RiskLevel;
  size?: number;
}

const LEVEL_COLOR: Record<RiskLevel, string> = {
  none: "text-emerald-500",
  low: "text-yellow-500",
  medium: "text-orange-500",
  high: "text-red-500",
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  none: "Secure",
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

export function ScoreGauge({ score, level, size = 144 }: ScoreGaugeProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const filled = (clamped / 100) * circumference;
  const colorClass = LEVEL_COLOR[level];

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Risk score ${clamped} out of 100, ${LEVEL_LABEL[level]}`}
      data-testid="score-gauge"
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-muted-foreground/15"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={`${colorClass} transition-all duration-700 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-3xl font-bold tabular-nums ${colorClass}`}
          data-testid="score-gauge-value"
        >
          {clamped}
        </span>
        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}
