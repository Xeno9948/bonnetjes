import { S3Client } from "@aws-sdk/client-s3";

export function getBucketConfig() {
  return {
    bucketName: process.env.AWS_BUCKET_NAME ?? "",
    folderPrefix: process.env.AWS_FOLDER_PREFIX ?? ""
  };
}

export function createS3Client() {
  const endpoint = process.env.AWS_ENDPOINT;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && accessKeyId.length !== 32 && endpoint?.includes("r2.cloudflarestorage.com")) {
    console.warn(`[AWS Config] Warning: AWS_ACCESS_KEY_ID length is ${accessKeyId.length}, expected 32 for Cloudflare R2.`);
  }

  if (secretAccessKey && secretAccessKey.length !== 64 && endpoint?.includes("r2.cloudflarestorage.com")) {
    console.warn(`[AWS Config] Warning: AWS_SECRET_ACCESS_KEY length is ${secretAccessKey.length}, expected 64 for Cloudflare R2.`);
  }

  return new S3Client({
    region: process.env.AWS_REGION || "auto",
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
