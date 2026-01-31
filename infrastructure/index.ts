import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as docker from "@pulumi/docker";

// Config
const config = new pulumi.Config();
const location = config.get("location") || "us-central1";

// R2 Credentials (Required for File Uploads)
// Run `pulumi config set --secret r2AccessKeyId <value>` etc. to set these.
const r2AccountId = config.require("r2AccountId");
const r2AccessKeyId = config.requireSecret("r2AccessKeyId");
const r2SecretAccessKey = config.requireSecret("r2SecretAccessKey");
const r2BucketName = config.require("r2BucketName");

// 1. Enable Services (Optional: might be managed manually)
// We define them to ensure they are enabled.
const runService = new gcp.projects.Service("run-service", {
    service: "run.googleapis.com",
    disableOnDestroy: false,
});
const artifactRegistryService = new gcp.projects.Service("artifact-registry-service", {
    service: "artifactregistry.googleapis.com",
    disableOnDestroy: false,
});
const iamService = new gcp.projects.Service("iam-service", {
    service: "iam.googleapis.com",
    disableOnDestroy: false,
});
// Required for region listing and some networking features
const computeService = new gcp.projects.Service("compute-service", {
    service: "compute.googleapis.com",
    disableOnDestroy: false,
});

// 2. GCS Bucket for Persistence
// This bucket acts as the filesystem for GunDB.
const bucket = new gcp.storage.Bucket("mew2-gun-data", {
    location: location,
    uniformBucketLevelAccess: true,
    versioning: {
        enabled: true,
    },
});

// 3. Artifact Registry Repo
const repo = new gcp.artifactregistry.Repository("mew2-repo", {
    location: location,
    repositoryId: "mew2-repo",
    format: "DOCKER",
}, { dependsOn: [artifactRegistryService] });

// 4. Build and Push Image
// We use Pulumi's Docker provider to build the image from the local ./relay directory
// and push it to the Artifact Registry we just created.
const imageName = pulumi.interpolate`${location}-docker.pkg.dev/${gcp.config.project}/${repo.name}/relay`;

const image = new docker.Image("mew2-relay-image", {
    imageName: imageName,
    build: {
        context: "./relay",
        platform: "linux/amd64", // Ensure compatibility with Cloud Run
    },
});

// 5. Cloud Run Service (Gen 2)
// We use Gen 2 because it supports GCS Volume Mounts natively.
const service = new gcp.cloudrunv2.Service("mew2-relay-service", {
    location: location,
    template: {
        containers: [{
            image: image.imageName,
            ports: [{ containerPort: 8080 }],
            volumeMounts: [{
                name: "gcs-mount",
                mountPath: "/data",
            }],
            resources: {
                limits: {
                    cpu: "1000m",
                    memory: "512Mi",
                },
            },
            env: [
                { name: "R2_ACCOUNT_ID", value: r2AccountId },
                { name: "R2_ACCESS_KEY_ID", value: r2AccessKeyId },
                { name: "R2_SECRET_ACCESS_KEY", value: r2SecretAccessKey },
                { name: "R2_BUCKET_NAME", value: r2BucketName },
            ],
        }],
        volumes: [{
            name: "gcs-mount",
            gcs: {
                bucket: bucket.name,
                readOnly: false, // Relay needs to write to the DB
            },
        }],
        scaling: {
            minInstanceCount: 0, // Scale to zero when idle
            maxInstanceCount: 1, // Single writer to avoid corruption on the file backing
        },
        executionEnvironment: "EXECUTION_ENVIRONMENT_GEN2",
    },
}, { dependsOn: [runService, image] });

// 6. Public Access
// Allow unauthenticated invocations so the public internet (clients) can connect to the relay.
const iam = new gcp.cloudrunv2.ServiceIamMember("public-access", {
    project: gcp.config.project,
    location: location,
    name: service.name,
    role: "roles/run.invoker",
    member: "allUsers",
});

// Exports
export const relayUrl = service.uri;
export const bucketName = bucket.name;
export const repositoryUrl = repo.id;
