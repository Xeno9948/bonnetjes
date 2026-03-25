import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google"
    }
  });

  if (!account) return null;

  // Check if token is expired (with 5 minute buffer)
  const isExpired = account.expires_at && (account.expires_at * 1000) < (Date.now() + 5 * 60 * 1000);

  if (isExpired && account.refresh_token) {
    // Refresh the token
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          refresh_token: account.refresh_token,
          grant_type: "refresh_token"
        })
      });

      if (response.ok) {
        const tokens = await response.json();
        
        // Update the account with new tokens
        await prisma.account.update({
          where: { id: account.id },
          data: {
            access_token: tokens.access_token,
            expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in
          }
        });

        return tokens.access_token;
      }
    } catch (error) {
      console.error("Token refresh error:", error);
    }
  }

  return account.access_token || null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const accessToken = await getAccessToken(userId);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Google account not connected. Please sign in with Google." },
        { status: 403 }
      );
    }

    // Get folder ID from query params, default to "root" for My Drive
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId") || "root";
    const sharedWithMe = searchParams.get("sharedWithMe") === "true";

    // Shared drive query support params
    const driveParams = "&supportsAllDrives=true&includeItemsFromAllDrives=true";

    let folderQuery: string;
    let fileQuery: string;

    if (sharedWithMe && folderId === "root") {
      // Show top-level items shared with me
      folderQuery = `sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      fileQuery = `sharedWithMe = true and (mimeType contains 'image/' or mimeType = 'application/pdf') and trashed = false`;
    } else {
      folderQuery = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      fileQuery = `'${folderId}' in parents and (mimeType contains 'image/' or mimeType = 'application/pdf') and trashed = false`;
    }

    // Fetch folders
    const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name,mimeType)&orderBy=name&pageSize=100${driveParams}`;
    const folderResponse = await fetch(folderUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // Fetch files
    const fileUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fileQuery)}&fields=files(id,name,mimeType,thumbnailLink,createdTime,size)&orderBy=createdTime desc&pageSize=50${driveParams}`;
    const fileResponse = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!folderResponse.ok || !fileResponse.ok) {
      const error = !folderResponse.ok ? await folderResponse.text() : await fileResponse.text();
      console.error("Google Drive API error:", error);
      
      if (folderResponse.status === 401 || fileResponse.status === 401) {
        return NextResponse.json(
          { error: "Google token expired. Please sign out and sign in again with Google." },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { error: "Failed to fetch files from Google Drive" },
        { status: folderResponse.status || fileResponse.status }
      );
    }

    const folderData = await folderResponse.json();
    const fileData = await fileResponse.json();

    // Get current folder name if not root
    let currentFolderName = "Mijn Drive";
    if (folderId !== "root") {
      const metaUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`;
      const metaResponse = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (metaResponse.ok) {
        const metaData = await metaResponse.json();
        currentFolderName = metaData.name;
      }
    }

    return NextResponse.json({
      folders: folderData.files || [],
      files: fileData.files || [],
      currentFolder: {
        id: folderId,
        name: currentFolderName
      }
    });
  } catch (error) {
    console.error("Error fetching Drive files:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
