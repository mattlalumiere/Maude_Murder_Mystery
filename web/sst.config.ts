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

    new sst.aws.Nextjs("Web", {
      path: ".",
      link: [rooms, media],
      environment: {
        ROOMS_TABLE: rooms.name,
        MEDIA_BUCKET: media.name,
        BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID ?? "",
        AUTH_SECRET: process.env.AUTH_SECRET ?? "",
        AUTH_TRUST_HOST: "true",
        AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? "",
        AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? "",
        AUTH_APPLE_ID: process.env.AUTH_APPLE_ID ?? "",
        AUTH_APPLE_SECRET: process.env.AUTH_APPLE_SECRET ?? "",
        AUTH_FACEBOOK_ID: process.env.AUTH_FACEBOOK_ID ?? "",
        AUTH_FACEBOOK_SECRET: process.env.AUTH_FACEBOOK_SECRET ?? "",
      },
      permissions: [
        { actions: ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:InvokeModelWithResponseStream"], resources: ["*"] },
      ],
    });
  },
});
