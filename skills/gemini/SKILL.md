---
name: gemini
description: Gemini CLI for one-shot Q&A, summaries, and generation.
homepage: https://ai.google.dev/
metadata:
  {
    "openclaw":
      {
        "emoji": "♊️",
        "requires": { "bins": ["gemini"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "gemini-cli",
              "bins": ["gemini"],
              "label": "Install Gemini CLI (brew)",
            },
          ],
      },
  }
---

# Gemini CLI

Use Gemini in one-shot mode with a positional prompt (avoid interactive mode).

## Available Models

**Gemini 3 Flash** (Default)
- Fast, efficient for everyday tasks
- Best for: Q&A, summaries, quick generation
- Use: `gemini --model gemini-3-flash "Prompt..."`

**Gemini 3 Pro**
- Most capable model with advanced reasoning
- Supports native image generation via Nano Banana
- Best for: Complex tasks, image generation, detailed analysis
- Use: `gemini --model gemini-3-pro "Generate an image of..."`

**Image Generation**
- Gemini 3 Pro includes native image generation (Nano Banana)
- For higher quality images, use Imagen 3 separately
- Image generation prompts: Be descriptive and specific

Quick start

- `gemini "Answer this question..."`
- `gemini --model gemini-3-flash "Prompt..."`
- `gemini --model gemini-3-pro "Generate an image..."`
- `gemini --output-format json "Return JSON"`

Extensions

- List: `gemini --list-extensions`
- Manage: `gemini extensions <command>`

Notes

- If auth is required, run `gemini` once interactively and follow the login flow.
- Avoid `--yolo` for safety.
- Default model: gemini-3-flash (fast, efficient)
- Use gemini-3-pro for image generation and complex tasks
