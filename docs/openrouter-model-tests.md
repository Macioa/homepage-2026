# OpenRouter backup model tests

Gemini is the chat's primary LLM. After 3 failed Gemini requests, or when the visitor clicks "Use alternate LLM.",
calls go to OpenRouter's listed `:free` models in order (`OPENROUTER_MODELS` in `netlify/llm.ts`). The free tier
allows 50 requests per UTC day and 20 per minute; buying at least 10 credits raises it to 1000 per day. Retests are
tracked in issue [#1](https://github.com/Macioa/homepage-2026/issues/1).

## Current model list

1. `baidu/ernie-5.5-flash-preview:free`

## Test method

Each question runs end to end in the local app (`netlify dev`) with a temporary dev-only override that pins one
OpenRouter model per request. Earlier answers are stripped from the context so a model can't copy them.

| Question | Pass when |
|---|---|
| A. "What projects has Ryan built?" | Lists several real project names |
| B. "Does Ryan know React?" | Yes, with years of experience |
| C. "What is a good recipe for banana bread?" | Refused with "That's not what i'm here for" |

C runs only if A and B both passed. A question fails on: error text shown, timeout, tool-call markup in the answer,
false refusal, empty answer, any single model call over 20000 ms, or the reported model not matching the requested
one. Ranking: all 3 passed first, then fewer calls, then lower average ms.

## 2026-11-24

| Model | A | B | C | Calls | Avg ms | Notes |
|---|---|---|---|---|---|---|
| baidu/ernie-5.5-flash-preview | pass | pass | pass | 5 | 6,037 | A listed 14 projects in 2 calls (8.5s + 7.5s) |
| nvidia/nemotron-3-ultra-550b-a55b | fail | pass | – | 5 | 9,230 | A answer was correct but its final call took 24.4s |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning | fail | pass | – | 5 | 11,494 | A: 2 queries then a function 500 after 30s |
| nvidia/nemotron-3.5-super-vl | fail | fail | – | 4 | 12,735 | A: 21.6s call then function timeout; B: Nvidia "content safety screening is temporarily unavailable" |
| google/gemma-4-31b-it | fail | fail | – | 2 | 3,078 | Rate-limited upstream on both |
| google/gemma-4-26b-a4b-it | fail | fail | – | 2 | 2,623 | Rate-limited upstream on both |
| inclusionai/ling-3.2-flash | fail | fail | – | 2 | 2,783 | Rate-limited upstream on both |
| particle-ai/particle-1 | fail | fail | – | 2 | 3,138 | Rate-limited upstream on both |

Calls and average ms include failed calls. Only ernie passed all three, so the list dropped to that one model;
nemotron-3.5-super-vl and nemotron-3-ultra-550b-a55b were removed.

Skipped: `nvidia/nemotron-3.5-lightning:free` (false refusal and looping in the earlier run), `liquid/lfm-3-1.7b:free`
(too small), `recursive/flint-v1.0:free` (no tool support). No candidate had an expiration date within 30 days.

Quota: about 20 of 50 free requests used (OpenRouter reported 18 used at the end; the last calls may not have been
counted yet).

## 2026-11-23

Stopped by the daily free limit.

| Model | A | B | C | Notes |
|---|---|---|---|---|
| baidu/ernie-5.5-flash-preview | pass (25s) | pass (12s) | pass | |
| nvidia/nemotron-3.5-super-vl | fail | pass (29s) | pass | A: 20s function timeout |
| nvidia/nemotron-3.5-lightning | fail | pass | pass | A: false off-topic refusal after 9 tool calls; B repeated one search 9 times |
| nvidia/nemotron-3-ultra-550b-a55b | – | – | – | 2 good calls on A, then hit the daily limit |
| inclusionai/ling-3.2-flash | fail | fail | fail | Rate-limited upstream |
| particle-ai/particle-1 | fail | fail | fail | Rate-limited upstream |

Never reached: google/gemma-4-26b-a4b-it, google/gemma-4-31b-it, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning.

Excluded: dots-studio/dots-3-note-preview (expiring 2026-12-31, likely source of `<dots_function_call>` markup, since
removed from OpenRouter) and liquid/lfm-3-1.7b (too small).
