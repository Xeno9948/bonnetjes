"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  X,
  FolderOpen,
  FileImage,
  FileText,
  Loader2,
  Check,
  AlertCircle,
  Download,
  RefreshCw,
  ChevronRight,
  Home,
  Folder,
  Users
} from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  createdTime?: string;
  size?: string;
}

interface DriveFolder {
  id: string;
  name: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface GoogleDriveImportProps {
  onClose: () => void;
  onComplete: () => void;
}

export function GoogleDriveImport({ onClose, onComplete }: GoogleDriveImportProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<Record<string, "pending" | "importing" | "done" | "error">>({});
  const [currentFolderId, setCurrentFolderId] = useState<string>("root");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: "root", name: "Mijn Drive" }]);
  const [sharedWithMe, setSharedWithMe] = useState(false);

  const fetchFiles = useCallback(async (folderId: string, shared: boolean) => {
    setLoading(true);
    setError(null);
    setSelectedFiles(new Set());
    try {
      const url = `/api/drive/files?folderId=${encodeURIComponent(folderId)}&sharedWithMe=${shared}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch files");
        return;
      }

      setFolders(data.folders || []);
      setFiles(data.files || []);
    } catch {
      setError("Failed to connect to Google Drive");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles(currentFolderId, sharedWithMe);
  }, [currentFolderId, sharedWithMe, fetchFiles]);

  const switchMode = (shared: boolean) => {
    setSharedWithMe(shared);
    setCurrentFolderId("root");
    setBreadcrumbs([{ id: "root", name: shared ? "Gedeeld met mij" : "Mijn Drive" }]);
  };

  const navigateToFolder = (folder: DriveFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index];
    setCurrentFolderId(crumb.id);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  };

  const toggleFile = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const selectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const importSelected = async () => {
    if (selectedFiles.size === 0) return;

    setImporting(true);
    const progress: Record<string, "pending" | "importing" | "done" | "error"> = {};
    selectedFiles.forEach(id => progress[id] = "pending");
    setImportProgress(progress);

    let successCount = 0;
    let errorCount = 0;

    for (const fileId of selectedFiles) {
      const file = files.find(f => f.id === fileId);
      if (!file) continue;

      setImportProgress(prev => ({ ...prev, [fileId]: "importing" }));

      try {
        const response = await fetch("/api/drive/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType
          })
        });

        if (response.ok) {
          setImportProgress(prev => ({ ...prev, [fileId]: "done" }));
          successCount++;
        } else {
          setImportProgress(prev => ({ ...prev, [fileId]: "error" }));
          errorCount++;
        }
      } catch {
        setImportProgress(prev => ({ ...prev, [fileId]: "error" }));
        errorCount++;
      }
    }

    setImporting(false);

    if (successCount > 0) {
      toast({
        title: "Import voltooid",
        description: `${successCount} bestand${successCount > 1 ? "en" : ""} geïmporteerd${errorCount > 0 ? `, ${errorCount} mislukt` : ""}`
      });
      onComplete();
    } else {
      toast({
        title: "Import mislukt",
        description: "Geen bestanden konden worden geïmporteerd",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return "";
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-kv-green to-kv-green-light p-4 text-white">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-6 w-6" />
              <div>
                <h2 className="text-lg font-semibold">Google Drive Import</h2>
                <p className="text-sm text-white/80">Selecteer bonnen om te importeren</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drive Mode Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => switchMode(false)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                !sharedWithMe
                  ? "border-kv-green text-kv-green"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Home className="h-4 w-4" />
              Mijn Drive
            </button>
            <button
              onClick={() => switchMode(true)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                sharedWithMe
                  ? "border-kv-green text-kv-green"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="h-4 w-4" />
              Gedeeld met mij
            </button>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 border-b bg-gray-50 px-4 py-2 text-sm overflow-x-auto">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center">
                {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400 mx-1 flex-shrink-0" />}
                <button
                  onClick={() => navigateToBreadcrumb(index)}
                  className={`flex items-center gap-1 hover:text-kv-green whitespace-nowrap ${
                    index === breadcrumbs.length - 1 ? "font-medium text-kv-green" : "text-gray-600"
                  }`}
                >
                  {index === 0 && <Home className="h-4 w-4" />}
                  <span className="truncate max-w-[150px]">{crumb.name}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="max-h-[50vh] overflow-y-auto p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-kv-green" />
                <p className="mt-2 text-gray-600">Bestanden laden...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <p className="mt-2 text-center text-gray-700">{error}</p>
                <button
                  onClick={() => fetchFiles(currentFolderId, sharedWithMe)}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-kv-green px-4 py-2 text-white hover:bg-kv-green/90"
                >
                  <RefreshCw className="h-4 w-4" />
                  Opnieuw proberen
                </button>
              </div>
            ) : folders.length === 0 && files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FolderOpen className="h-12 w-12 text-gray-400" />
                <p className="mt-2 text-gray-600">Geen bestanden gevonden in de map</p>
              </div>
            ) : (
              <>
                {/* Folders */}
                {folders.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-medium uppercase text-gray-500">Mappen</p>
                    <div className="grid grid-cols-2 gap-2">
                      {folders.map(folder => (
                        <button
                          key={folder.id}
                          onClick={() => navigateToFolder(folder)}
                          className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-left hover:border-kv-green hover:bg-kv-green/5 transition-colors"
                        >
                          <Folder className="h-5 w-5 text-kv-orange flex-shrink-0" />
                          <span className="truncate text-sm font-medium text-gray-700">{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files */}
                {files.length > 0 && (
                  <>
                    {/* Select All */}
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium uppercase text-gray-500">Bestanden</p>
                        <button
                          onClick={selectAll}
                          className="text-xs font-medium text-kv-green hover:underline"
                        >
                          {selectedFiles.size === files.length ? "Deselecteer alles" : "Selecteer alles"}
                        </button>
                      </div>
                      <span className="text-sm text-gray-500">
                        {selectedFiles.size} van {files.length} geselecteerd
                      </span>
                    </div>

                    {/* File List */}
                    <div className="space-y-2">
                      {files.map(file => (
                    <div
                      key={file.id}
                      onClick={() => !importing && toggleFile(file.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                        selectedFiles.has(file.id)
                          ? "border-kv-green bg-kv-green/5"
                          : "border-gray-200 hover:border-gray-300"
                      } ${importing ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      {/* Checkbox */}
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                          selectedFiles.has(file.id)
                            ? "border-kv-green bg-kv-green text-white"
                            : "border-gray-300"
                        }`}
                      >
                        {selectedFiles.has(file.id) && <Check className="h-3 w-3" />}
                      </div>

                      {/* Thumbnail or Icon */}
                      {file.thumbnailLink ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={file.thumbnailLink}
                          alt={file.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : file.mimeType === "application/pdf" ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-red-100">
                          <FileText className="h-5 w-5 text-red-600" />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-blue-100">
                          <FileImage className="h-5 w-5 text-blue-600" />
                        </div>
                      )}

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(file.createdTime)}
                          {file.size && ` • ${formatFileSize(file.size)}`}
                        </p>
                      </div>

                      {/* Import Status */}
                      {importProgress[file.id] && (
                        <div className="flex-shrink-0">
                          {importProgress[file.id] === "importing" && (
                            <Loader2 className="h-5 w-5 animate-spin text-kv-green" />
                          )}
                          {importProgress[file.id] === "done" && (
                            <Check className="h-5 w-5 text-green-500" />
                          )}
                          {importProgress[file.id] === "error" && (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t bg-gray-50 p-4">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Annuleren
            </button>
            <button
              onClick={importSelected}
              disabled={selectedFiles.size === 0 || importing || loading}
              className="flex items-center gap-2 rounded-lg bg-kv-green px-4 py-2 text-sm font-medium text-white hover:bg-kv-green/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importeren...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Importeer ({selectedFiles.size})
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
