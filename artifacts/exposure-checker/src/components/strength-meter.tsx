import { Clock, AlertTriangle } from "lucide-react";
import type { PasswordStrength, StrengthScore } from "@/lib/password-strength";

const SEGMENT_COLOR: Record<StrengthScore, string> = {
  0: "bg-red-500",
  1: "bg-orange-500",
  2: "bg-yellow-500",
  3: "bg-lime-500",
  4: "bg-emerald-500",
};

const LABEL_COLOR: Record<StrengthScore, string> = {
  0: "text-red-600",
  1: "text-orange-600",
  2: "text-yellow-600",
  3: "text-lime-600",
  4: "text-emerald-600",
};

interface Props {
  strength: PasswordStrength;
  compact?: boolean;
}

export function StrengthMeter({ strength, compact = false }: Props) {
  const filled = strength.score + 1;
  // Warning + suggestions are only useful while the password is still weak;
  // hide them once the score crosses into Strong (3+) to avoid noise.
  const showFeedback = strength.score <= 2;
  const topSuggestions = showFeedback ? strength.suggestions.slice(0, 2) : [];
  const showWarning = showFeedback && !!strength.warning;

  return (
    <div
      className="space-y-2 w-full"
      data-testid="strength-meter"
      data-strength-score={strength.score}
    >
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < filled ? SEGMENT_COLOR[strength.score] : "bg-muted"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span
          className={`font-semibold ${LABEL_COLOR[strength.score]}`}
          data-testid="strength-label"
        >
          {strength.label}
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span data-testid="strength-crack-time">~{strength.crackTime}</span>
        </span>
      </div>

      {!compact && showWarning && (
        <div className="flex items-start gap-1.5 text-xs text-orange-600">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{strength.warning}</span>
        </div>
      )}

      {!compact && topSuggestions.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1 pl-1">
          {topSuggestions.map((s, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden="true">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
