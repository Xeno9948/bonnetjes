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
