import React from "react";
import { Link } from "wouter";
import { ShieldCheck, Activity } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: health, isLoading } = useHealthCheck();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-accent selection:text-white">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">PDEC</span>
          </Link>
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <Link
              href="/methodology"
              className="hidden sm:inline-block hover:text-foreground transition-colors"
              data-testid="nav-methodology"
            >
              Methodology
            </Link>
            <Link
              href="/contact"
              className="hidden sm:inline-block hover:text-foreground transition-colors"
              data-testid="nav-contact"
            >
              Contact
            </Link>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border/50">
              <Activity className="w-3.5 h-3.5" />
              {isLoading ? (
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
              ) : health?.status === "ok" ? (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  Systems Operational
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-destructive">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  Service Disrupted
                </span>
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <footer className="border-t border-border/50 py-8 bg-muted/30">
        <div className="container max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground space-y-2">
          <p>Academic Final Year Project • Personal Data Exposure Checker</p>
          <p className="opacity-70">Passwords use k-anonymity - only a partial hash is transmitted. No identifier is stored or logged.</p>
          <p className="opacity-70">
            <Link
              href="/contact"
              className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
              data-testid="footer-contact-link"
            >
              Contact Us
            </Link>
            <span className="mx-2">·</span>
            <Link
              href="/methodology"
              className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
              data-testid="footer-methodology-link"
            >
              Methodology
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
