Model Compare app using Next.js and OpenRouter.

## Setup

1) Create `.env.local` in the project root:

```
OPENROUTER_API_KEY=your_key_here
```

2) Run the dev server:

```bash
npm run dev
```

## Usage

- Select up to four models from the header.
- Type a prompt and press Send to stream responses from all selected models.
- Use Pick best on a column to highlight it; Copy to copy a response; Copy prompt to copy your prompt.

## Notes

- Server route `src/app/api/openrouter/route.ts` fans out requests to the selected models and streams newline-delimited JSON events.
- Default models configured:
  - `openai/gpt-5`
  - `anthropic/claude-4-sonnet`
  - `google/gemini-2.5-pro`
  - `deepseek/deepseek-chat`
