import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Loader2, Play, Activity, Copy } from "lucide-react";

type Status = "pass" | "warn" | "fail";

interface SystemCheck {
  name: string;
  status: Status;
  ms: number;
  detail: string;
}
interface SystemReport {
  overall: Status;
  timestamp: string;
  checks: SystemCheck[];
}

interface FunctionalStep {
  name: string;
  status: "pass" | "fail";
  ms: number;
  detail: string;
}
interface FunctionalReport {
  overall: "pass" | "fail";
  timestamp: string;
  steps: FunctionalStep[];
}

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function StatusIcon({ status }: { status: Status | "pending" }) {
  if (status === "pass") return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
  if (status === "warn") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  if (status === "fail") return <XCircle className="w-5 h-5 text-destructive" />;
  return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
}

function banner(status: Status | "fail" | "pass" | "warn"): string {
  if (status === "pass") return "bg-emerald-50 border-emerald-600 text-emerald-900";
  if (status === "warn") return "bg-amber-50 border-amber-600 text-amber-900";
  return "bg-red-50 border-destructive text-destructive";
}

export default function Diagnostics() {
  const [, setLocation] = useLocation();
  const [sysReport, setSysReport] = useState<SystemReport | null>(null);
  const [sysLoading, setSysLoading] = useState(false);
  const [sysError, setSysError] = useState("");

  const [fnReport, setFnReport] = useState<FunctionalReport | null>(null);
  const [fnLoading, setFnLoading] = useState(false);
  const [fnError, setFnError] = useState("");

  const runSystem = async () => {
    setSysLoading(true);
    setSysError("");
    setSysReport(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSysReport((await res.json()) as SystemReport);
    } catch (e) {
      setSysError(e instanceof Error ? e.message : String(e));
    } finally {
      setSysLoading(false);
    }
  };

  const runFunctional = async () => {
    setFnLoading(true);
    setFnError("");
    setFnReport(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostics/functional`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFnReport((await res.json()) as FunctionalReport);
    } catch (e) {
      setFnError(e instanceof Error ? e.message : String(e));
    } finally {
      setFnLoading(false);
    }
  };

  const copyReport = () => {
    const lines: string[] = [`DIAGNOSTIC REPORT · ${new Date().toISOString()}`, ""];
    if (sysReport) {
      lines.push(`SYSTEM CHECK (overall: ${sysReport.overall.toUpperCase()})`);
      for (const c of sysReport.checks) {
        lines.push(`  [${c.status.toUpperCase()}] ${c.name} (${c.ms}ms) — ${c.detail}`);
      }
      lines.push("");
    }
    if (fnReport) {
      lines.push(`FUNCTIONAL CHECK (overall: ${fnReport.overall.toUpperCase()})`);
      for (const s of fnReport.steps) {
        lines.push(`  [${s.status.toUpperCase()}] ${s.name} (${s.ms}ms) — ${s.detail}`);
      }
    }
    navigator.clipboard.writeText(lines.join("\n"));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Button variant="ghost" className="mb-8 font-mono uppercase tracking-wider" onClick={() => setLocation("/")}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="mb-10 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl font-serif font-black uppercase mb-2 flex items-center gap-3">
            <Activity className="w-10 h-10" /> Diagnostics
          </h1>
          <p className="font-mono text-muted-foreground uppercase tracking-widest text-sm">
            System checks · End-to-end walk · No mocks
          </p>
        </div>
        {(sysReport || fnReport) && (
          <Button variant="outline" onClick={copyReport} className="font-mono uppercase tracking-wider">
            <Copy className="w-4 h-4 mr-2" /> Copy report
          </Button>
        )}
      </div>

      {/* System check section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4 border-b-4 border-border pb-3">
          <h2 className="text-2xl font-serif font-black uppercase">System Check</h2>
          <Button onClick={runSystem} disabled={sysLoading} className="font-mono uppercase tracking-wider">
            {sysLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Run</>
            )}
          </Button>
        </div>
        {sysError && (
          <div className={`border-4 p-4 mb-4 font-mono ${banner("fail")}`}>
            Could not reach backend: {sysError}
          </div>
        )}
        {sysReport && (
          <>
            <div className={`border-4 p-4 mb-4 font-mono uppercase tracking-wider font-bold ${banner(sysReport.overall)}`}>
              Overall: {sysReport.overall} · {sysReport.checks.length} checks · {new Date(sysReport.timestamp).toLocaleTimeString()}
            </div>
            <div className="border-4 border-border divide-y-4 divide-border">
              {sysReport.checks.map((c) => (
                <div key={c.name} className="p-4 flex items-start gap-4">
                  <StatusIcon status={c.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="font-bold uppercase tracking-wider">{c.name}</div>
                      <div className="font-mono text-xs text-muted-foreground shrink-0">{c.ms}ms</div>
                    </div>
                    <div className="font-mono text-sm text-muted-foreground break-words mt-1">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {!sysReport && !sysError && !sysLoading && (
          <div className="border-4 border-dashed border-border p-8 text-center font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Press Run to check server, env vars, DB, schema, Venice + DeepSeek APIs.
          </div>
        )}
      </section>

      {/* Functional / end-to-end check section */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b-4 border-border pb-3">
          <h2 className="text-2xl font-serif font-black uppercase">End-to-End Walk</h2>
          <Button onClick={runFunctional} disabled={fnLoading} className="font-mono uppercase tracking-wider">
            {fnLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Walking</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Run</>
            )}
          </Button>
        </div>
        <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Creates a synthetic 1-panel novel, exercises GET/POST/regenerate/DELETE, tears itself down.
          Hits real API routes over loopback.
        </p>
        {fnError && (
          <div className={`border-4 p-4 mb-4 font-mono ${banner("fail")}`}>
            Walk could not start: {fnError}
          </div>
        )}
        {fnReport && (
          <>
            <div className={`border-4 p-4 mb-4 font-mono uppercase tracking-wider font-bold ${banner(fnReport.overall)}`}>
              Overall: {fnReport.overall} · {fnReport.steps.length} steps · {new Date(fnReport.timestamp).toLocaleTimeString()}
            </div>
            <div className="border-4 border-border divide-y-4 divide-border">
              {fnReport.steps.map((s, i) => (
                <div key={i} className="p-4 flex items-start gap-4">
                  <StatusIcon status={s.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="font-bold uppercase tracking-wider">{i + 1}. {s.name}</div>
                      <div className="font-mono text-xs text-muted-foreground shrink-0">{s.ms}ms</div>
                    </div>
                    <div className="font-mono text-sm text-muted-foreground break-words mt-1">{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {!fnReport && !fnError && !fnLoading && (
          <div className="border-4 border-dashed border-border p-8 text-center font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Press Run to walk the API end-to-end.
          </div>
        )}
      </section>
    </div>
  );
}
