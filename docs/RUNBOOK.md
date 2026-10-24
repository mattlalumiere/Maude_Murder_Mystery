# Runbook: deploy and run a party on AWS (SST)

**Status: written, never run against real AWS.** Do the dry run in step 4 before party day. The portable multi-cloud platform in `docs/platform/` is a separate, longer-term direction; this is the first-iteration path (Lambda, DynamoDB, S3, Bedrock).

Why these env vars work: the app still maps `ROOMS_TABLE` to the DynamoDB store, `MEDIA_BUCKET` to the S3 store, and `BEDROCK_MODEL_ID` to Bedrock text. Those adapters are marked legacy in the code (kept working, not extended).

## 0. Before you start

- An AWS account, region **us-east-1**, and the AWS CLI configured. Check: `aws sts get-caller-identity`.
- Node 22. From `web/`: `npm ci`.
- **Bedrock model access** (AWS console, Bedrock, Model access): enable a text model you will use, **Amazon Nova Canvas**, and **Amazon Nova Reel**. Some newer models need an inference profile ID (for example one starting with `us.`) as `BEDROCK_MODEL_ID`.
- **A budget alarm:** AWS Billing, Budgets, create a monthly cost budget of about $10 with an email alert. The app's own spend cap only covers pictures and video, not text or moderation.
- **Raise the CloudFront origin response timeout** from 30 s to 60 s (Service Quotas) if you want AI-written mysteries. Otherwise leave `GENERATION_DEADLINE_MS=25000` (the default in `sst.config.ts`); the game then falls back to the built-in sample case whenever the AI takes longer than 25 s.

## 1. Configure (in the shell you deploy from)

```bash
export AUTH_SECRET="$(npx auth secret --raw 2>/dev/null || openssl rand -base64 32)"
export BEDROCK_MODEL_ID="<your text model or inference profile id>"
export MEDIA_PROVIDER=bedrock          # use "mock" to test without paying for images
export ALLOW_MINOR_PHOTOS=false        # keep false unless you have a real guardian-consent process
```

These values become Lambda environment variables, so anyone with access to the AWS account can read them. That is acceptable for a private family event; move them to SST secrets before wider use.

## 2. First deploy

```bash
cd web
npx sst deploy --stage party
```

Note the site URL it prints (a `cloudfront.net` address). Open `<url>/api/healthz` and expect a healthy response.

## 3. Turn on host sign-in

Dev login is disabled in production, so hosts need a real provider. Google is the quickest:

1. Google Cloud Console, APIs and Services, Credentials, **Create OAuth client ID** (Web application).
2. Authorized redirect URI: `https://<your-cloudfront-url>/api/auth/callback/google`.
3. Export the values and redeploy:

```bash
export AUTH_GOOGLE_ID="..." AUTH_GOOGLE_SECRET="..."
npx sst deploy --stage party
```

Apple needs a paid Apple Developer account. Facebook needs app review for production. Skip both for the first party.

## 4. Dry run (required; about 30 minutes; cap it at $3)

1. Open the site on a laptop, sign in, and create a game with a **$3** budget.
2. Open the big screen on a second tab. Join with two phones (one adult, one kid).
3. Add an adult photo. Confirm it is accepted. Confirm the kid cannot add one (expected).
4. Press **Start**. You should see "writing your mystery" for up to about a minute. Note whether the case came from Bedrock or the sample (the host console shows the source).
5. Play through to the reveal on the phones, using Next. Check that portraits and scenes appear and that the spend meter stays under $3.
6. After the reveal, confirm the uploaded photo is gone: S3 console, your Media bucket, look under the game's `photos/` folder.
7. Look in CloudWatch Logs for errors (Lambda log group for the web function).
8. Next day, check Cost Explorer (it lags about 24 hours) against the $3 expectation.

Fix anything that failed before inviting guests.

## 4b. AI guest voices (optional)

With `CLOUD_PROVIDER=aws` (set in `sst.config.ts`) AI guests speak through **Amazon Polly** (neural voices; the deploy role already gets `polly:SynthesizeSpeech`). Polly needs no model-access request, but confirm the neural voices exist in your region. Include one AI guest and one cloud-voiced reply in the dry run. Cost is small (roughly 16 USD per million characters, about a quarter of a cent per line). For Azure set `CLOUD_PROVIDER=azure`, `AZURE_SPEECH_KEY`, and `AZURE_SPEECH_REGION`.

## 4c. Saved stories (optional)

Saved stories live in a separate **Stories** bucket with no expiry rule (the Media bucket deletes everything after one day). `sst.config.ts` creates it and passes `STORY_BUCKET`. Set `STORY_SEAL_KEY` (`openssl rand -base64 32`) before the first deploy and keep it: changing it makes existing saved stories unreadable. Dry run: save a story from a finished game, open its page in a private window, vote, and start a game from it. Note the gallery index and vote counters are plain objects with last-writer-wins updates; a very busy gallery could show slightly stale counts.

## 4d. Selfie booth, table chat and voice calls (optional)

Selfies use the same image provider and budget as portraits (each one is claimed through the spend cap), so set a budget that has room. Include one selfie and one chat message to an AI guest in the dry run, delete a selfie, redo one, and confirm the original (`<code>/selfies/`) is gone from the Media bucket after the reveal. Voice calls use browser speech recognition on phones unless local services are on, so test on the phones you will use and note that iPhones need Safari or Chrome with microphone permission.

Video clips are 12 seconds on AWS by default (Nova Reel multi-shot; set `VIDEO_SECONDS` to 6, 12, 18 and so on, and note that the budget estimate scales with it), and about 18 seconds on local services (`LOCAL_VIDEO_SECONDS`). The multi-shot request shape is from documentation and has not run against real AWS. Timing can be tuned with `READY_COUNTDOWN_MS` (default 2 minutes) and `INTERMISSION_MS` (default 5 minutes).

## 5. Party-day checklist

- [ ] Deploy at least a day ahead; re-run `/api/healthz`.
- [ ] Budget alarm still active in AWS Budgets.
- [ ] Sign in as host; create the game; print or open [HOST_CARD.md](HOST_CARD.md).
- [ ] Big screen open on the TV; invite link and QR tested from one phone.
- [ ] Keep the **host tab open and awake** (it drives the picture worker). The game still plays without art if it sleeps.
- [ ] Fallback ready: set pictures to **Pause AI media**, or choose "Text only". The sample case works with no AI.

## 6. During and after

- If something loops or costs look wrong: in the host console choose **Pause AI media** and set the budget to what is already spent.
- After the party: use **Delete player photos** in the host console, then tear down if you do not need it (below).

## 7. Rollback and teardown

- **Roll back a bad deploy:** `git checkout <last-good-commit>`, then `cd web && npx sst deploy --stage party`.
- **Tear everything down:** `cd web && npx sst remove --stage party`. For non-production stages this deletes the table and bucket and all data in them. Note that the production stage retains them.

## 8. Cost expectations (estimates only)

About $2 to $5 for a 16 to 30 player party with portraits, scenes, and a few clips (see `web/src/lib/budget.ts` for the constants), plus well under $0.50 for Lambda, DynamoDB, and S3. Always confirm in Cost Explorer.

## 9. Known risks

See [docs/council/2026-10-23-launch-readiness.md](council/2026-10-23-launch-readiness.md). Still open: the AWS path has never run for real, optimistic-lock "Busy" errors can appear when many phones tap at once, a sleeping host tab pauses pictures, and unit and BDD suites under `web/test` have not been run.
