import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// Config
const config = new pulumi.Config();
const location = config.get("location") || "us-central1";

// 1. Enable Services (Optional: might be managed manually)
// We define them to ensure they are enabled.
const artifactRegistryService = new gcp.projects.Service("artifact-registry-service", {
    service: "artifactregistry.googleapis.com",
    disableOnDestroy: false,
});
const iamService = new gcp.projects.Service("iam-service", {
    service: "iam.googleapis.com",
    disableOnDestroy: false,
});
const computeService = new gcp.projects.Service("compute-service", {
    service: "compute.googleapis.com",
    disableOnDestroy: false,
});

// 2. GCS Bucket for Persistence
// This bucket acts as the filesystem for GunDB. 
// We are retaining this bucket during the decommissioning process so no historical data is lost.
const bucket = new gcp.storage.Bucket("mew2-gun-data", {
    location: location,
    uniformBucketLevelAccess: true,
    versioning: {
        enabled: true,
    },
});

// Exports
export const bucketName = bucket.name;
