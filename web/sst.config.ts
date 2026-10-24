/// <reference path="./.sst/platform/config.d.ts" />

// Deploy: `npx sst deploy --stage party`. Requires AWS credentials and Bedrock model access
// for the model in BEDROCK_MODEL_ID. Untested until first deploy.
export default $config({
  app(input) {
    return {
      name: "murder-mystery-night",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    // One item per room, auto-deleted 24h after creation (TTL). On-demand billing = pennies.
    const rooms = new sst.aws.Dynamo("Rooms", {
      fields: { pk: "string" },
      primaryIndex: { hashKey: "pk" },
      ttl: "ttl",
    });

    // Uploaded photos and generated art; everything expires after 1 day. Used from phase 3 onward.
    const media = new sst.aws.Bucket("Media", {});
    new aws.s3.BucketLifecycleConfigurationV2("MediaExpiry", {
      bucket: media.name,
      rules: [{ id: "expire-1d", status: "Enabled", filter: {}, expiration: { days: 1 } }],
    });

    // Saved stories must outlive a game, so they live in their own bucket with NO expiry rule.
    const stories = new sst.aws.Bucket("Stories", {});

    new sst.aws.Nextjs("Web", {
      path: ".",
      link: [rooms, media, stories],
      environment: {
        ROOMS_TABLE: rooms.name,
        MEDIA_BUCKET: media.name,
        STORY_BUCKET: stories.name,
        STORY_SEAL_KEY: process.env.STORY_SEAL_KEY ?? "",
        BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID ?? "",
        MEDIA_PROVIDER: process.env.MEDIA_PROVIDER ?? "bedrock",
        AUTH_SECRET: process.env.AUTH_SECRET ?? "",
        AUTH_TRUST_HOST: "true",
        ASYNC_START: "true",
        CLOUD_PROVIDER: "aws",
        // CloudFront closes slow origin responses at 30 s by default. Raise that quota to 60 s, or keep this at 25 s so the sample case is used instead of a 504.
        GENERATION_DEADLINE_MS: process.env.GENERATION_DEADLINE_MS ?? "25000",
        // Photo likenesses for players under 18 are off unless you set this to "true" (needs a guardian-consent process).
        ALLOW_MINOR_PHOTOS: process.env.ALLOW_MINOR_PHOTOS ?? "false",
        AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? "",
        AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? "",
        AUTH_APPLE_ID: process.env.AUTH_APPLE_ID ?? "",
        AUTH_APPLE_SECRET: process.env.AUTH_APPLE_SECRET ?? "",
        AUTH_FACEBOOK_ID: process.env.AUTH_FACEBOOK_ID ?? "",
        AUTH_FACEBOOK_SECRET: process.env.AUTH_FACEBOOK_SECRET ?? "",
      },
      // Photo uploads happen inside the app (resized to <2MB first), so the 6MB Lambda payload limit is fine.
      server: { timeout: "60 seconds", memory: "1024 MB" },
      permissions: [
        { actions: ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:InvokeModelWithResponseStream", "bedrock:StartAsyncInvoke", "bedrock:GetAsyncInvoke"], resources: ["*"] },
        { actions: ["rekognition:DetectModerationLabels"], resources: ["*"] },
        // AI guests speak through Amazon Polly when CLOUD_PROVIDER=aws.
        { actions: ["polly:SynthesizeSpeech"], resources: ["*"] },
      ],
    });
  },
});
