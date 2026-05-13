import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MessageSquareText, Send } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const CONTACT_EMAIL = "pdec.contectus@gmail.com";

export default function Contact() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issueType, setIssueType] = useState("Bug report");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim()) {
      toast({ variant: "destructive", title: "Missing message", description: "Please describe your feedback." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueType, message, website }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(body.error || "Could not submit feedback.");
      }
      toast({ title: "Feedback sent", description: body.message || "Thank you for helping us improve." });
      setIssueType("Bug report");
      setMessage("");
      setWebsite("");
    } catch (error) {
      const eMsg = error instanceof Error ? error.message : "Could not submit feedback.";
      toast({ variant: "destructive", title: "Submission failed", description: eMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-10 px-4 space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to checker
      </Link>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <MessageSquareText className="w-5 h-5" />
            <CardTitle>Contact Us</CardTitle>
          </div>
          <CardDescription>
            Tell us what issue you faced while using the checker. Feedback is routed to {CONTACT_EMAIL}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="issueType">Issue type</Label>
              <select
                id="issueType"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option>Bug report</option>
                <option>Wrong breach result</option>
                <option>Slow response</option>
                <option>Feature request</option>
                <option>Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what happened, what you expected, and any steps to reproduce."
                rows={7}
                maxLength={3000}
                required
              />
            </div>

            <input
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              aria-hidden="true"
            />

            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : <span className="inline-flex items-center gap-2"><Send className="w-4 h-4" />Send Feedback</span>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
