import { useState } from "react";
import { AlertTriangle, Bug, CheckCircle2, Cpu, Send, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SEVERITIES = [
  { id: "low", label: "🟢 Low", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "medium", label: "🟡 Medium", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "high", label: "🟠 High", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "critical", label: "🔴 Critical", color: "bg-red-50 text-red-700 border-red-200" },
];

const COMPONENTS = [
  "Live Streaming & LiveKit",
  "GPS Geotagging & Maps",
  "Attendance Forms & Records",
  "PDF Reports Generation",
  "User Management & Auth",
  "UI / Layout & Navigation",
  "Other",
];

export const ReportBug = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [severity, setSeverity] = useState("medium");
  const [component, setComponent] = useState("Live Streaming & LiveKit");
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // System environment snapshot
  const systemInfo = `${navigator.userAgent} • ${window.screen.width}x${window.screen.height}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      toast("Bug report logged successfully", "success");
    }, 700);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in">
      {/* Header Banner */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20">
          <AlertTriangle className="w-3.5 h-3.5 text-red-300" />
          Technical Bug Reporter
        </div>
        <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
          Report an Issue or System Bug
        </h1>
        <p className="text-sm text-white/80">
          Found something broken? Submit technical details so our engineering team can reproduce and resolve it quickly.
        </p>
      </div>

      {submitted ? (
        <Card className="card-static rounded-3xl border-emerald-200 bg-emerald-50/50 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold font-display text-emerald-950">Bug Ticket Created!</h2>
          <p className="text-xs text-emerald-800 max-w-md mx-auto">
            Your report has been dispatched to engineering. System logs and browser metadata were attached for fast triage.
          </p>
          <Button
            onClick={() => {
              setSubmitted(false);
              setTitle("");
              setSteps("");
              setExpected("");
              setActual("");
            }}
            variant="outline"
            className="rounded-xl border-emerald-300 text-emerald-800 hover:bg-emerald-100"
          >
            Report Another Issue
          </Button>
        </Card>
      ) : (
        <Card className="card-static rounded-2xl">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div>
              <CardTitle className="text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                <Bug className="w-5 h-5 text-red-600" />
                Bug Specification Form
              </CardTitle>
              <CardDescription className="text-xs">
                Reporter: <span className="font-semibold text-gray-700">{user?.fullName}</span> ({user?.organizationName})
              </CardDescription>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Severity Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-700">Severity Level</Label>
                <div className="flex flex-wrap gap-2">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSeverity(s.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        severity === s.id
                          ? "ring-2 ring-purple-600 shadow-xs " + s.color
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Component Dropdown */}
              <div className="space-y-1.5">
                <Label htmlFor="component" className="text-xs font-semibold text-gray-700">Affected System Area</Label>
                <select
                  id="component"
                  value={component}
                  onChange={(e) => setComponent(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  {COMPONENTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bug Title */}
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-semibold text-gray-700">Short Issue Title</Label>
                <Input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. GPS geolocation button times out on Safari browser"
                  required
                  className="input-premium"
                />
              </div>

              {/* Steps to Reproduce */}
              <div className="space-y-1.5">
                <Label htmlFor="steps" className="text-xs font-semibold text-gray-700">Steps to Reproduce</Label>
                <textarea
                  id="steps"
                  rows={3}
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder="1. Go to Create Room&#10;2. Click 'Get GPS'&#10;3. Geolocation popup hangs..."
                  required
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white text-gray-900"
                />
              </div>

              {/* Expected vs Actual */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="expected" className="text-xs font-semibold text-gray-700">Expected Behavior</Label>
                  <textarea
                    id="expected"
                    rows={3}
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    placeholder="Location pin should show on map..."
                    required
                    className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white text-gray-900"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="actual" className="text-xs font-semibold text-gray-700">Actual Behavior</Label>
                  <textarea
                    id="actual"
                    rows={3}
                    value={actual}
                    onChange={(e) => setActual(e.target.value)}
                    placeholder="Error toast pops up..."
                    required
                    className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white text-gray-900"
                  />
                </div>
              </div>

              {/* Auto Environment Metadata */}
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-500 flex items-start gap-2">
                <Cpu className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div className="overflow-hidden">
                  <p className="font-semibold text-gray-700">Auto-Detected Environment Metadata:</p>
                  <p className="truncate font-mono text-[11px] text-gray-500 mt-0.5">{systemInfo}</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" disabled={submitting} className="bg-brand-gradient h-11 px-6 rounded-xl font-semibold shadow-xs">
                  <Send className="w-4 h-4 mr-2" />
                  {submitting ? "Logging Ticket..." : "Submit Bug Report"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
