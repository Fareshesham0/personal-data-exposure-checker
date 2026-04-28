import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ShieldCheck, Mail, Lock, Eye, EyeOff, Search, LockKeyhole, Zap } from "lucide-react";

import { useCheckExposure } from "@workspace/api-client-react";
import { useExposure } from "@/lib/exposure-context";
import { usePasswordStrength } from "@/lib/password-strength";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { StrengthMeter } from "@/components/strength-meter";

const emailSchema = z.object({
  identifier: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  identifier: z.string().min(1, "Password is required"),
});

export default function Home() {
  const [, navigate] = useLocation();
  const { setExposureResult, setLastCheckedIdentifier, setLastCheckedPassword } =
    useExposure();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"email" | "password">("email");
  const [showPassword, setShowPassword] = useState(false);

  const checkExposure = useCheckExposure();

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { identifier: "" },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { identifier: "" },
  });

  const onSubmit = (values: { identifier: string }, type: "email" | "password") => {
    checkExposure.mutate(
      { data: { identifier: values.identifier, identifierType: type } },
      {
        onSuccess: (result) => {
          setExposureResult(result);
          setLastCheckedIdentifier(type === "password" ? "a password" : values.identifier);
          setLastCheckedPassword(type === "password" ? values.identifier : null);
          navigate("/results");
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Check Failed",
            description: "An error occurred while checking exposure. Please try again.",
          });
        },
      }
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] py-12 px-4 space-y-12">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-6">
        <Badge variant="outline" className="px-3 py-1 text-sm font-medium border-primary/20 bg-primary/5 text-primary">
          Scan. Assess. Protect.
        </Badge>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight font-sans text-foreground">
          Check if your data has been <span className="text-primary">exposed</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Instantly check if your email or password has appeared in known data breaches.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 w-fit mx-auto px-4 py-2 rounded-full border border-border/50">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Your data is processed securely and never stored or logged</span>
        </div>
      </section>

      {/* Check Form Card */}
      <Card className="w-full max-w-md shadow-xl shadow-primary/5 border-primary/10">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "email" | "password")}>
          <CardHeader className="space-y-4 pb-4">
            <TabsList className="grid w-full grid-cols-2 p-1">
              <TabsTrigger value="email" className="flex items-center gap-2 font-medium">
                <Mail className="w-4 h-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="password" className="flex items-center gap-2 font-medium">
                <Lock className="w-4 h-4" />
                Password
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>
            <TabsContent value="email" className="mt-0">
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit((data) => onSubmit(data, "email"))} className="space-y-4">
                  <FormField
                    control={emailForm.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Email Address</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                            <Input
                              placeholder="you@example.com"
                              className="pl-10 h-12 text-base"
                              {...field}
                              disabled={checkExposure.isPending}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={checkExposure.isPending}>
                    {checkExposure.isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                        Checking...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Search className="w-5 h-5" />
                        Check Exposure
                      </span>
                    )}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="password" className="mt-0">
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit((data) => onSubmit(data, "password"))} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter password to check"
                              className="pl-10 pr-10 h-12 text-base font-mono"
                              {...field}
                              disabled={checkExposure.isPending}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setShowPassword(!showPassword)}
                              disabled={checkExposure.isPending}
                            >
                              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                        <LiveStrengthMeter password={field.value} />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={checkExposure.isPending}>
                    {checkExposure.isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                        Checking...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Search className="w-5 h-5" />
                        Check Exposure
                      </span>
                    )}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* How it works section */}
      <section className="w-full max-w-5xl mx-auto pt-12">
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Enter Your Data</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                Provide an email address or password. We'll cross-reference it against billions of known breached records.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <LockKeyhole className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Privacy-First</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                Passwords are checked using k-anonymity — only a partial hash prefix is sent to breach databases, never the raw password. Email checks use normalised lookups with no data retained.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Instant Results</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                Get immediate feedback, detailed breach information, and a comprehensive risk score with actionable advice.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function LiveStrengthMeter({ password }: { password: string }) {
  const strength = usePasswordStrength(password);
  if (!password || !strength) return null;
  return (
    <div className="pt-2">
      <StrengthMeter strength={strength} />
      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
        Strength is estimated locally in your browser using zxcvbn — your
        password is never sent for this analysis.
      </p>
    </div>
  );
}
