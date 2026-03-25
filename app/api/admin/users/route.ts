import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: list all users
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { receipts: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(users);
}

// PATCH: update a user's role
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, role } = await request.json();

  if (!userId || !["user", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Prevent removing admin from the hardcoded super-admin
  const SUPER_ADMINS = ["marketing@kiyoh.co.za"];
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (target && SUPER_ADMINS.includes(target.email ?? "") && role !== "admin") {
    return NextResponse.json({ error: "Cannot demote this user" }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, role: true }
  });

  return NextResponse.json(updated);
}
