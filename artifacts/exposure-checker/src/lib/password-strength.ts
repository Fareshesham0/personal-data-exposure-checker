import { useEffect, useState } from "react";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthScore;
  label: string;
  crackTime: string;
  suggestions: string[];
  warning: string;
}

const SCORE_LABELS: Record<StrengthScore, string> = {
  0: "Very Weak",
  1: "Weak",
  2: "Fair",
  3: "Strong",
  4: "Very Strong",
};

let configured = false;

function ensureConfigured() {
  if (configured) return;
  zxcvbnOptions.setOptions({
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
  });
  configured = true;
}

export function analyzePassword(password: string): PasswordStrength | null {
  if (!password) return null;
  ensureConfigured();
  const result = zxcvbn(password);
  const score = result.score as StrengthScore;
  return {
    score,
    label: SCORE_LABELS[score],
    crackTime: String(
      result.crackTimesDisplay.offlineSlowHashing1e4PerSecond,
    ),
    suggestions: result.feedback.suggestions ?? [],
    warning: result.feedback.warning ?? "",
  };
}

export function usePasswordStrength(
  password: string,
  debounceMs = 150,
): PasswordStrength | null {
  const [strength, setStrength] = useState<PasswordStrength | null>(() =>
    analyzePassword(password),
  );

  useEffect(() => {
    if (!password) {
      setStrength(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setStrength(analyzePassword(password));
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [password, debounceMs]);

  return strength;
}
