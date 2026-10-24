import { hostIdFromSession } from "@/auth";
import { getTextModel } from "@/lib/ai/config";
import { localHealth } from "@/lib/ai/mcp-client";
import { getImageModel } from "@/lib/ai/media";
import { getSpeech } from "@/lib/ai/speech";
import { handle, json } from "@/lib/http";
import { HttpError } from "@/lib/store";

/** Which AI services this server can use. Host only; nothing secret is returned. */
export async function GET() {
  return handle(async () => {
    if (!(await hostIdFromSession())) throw new HttpError(401, "Sign in as a host");
    return json({
      local: await localHealth(),
      cloud: { text: getTextModel()?.id ?? null, speech: getSpeech().id, image: getImageModel().id },
    });
  });
}
