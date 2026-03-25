"use client";

import { useState, useCallback } from "react";
import {
  X,
  Upload,
  FileImage,
  FileText,
  Loader2,
  Check,
  AlertCircle,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface ReceiptUploadProps {
  onClose: () => void;
  onComplete: () => void;
}

interface FileUpload {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "completed" | "error";
  result?: any;
  error?: string;
}

export function ReceiptUpload({ onClose, onComplete }: ReceiptUploadProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer?.files) {
      handleFilesSelect(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFilesSelect = (selectedFiles: File[]) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf"
    ];

    const validFiles: FileUpload[] = [];

    for (const file of selectedFiles) {
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a supported format`,
          variant: "destructive"
        });
        continue;
      }

      if (file.size > 100 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 100MB limit`,
          variant: "destructive"
        });
        continue;
      }

      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        status: "pending"
      });
    }

    setFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const processFile = async (fileUpload: FileUpload): Promise<FileUpload> => {
    const { file, id } = fileUpload;

    try {
      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "uploading" as const } : f))
      );

      // Get presigned URL
      const presignResponse = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          isPublic: false
        })
      });

      if (!presignResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, cloud_storage_path } = await presignResponse.json();

      // Check if content-disposition is in signed headers
      const url = new URL(uploadUrl);
      const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders") || "";
      const needsContentDisposition = signedHeaders.includes("content-disposition");

      // Upload file to S3
      const uploadHeaders: Record<string, string> = {
        "Content-Type": file.type
      };

      if (needsContentDisposition) {
        uploadHeaders["Content-Disposition"] = "attachment";
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: uploadHeaders,
        body: file
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("S3 Upload Error Body:", errorText);
        
        // Try to extract a clean error message from XML if possible
        let cleanError = "Failed to upload file";
        if (errorText.includes("<Message>")) {
          const match = errorText.match(/<Message>(.*?)<\/Message>/);
          if (match) cleanError = match[1];
        } else if (uploadResponse.status === 403) {
          cleanError = "Access denied (403). Check R2 permissions.";
        } else if (uploadResponse.status === 400) {
          cleanError = "Invalid request (400). Check metadata/headers.";
        }
        
        throw new Error(cleanError);
      }

      // Create receipt record (no expected fields needed)
      const receiptResponse = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudStoragePath: cloud_storage_path,
          isPublic: false,
          originalFilename: file.name,
          fileType: file.type.includes("pdf") ? "pdf" : "image",
          fileSize: file.size
        })
      });

      if (!receiptResponse.ok) {
        throw new Error("Failed to create receipt record");
      }

      const receipt = await receiptResponse.json();

      // Update status to processing
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "processing" as const } : f))
      );

      // Trigger OCR
      const ocrResponse = await fetch(`/api/receipts/${receipt.id}/ocr`, {
        method: "POST"
      });

      let ocrResult = null;

      if (ocrResponse.ok) {
        const reader = ocrResponse.body?.getReader();
        const decoder = new TextDecoder();
        let partialRead = "";

        while (true) {
          const { done, value } = (await reader?.read()) ?? { done: true, value: undefined };
          if (done) break;

          partialRead += decoder.decode(value, { stream: true });
          const lines = partialRead.split("\n");
          partialRead = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.status === "completed") {
                  ocrResult = parsed.result;
                }
              } catch {}
            }
          }
        }
      }

      return {
        ...fileUpload,
        status: "completed",
        result: ocrResult
      };
    } catch (err: any) {
      console.error("Upload error:", err);
      return {
        ...fileUpload,
        status: "error",
        error: err.message || "Failed to process receipt"
      };
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;

    setProcessing(true);

    // Process all files
    for (let i = 0; i < files.length; i++) {
      const fileUpload = files[i];
      if (fileUpload.status !== "pending") continue;

      const result = await processFile(fileUpload);
      setFiles((prev) => prev.map((f) => (f.id === result.id ? result : f)));
    }

    setProcessing(false);

    const succeeded = files.filter(f => f.status === "completed").length;
    const failed = files.filter(f => f.status === "error").length;

    toast({
      title: "Processing Complete",
      description: `${succeeded} success, ${failed} failed`,
      variant: failed > 0 ? "destructive" : "default"
    });

    setTimeout(() => {
      onComplete();
    }, 1500);
  };

  const allCompleted = files.length > 0 && files.every((f) => f.status === "completed" || f.status === "error");
  const hasFiles = files.length > 0;
  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
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
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Upload Receipts</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {allCompleted ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-700">
                <Check className="h-5 w-5" />
                <span className="font-medium">All Receipts Processed</span>
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {files.map((f) => (
                <div
                  key={f.id}
                  className={`rounded-lg p-4 ${f.status === "completed" ? "bg-green-50" : "bg-red-50"}`}
                >
                  <div className="flex items-center gap-3">
                    {f.file.type.includes("pdf") ? (
                      <FileText className={`h-6 w-6 ${f.status === "completed" ? "text-green-600" : "text-red-600"}`} />
                    ) : (
                      <FileImage className={`h-6 w-6 ${f.status === "completed" ? "text-green-600" : "text-red-600"}`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{f.file.name}</p>
                      {f.status === "completed" && f.result && (
                        <div className="mt-1 text-sm text-gray-600">
                          <span className="font-medium">{f.result.extractedShopName || "Unknown Shop"}</span>
                          {f.result.extractedDate && <span className="ml-2">• {f.result.extractedDate}</span>}
                          {f.result.extractedAmount && <span className="ml-2">• ${f.result.extractedAmount}</span>}
                        </div>
                      )}
                      {f.status === "error" && (
                        <p className="mt-1 text-sm text-red-600">{f.error}</p>
                      )}
                    </div>
                    {f.status === "completed" ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onComplete}
              className="w-full rounded-lg bg-kv-green py-3 font-medium text-white hover:bg-kv-green/90"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* File Upload */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragActive
                  ? "border-kv-green bg-kv-green/5"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                multiple
                onChange={(e) => e.target.files && handleFilesSelect(Array.from(e.target.files))}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="mb-1 text-gray-900">
                <span className="font-medium text-kv-green">Click to upload</span> or
                drag and drop
              </p>
              <p className="text-sm text-gray-500">JPG, PNG, PDF up to 100MB each • Multiple files supported</p>
            </div>

            {/* File List */}
            {hasFiles && (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                <AnimatePresence>
                  {files.map((f) => (
                    <motion.div
                      key={f.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-3 rounded-lg bg-gray-50 p-3"
                    >
                      {f.file.type.includes("pdf") ? (
                        <FileText className="h-8 w-8 text-kv-green" />
                      ) : (
                        <FileImage className="h-8 w-8 text-kv-green" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{f.file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(f.file.size / 1024 / 1024).toFixed(2)} MB
                          {f.status === "error" && <span className="ml-2 text-red-500">• {f.error}</span>}
                        </p>
                      </div>
                      {(f.status === "pending" || f.status === "error") && (
                        <button
                          onClick={() => removeFile(f.id)}
                          className="p-2 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {f.status === "uploading" && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Uploading...</span>
                        </div>
                      )}
                      {f.status === "processing" && (
                        <div className="flex items-center gap-2 text-amber-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Processing...</span>
                        </div>
                      )}
                      {f.status === "completed" && (
                        <Check className="h-5 w-5 text-green-600" />
                      )}
                      {f.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!hasFiles || processing || pendingCount === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-kv-green py-3 font-medium text-white transition-colors hover:bg-kv-green/90 disabled:bg-gray-300"
            >
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing {files.length} Receipt(s)...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Upload {pendingCount} Receipt(s)
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
