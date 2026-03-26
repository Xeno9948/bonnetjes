"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { Header } from "@/components/header";
import {
  Plus, Play, Trash2, Edit3, Check, X, Zap, ChevronRight,
  MousePointer, Keyboard, Navigation, Eye, ToggleLeft, Copy,
  AlertCircle, Loader2, Shield, Camera
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────────────

type StepType = "navigate" | "click" | "type" | "waitForSelector" | "screenshot" | "select" | "pressKey";

interface WorkflowStep {
  id: string;
  type: StepType;
  selector?: string;
  value?: string;
  url?: string;
  description: string;
  isVariable?: boolean;
  variableName?: string;
}

interface Workflow {
  id: string;
  name: string;
  platform: "kiyoh" | "kv";
  description?: string;
  steps: WorkflowStep[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionStep {
  description: string;
  type: string;
  status: "ok" | "error";
  error?: string;
  screenshot?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STEP_ICONS: Record<StepType, any> = {
  navigate:        Navigation,
  click:           MousePointer,
  type:            Keyboard,
  waitForSelector: Eye,
  screenshot:      Camera,
  select:          ToggleLeft,
  pressKey:        Keyboard,
};

const STEP_COLORS: Record<StepType, string> = {
  navigate:        "bg-blue-100 text-blue-700",
  click:           "bg-purple-100 text-purple-700",
  type:            "bg-green-100 text-green-700",
  waitForSelector: "bg-yellow-100 text-yellow-700",
  screenshot:      "bg-gray-100 text-gray-700",
  select:          "bg-orange-100 text-orange-700",
  pressKey:        "bg-pink-100 text-pink-700",
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Step Editor ─────────────────────────────────────────────────────────────

function StepEditor({
  step,
  onChange,
  onDelete,
}: {
  step: WorkflowStep;
  onChange: (s: WorkflowStep) => void;
  onDelete: () => void;
}) {
  const Icon = STEP_ICONS[step.type] ?? MousePointer;
  const colorClass = STEP_COLORS[step.type] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={step.type}
              onChange={e => onChange({ ...step, type: e.target.value as StepType, selector: "", url: "", value: "" })}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700"
            >
              <option value="navigate">Navigate to URL</option>
              <option value="click">Click element</option>
              <option value="type">Type text</option>
              <option value="waitForSelector">Wait for element</option>
              <option value="select">Select option</option>
              <option value="pressKey">Press key</option>
              <option value="screenshot">Take screenshot</option>
            </select>
            <input
              value={step.description}
              onChange={e => onChange({ ...step, description: e.target.value })}
              placeholder="Step description..."
              className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green"
            />
            <button onClick={onDelete} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {step.type === "navigate" && (
            <input
              value={step.url ?? ""}
              onChange={e => onChange({ ...step, url: e.target.value })}
              placeholder="https://company.kiyoh.com/login  or  https://company.klantenvertellen.nl/login"
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green font-mono"
            />
          )}

          {(step.type === "click" || step.type === "waitForSelector") && (
            <input
              value={step.selector ?? ""}
              onChange={e => onChange({ ...step, selector: e.target.value })}
              placeholder="CSS selector  e.g. #login-button, .review-row:first-child, [data-testid=report]"
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green font-mono"
            />
          )}

          {step.type === "type" && (
            <div className="space-y-1.5">
              <input
                value={step.selector ?? ""}
                onChange={e => onChange({ ...step, selector: e.target.value })}
                placeholder="CSS selector for input field  e.g. #username, input[name=email]"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green font-mono"
              />
              <div className="flex items-center gap-2">
                <input
                  value={step.value ?? ""}
                  onChange={e => onChange({ ...step, value: e.target.value })}
                  placeholder={step.isVariable ? `{{${step.variableName || "variable"}}}` : "Value to type..."}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green font-mono"
                />
                <button
                  onClick={() => onChange({ ...step, isVariable: !step.isVariable })}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    step.isVariable
                      ? "border-kv-green bg-kv-green/10 text-kv-green"
                      : "border-gray-200 text-gray-500 hover:border-kv-green"
                  }`}
                  title="Mark as runtime variable (filled in per-review)"
                >
                  <Zap className="h-3 w-3" />
                  {step.isVariable ? "Variable" : "Make Variable"}
                </button>
              </div>
              {step.isVariable && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Variable name:</span>
                  <input
                    value={step.variableName ?? ""}
                    onChange={e => onChange({ ...step, variableName: e.target.value, value: `{{${e.target.value}}}` })}
                    placeholder="reviewId"
                    className="w-32 rounded-lg border border-kv-green/30 bg-kv-green/5 px-2 py-1 text-xs font-mono text-kv-green focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">→ used as{" "}
                    <code className="rounded bg-gray-100 px-1 font-mono">{`{{${step.variableName || "varName"}}}`}</code>
                  </span>
                </div>
              )}
            </div>
          )}

          {step.type === "pressKey" && (
            <input
              value={step.value ?? ""}
              onChange={e => onChange({ ...step, value: e.target.value })}
              placeholder="Key name  e.g. Enter, Tab, Escape"
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green font-mono"
            />
          )}

          {step.type === "select" && (
            <div className="space-y-1.5">
              <input
                value={step.selector ?? ""}
                onChange={e => onChange({ ...step, selector: e.target.value })}
                placeholder="CSS selector for <select> element"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green font-mono"
              />
              <input
                value={step.value ?? ""}
                onChange={e => onChange({ ...step, value: e.target.value })}
                placeholder="Option value to select"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-kv-green font-mono"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Execution Result View ────────────────────────────────────────────────────

function ExecutionView({
  result,
  onClose,
}: {
  result: { success: boolean; stepsCompleted: number; stepsTotal: number; steps: ExecutionStep[]; dryRun: boolean; error?: string };
  onClose: () => void;
}) {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="mx-4 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 ${result.success ? "bg-green-500" : "bg-red-500"} text-white`}>
          <div className="flex items-center gap-3">
            {result.success ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <div>
              <p className="font-semibold">
                {result.dryRun ? "Dry Run Complete" : result.success ? "Workflow Executed Successfully" : "Workflow Failed"}
              </p>
              <p className="text-sm opacity-80">
                {result.stepsCompleted}/{result.stepsTotal} steps completed
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Steps list */}
          <div className="w-72 shrink-0 overflow-y-auto border-r bg-gray-50 py-3">
            {result.steps.map((step, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(activeStep === i ? null : i)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white transition-colors ${activeStep === i ? "bg-white" : ""}`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  {step.status === "ok" ? "✓" : "✗"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-800">{step.description}</p>
                  <p className="text-xs text-gray-400">{step.type}</p>
                </div>
                {step.screenshot && <Camera className="h-3 w-3 text-gray-300" />}
              </button>
            ))}
          </div>

          {/* Step detail / screenshot */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeStep !== null && result.steps[activeStep] ? (
              <div className="space-y-4">
                {result.steps[activeStep].error && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    <strong>Error:</strong> {result.steps[activeStep].error}
                  </div>
                )}
                {result.steps[activeStep].screenshot && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-gray-500">Screenshot after step</p>
                    <img
                      src={result.steps[activeStep].screenshot}
                      alt="Step screenshot"
                      className="w-full rounded-xl border border-gray-200 shadow-sm"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-gray-400">Click a step to see its screenshot</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "admin";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [editingSteps, setEditingSteps] = useState<WorkflowStep[]>([]);
  const [editingName, setEditingName] = useState("");
  const [editingPlatform, setEditingPlatform] = useState<"kiyoh" | "kv">("kiyoh");
  const [editingDesc, setEditingDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [executionResult, setExecutionResult] = useState<any | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/automation/workflows");
      const data = await res.json();
      setWorkflows((data.workflows ?? []).map((w: any) => ({
        ...w,
        steps: typeof w.steps === "string" ? JSON.parse(w.steps) : w.steps,
      })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (status === "authenticated") {
      if (!isAdmin) router.replace("/dashboard");
      else fetchWorkflows();
    }
  }, [status, isAdmin, router, fetchWorkflows]);

  const startNew = () => {
    setSelectedWorkflow(null);
    setEditingName("Nieuw Workflow");
    setEditingPlatform("kiyoh");
    setEditingDesc("");
    setEditingSteps([
      { id: uid(), type: "navigate", url: "https://", description: "Navigeer naar login pagina" },
      { id: uid(), type: "type", selector: "", description: "Vul gebruikersnaam in", value: "{{username}}", isVariable: true, variableName: "username" },
      { id: uid(), type: "type", selector: "", description: "Vul wachtwoord in", value: "{{password}}", isVariable: true, variableName: "password" },
      { id: uid(), type: "click", selector: "", description: "Klik op Inloggen" },
    ]);
    setIsCreating(true);
  };

  const editWorkflow = (w: Workflow) => {
    setSelectedWorkflow(w);
    setEditingName(w.name);
    setEditingPlatform(w.platform);
    setEditingDesc(w.description ?? "");
    setEditingSteps([...w.steps]);
    setIsCreating(true);
  };

  const addStep = () => {
    setEditingSteps(prev => [...prev, {
      id: uid(),
      type: "click",
      selector: "",
      description: "Nieuwe stap",
    }]);
  };

  const updateStep = (id: string, updated: WorkflowStep) => {
    setEditingSteps(prev => prev.map(s => s.id === id ? updated : s));
  };

  const deleteStep = (id: string) => {
    setEditingSteps(prev => prev.filter(s => s.id !== id));
  };

  const saveWorkflow = async () => {
    setSaving(true);
    try {
      const body = { name: editingName, platform: editingPlatform, description: editingDesc, steps: editingSteps };
      const res = selectedWorkflow
        ? await fetch(`/api/admin/automation/workflows/${selectedWorkflow.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          })
        : await fetch("/api/admin/automation/workflows", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
      if (res.ok) {
        await fetchWorkflows();
        setIsCreating(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm("Weet je zeker dat je dit workflow wilt verwijderen?")) return;
    await fetch(`/api/admin/automation/workflows/${id}`, { method: "DELETE" });
    await fetchWorkflows();
  };

  const runWorkflow = async (workflow: Workflow, dryRun = false) => {
    setExecuting(workflow.id);
    try {
      // Collect any variable values defined in the steps
      const variables: Record<string, string> = {};
      for (const step of workflow.steps) {
        if (step.isVariable && step.variableName && testVariables[step.variableName]) {
          variables[step.variableName] = testVariables[step.variableName];
        }
      }
      const res = await fetch("/api/admin/automation/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: workflow.id, variables, dryRun }),
      });
      const result = await res.json();
      setExecutionResult(result);
    } finally {
      setExecuting(null);
    }
  };

  // Collect variable names across steps
  const getWorkflowVariables = (w: Workflow) =>
    w.steps.filter(s => s.isVariable && s.variableName).map(s => s.variableName!);

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-kv-green" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Automation Workflows</h1>
            <p className="text-sm text-gray-500">
              Train de agent door stap-voor-stap workflows op te nemen. De agent volgt exact de stappen die jij instelt.
            </p>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-2 rounded-xl bg-kv-green px-4 py-2 text-sm font-medium text-white hover:bg-kv-green/90"
          >
            <Plus className="h-4 w-4" />
            Nieuw Workflow
          </button>
        </div>

        {/* Safety notice */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="text-sm text-blue-700">
            <strong>Deterministic & Veilig:</strong> De agent voert alleen de exacte CSS selectors uit die jij hier definieert.
            Gebruik <strong>Dry Run</strong> om te testen zonder dat er iets op Kiyoh/KV wordt aangepast.
            Gebruik <code className="rounded bg-blue-100 px-1 font-mono text-xs">{`{{reviewId}}`}</code> als placeholder voor runtime variabelen.
          </div>
        </div>

        {/* Workflow List */}
        {!isCreating && (
          <div className="space-y-3">
            {workflows.length === 0 && !loading && (
              <div className="rounded-2xl bg-white py-16 text-center shadow-sm">
                <Zap className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-500">Geen workflows</p>
                <p className="mt-1 text-sm text-gray-400">Maak je eerste workflow aan om te beginnen</p>
                <button onClick={startNew} className="mt-4 rounded-xl bg-kv-green px-4 py-2 text-sm font-medium text-white hover:bg-kv-green/90">
                  Eerste Workflow
                </button>
              </div>
            )}
            {workflows.map(w => {
              const vars = getWorkflowVariables(w);
              return (
                <motion.div
                  key={w.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          w.platform === "kiyoh" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {w.platform === "kiyoh" ? "Kiyoh" : "KlantenVertellen"}
                        </span>
                        {!w.isActive && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactief</span>
                        )}
                        <h3 className="font-semibold text-gray-900">{w.name}</h3>
                      </div>
                      {w.description && <p className="mt-0.5 text-sm text-gray-500">{w.description}</p>}
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                        <span>{w.steps.length} stappen</span>
                        {vars.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {vars.join(", ")}
                          </span>
                        )}
                      </div>

                      {/* Variable inputs for test run */}
                      {vars.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {vars.map(v => (
                            <div key={v} className="flex items-center gap-1.5 rounded-lg border border-kv-green/30 bg-kv-green/5 px-2.5 py-1.5">
                              <code className="text-xs font-mono text-kv-green">{`{{${v}}}`}</code>
                              <input
                                value={testVariables[v] ?? ""}
                                onChange={e => setTestVariables(prev => ({ ...prev, [v]: e.target.value }))}
                                placeholder={`Voer ${v} in...`}
                                className="w-32 bg-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => runWorkflow(w, true)}
                        disabled={executing === w.id}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        title="Dry run: valideer stappen zonder echte acties"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Dry Run
                      </button>
                      <button
                        onClick={() => runWorkflow(w, false)}
                        disabled={executing === w.id}
                        className="flex items-center gap-1 rounded-lg bg-kv-green px-2.5 py-1.5 text-xs font-medium text-white hover:bg-kv-green/90 disabled:opacity-50"
                        title="Voer workflow echt uit"
                      >
                        {executing === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        Uitvoeren
                      </button>
                      <button onClick={() => editWorkflow(w)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteWorkflow(w.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Workflow Editor / Training UI */}
        {isCreating && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Editor header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-semibold text-gray-900">
                {selectedWorkflow ? "Workflow Bewerken" : "Nieuw Workflow Trainen"}
              </h2>
              <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Metadata */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Naam</label>
                  <input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-kv-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Platform</label>
                  <select
                    value={editingPlatform}
                    onChange={e => setEditingPlatform(e.target.value as "kiyoh" | "kv")}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-kv-green"
                  >
                    <option value="kiyoh">Kiyoh</option>
                    <option value="kv">KlantenVertellen</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Omschrijving</label>
                  <input
                    value={editingDesc}
                    onChange={e => setEditingDesc(e.target.value)}
                    placeholder="Korte omschrijving..."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-kv-green"
                  />
                </div>
              </div>

              {/* Variables legend */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
                <strong>Runtime Variabelen:</strong> Gebruik{" "}
                <code className="rounded bg-amber-100 px-1 font-mono">{`{{username}}`}</code> en{" "}
                <code className="rounded bg-amber-100 px-1 font-mono">{`{{password}}`}</code> voor inloggegevens (automatisch gevuld vanuit railwayomgeving). 
                Gebruik{" "}
                <code className="rounded bg-amber-100 px-1 font-mono">{`{{reviewId}}`}</code> voor het review-ID dat je invult bij het uitvoeren.
              </div>

              {/* Step list */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">Stappen ({editingSteps.length})</p>
                  <button onClick={addStep} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    <Plus className="h-3.5 w-3.5" /> Stap toevoegen
                  </button>
                </div>
                <div className="space-y-2">
                  {editingSteps.map((step, i) => (
                    <div key={step.id} className="flex items-start gap-2">
                      <span className="mt-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <StepEditor
                          step={step}
                          onChange={updated => updateStep(step.id, updated)}
                          onDelete={() => deleteStep(step.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save */}
              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  onClick={() => setIsCreating(false)}
                  className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  onClick={saveWorkflow}
                  disabled={saving || !editingName || editingSteps.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-kv-green px-5 py-2 text-sm font-medium text-white hover:bg-kv-green/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {selectedWorkflow ? "Opslaan" : "Workflow Aanmaken"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Execution Result Modal */}
      <AnimatePresence>
        {executionResult && (
          <ExecutionView result={executionResult} onClose={() => setExecutionResult(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
