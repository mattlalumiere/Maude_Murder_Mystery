// Client-safe list of selfie styles (labels only). Prompts live on the server in selfie.ts.
export const SELFIE_STYLES = [
  { id: "wanted", label: "Wanted poster" },
  { id: "mugshot", label: "Silly mugshot" },
  { id: "noir", label: "Film noir" },
  { id: "royal", label: "Royal portrait" },
  { id: "villain", label: "Cartoon villain" },
  { id: "sidekick", label: "Superhero sidekick" },
] as const;
