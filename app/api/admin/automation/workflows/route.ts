import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET /api/admin/automation/workflows - list all workflows
// POST /api/admin/automation/workflows - create a workflow

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows = await prisma.automationWorkflow.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, platform, description, steps } = await request.json();

  if (!name || !platform || !steps) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const workflow = await prisma.automationWorkflow.create({
    data: {
      name,
      platform,
      description: description ?? null,
      steps: JSON.stringify(steps),
      isActive: true,
    },
  });

  return NextResponse.json({ workflow });
}
