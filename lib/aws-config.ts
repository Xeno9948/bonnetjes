import { S3Client } from "@aws-sdk/client-s3";

export function getBucketConfig() {
  return {
    bucketName: process.env.CLOUDFLARE_BUCKET_NAME ?? process.env.AWS_BUCKET_NAME ?? "",
    folderPrefix: process.env.CLOUDFLARE_FOLDER_PREFIX ?? process.env.AWS_FOLDER_PREFIX ?? ""
  };
}

export function createS3Client() {
  const endpoint = process.env.CLOUDFLARE_ENDPOINT || process.env.AWS_ENDPOINT;
  const accessKeyId = process.env.CLOUDFLARE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.CLOUDFLARE_REGION || process.env.AWS_REGION || "auto";

  if (accessKeyId && accessKeyId.length !== 32 && endpoint?.includes("r2.cloudflarestorage.com")) {
    console.warn(`[Cloudflare Config] Warning: CLOUDFLARE_ACCESS_KEY_ID length is ${accessKeyId.length}, expected 32 for Cloudflare R2.`);
  }

  if (secretAccessKey && secretAccessKey.length !== 64 && endpoint?.includes("r2.cloudflarestorage.com")) {
    console.warn(`[Cloudflare Config] Warning: CLOUDFLARE_SECRET_ACCESS_KEY length is ${secretAccessKey.length}, expected 64 for Cloudflare R2.`);
  }

  return new S3Client({
    region,
    ...(endpoint && { endpoint }),
    forcePathStyle: true,
    // AWS SDK v3 adds x-amz-checksum-sha256 by default — R2 rejects this with InvalidArgument
    requestChecksumCalculation: "WHEN_REQUIRED" as any,
    responseChecksumValidation: "WHEN_REQUIRED" as any,
    ...(accessKeyId && secretAccessKey && {
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })
  });
}
