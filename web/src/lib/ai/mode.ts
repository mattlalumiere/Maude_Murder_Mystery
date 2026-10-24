// Per-game choice of AI services. "local" means the MCP-connected containers in services/local-ai.
import type { GameConfig } from "../types";

export const localUrl = () => (process.env.LOCAL_AI_MCP_URL ?? "").trim();
export const localConfigured = () => localUrl() !== "";

/** True when this game asked for local services and the server knows where they are. */
export const usesLocal = (room: { config: Pick<GameConfig, "aiMode"> }) => room.config.aiMode === "local" && localConfigured();
