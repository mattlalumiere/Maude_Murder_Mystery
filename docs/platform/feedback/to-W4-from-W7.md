# W7 to W4/W5: optional `aiDegraded` in hostView

The host console renders a notice when `hostView` exposes an optional boolean `aiDegraded` (AI fell back to the sample case). It also falls back to `caseSource === "sample"`. Please add `aiDegraded?: boolean` to `hostView` when W5's gateway reports a degraded generation. No other view changes needed.
