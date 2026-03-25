import { S3Client } from "@aws-sdk/client-s3";

export function getBucketConfig() {
  return {
    bucketName: process.env.AWS_BUCKET_NAME ?? "",
    folderPrefix: process.env.AWS_FOLDER_PREFIX ?? ""
  };
}

export function createS3Client() {
  const endpoint = process.env.AWS_ENDPOINT;
  return new S3Client({
    ...(endpoint && { endpoint, forcePathStyle: true }),
    region: process.env.AWS_REGION || "auto"
  });
}
