export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { executeWorkflow, WorkflowStep } from "@/lib/automation/executor";

/**
 * POST /api/admin/automation/execute
 * Body: { workflowId, variables, dryRun }
 *
 * Executes a saved workflow with the given runtime variables.
 * If dryRun=true, validates & returns steps without actually running the browser.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workflowId, variables = {}, dryRun = false } = await request.json();

  if (!workflowId) {
    return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
  }

  const workflow = await prisma.automationWorkflow.findUnique({ where: { id: workflowId } });
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  if (!workflow.isActive) {
    return NextResponse.json({ error: "Workflow is disabled" }, { status: 400 });
  }

  let steps: WorkflowStep[];
  try {
    steps = JSON.parse(workflow.steps);
  } catch {
    return NextResponse.json({ error: "Workflow steps are corrupted" }, { status: 500 });
  }

  // Inject platform credentials automatically
  const platform = workflow.platform;
  const enrichedVariables = {
    ...variables,
    username: platform === "kv"
      ? (process.env.KV_USER ?? "")
      : (process.env.KIYOH_USER ?? ""),
    password: platform === "kv"
      ? (process.env.KV_PASS ?? "")
      : (process.env.KIYOH_PASS ?? ""),
  };

  const result = await executeWorkflow(steps, enrichedVariables, dryRun);

  return NextResponse.json({
    success: result.success,
    dryRun,
    workflowName: workflow.name,
    platform: workflow.platform,
    stepsTotal: steps.length,
    stepsCompleted: result.steps.filter(s => s.status === "ok").length,
    steps: result.steps.map(s => ({
      description: s.step.description,
      type: s.step.type,
      status: s.status,
      error: s.error,
      screenshot: s.screenshot, // base64 image for audit trail
    })),
    error: result.error,
  });
}
