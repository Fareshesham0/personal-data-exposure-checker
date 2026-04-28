import React, { createContext, useContext, useState, ReactNode } from "react";
import type { ExposureResult, CheckExposureBody } from "@workspace/api-client-react";

interface ExposureContextType {
  exposureResult: ExposureResult | null;
  setExposureResult: (result: ExposureResult | null) => void;
  lastCheckedIdentifier: string | null;
  setLastCheckedIdentifier: (identifier: string | null) => void;
  // Held in memory only (never persisted) so the results page can render the
  // zxcvbn strength meter for a just-checked password. Cleared whenever the
  // exposure result is cleared (e.g. "Check Another").
  lastCheckedPassword: string | null;
  setLastCheckedPassword: (password: string | null) => void;
}

const ExposureContext = createContext<ExposureContextType | undefined>(undefined);

export function ExposureProvider({ children }: { children: ReactNode }) {
  const [exposureResult, setExposureResultState] = useState<ExposureResult | null>(null);
  const [lastCheckedIdentifier, setLastCheckedIdentifier] = useState<string | null>(null);
  const [lastCheckedPassword, setLastCheckedPassword] = useState<string | null>(null);

  const setExposureResult = (result: ExposureResult | null) => {
    setExposureResultState(result);
    if (result === null) {
      setLastCheckedPassword(null);
    }
  };

  return (
    <ExposureContext.Provider
      value={{
        exposureResult,
        setExposureResult,
        lastCheckedIdentifier,
        setLastCheckedIdentifier,
        lastCheckedPassword,
        setLastCheckedPassword,
      }}
    >
      {children}
    </ExposureContext.Provider>
  );
}

export function useExposure() {
  const context = useContext(ExposureContext);
  if (context === undefined) {
    throw new Error("useExposure must be used within an ExposureProvider");
  }
  return context;
}
