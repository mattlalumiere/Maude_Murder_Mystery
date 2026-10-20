#!/usr/bin/env bash
# Builds PORTABLE_PROMPT.md: one paste-able file for ChatGPT / Gemini / any chatbot.
set -euo pipefail
cd "$(dirname "$0")"
out=PORTABLE_PROMPT.md
{
  echo "# SYSTEM INSTRUCTIONS, paste this whole file as your first message, then say: \"Start Host Mode\" (or \"Player Mode\")."
  echo
  echo "Follow everything below as your instructions for this conversation. Where it refers to files, use the sections included here."
  echo
  # SKILL.md without YAML frontmatter
  awk 'BEGIN{f=0} /^---$/ {f++; next} f>=2 {print}' SKILL.md
  echo
  echo "---"
  echo
  cat references/case-design.md
  echo
  echo "---"
  echo
  cat references/content-banks.md
} > "$out"
echo "Wrote $out ($(wc -w < "$out") words)"
