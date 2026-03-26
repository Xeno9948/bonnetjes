import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET /api/admin/automation/workflows/[id]
// PATCH /api/admin/automation/workflows/[id]
// DELETE /api/admin/automation/workflows/[id]

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflow = await prisma.automationWorkflow.findUnique({ where: { id: params.id } });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ workflow: { ...workflow, steps: JSON.parse(workflow.steps) } });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updateData: any = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.platform !== undefined) updateData.platform = body.platform;
  if (body.steps !== undefined) updateData.steps = JSON.stringify(body.steps);
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const workflow = await prisma.automationWorkflow.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ workflow });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.automationWorkflow.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
