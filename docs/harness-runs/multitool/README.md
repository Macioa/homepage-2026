# Multi-tool test runs

Ten prompts that each need two or more tools, run one after another in Chrome with Llama-3.2-1B-Instruct-q4f16_1-MLC (WebGPU) on 2026-10-28. The harness slice was reset before each test, so no test saw another one's history. Each file has the initial store state and a diff of `state.harness` for every dispatched action.

- **Finished `done`:** 9/10
- **Called 2+ distinct tools:** 9/10
- **Called every expected tool:** 9/10
- **Total time:** 459 s (average 45.9 s per test)

| # | test | status | steps | tool calls | distinct tools | missing | time |
|---|---|---|---|---|---|---|---|
| 1 | [React work and WebGPU projects](01-react-work-and-webgpu-projects.md) | `done` | 6 | 5 | `search_experience`, `search_projects` | — | 40.1 s |
| 2 | [Companies and side projects](02-companies-and-side-projects.md) | `done` | 4 | 3 | `search_experience`, `search_projects` | — | 29.3 s |
| 3 | [TypeScript job and project](03-typescript-job-and-project.md) | `done` | 4 | 3 | `search_experience`, `search_projects` | — | 29.3 s |
| 4 | [Node.js backend vs frontend projects](04-node-backend-vs-frontend-projects.md) | `done` | 4 | 3 | `search_experience`, `search_projects` | — | 31.8 s |
| 5 | [Postgres work and realtime projects](05-postgres-and-websockets.md) | `done` | 4 | 3 | `search_experience`, `search_projects` | — | 23.2 s |
| 6 | [Mentoring and the in-browser LLM project](06-mentoring-and-llm-project.md) | `done` | 6 | 5 | `search_experience`, `search_projects` | — | 34.0 s |
| 7 | [Redux at a job and in a project](07-redux-job-and-project.md) | `timeout` | 6 | 3 | `search_experience`, `search_projects` | — | 181.0 s |
| 8 | [Look up React work, then message](08-react-lookup-then-message.md) | `done` | 4 | 3 | `search_experience`, `send_message` | — | 43.0 s |
| 9 | [Check for a WebGPU project, then message](09-webgpu-check-then-message.md) | `done` | 4 | 3 | `search_projects`, `send_message` | — | 27.0 s |
| 10 | [All three tools: TypeScript role](10-three-tools-typescript-role.md) | `done` | 2 | 1 | `search_experience` | `search_projects`, `send_message` | 20.5 s |

## Prompts and answers

### 1. React work and WebGPU projects

- **Prompt:** What has Ryan built with React at work, and does he have any WebGPU projects?
- **Caveman:** What has Ryan built with React at work, and does he have any WebGPU projects?
- **Answer:** I'm sorry, I don't have any information about Ryan's career or projects. I can only provide information about the tools I use, and I don't have any knowledge about Ryan. If you can provide more context or information, I'll do my best to help.

### 2. Companies and side projects

- **Prompt:** Which companies has Ryan worked for, and what side projects has he shipped?
- **Caveman:** Which companies has Ryan worked for, and what side projects has he shipped?
- **Answer:** Ryan has worked for or shipped side projects for the following companies: Sample Co., Example Labs, and Placeholder Studio.

### 3. TypeScript job and project

- **Prompt:** Has Ryan used TypeScript in a job? Also show me one of his TypeScript projects.
- **Caveman:** Has Ryan used TypeScript in a job? Also show me one of his TypeScript projects.
- **Answer:** I don't know if Ryan has used TypeScript in a job. However, I can tell you that he has worked on a project that involves building a real-time metrics dashboard using TypeScript and WebSockets. His project is called 'Sample Dashboard'.

### 4. Node.js backend vs frontend projects

- **Prompt:** Compare Ryan's Node.js backend experience with his frontend projects.
- **Caveman:** Compare Ryan's Node.js experience with his projects.
- **Answer:** Ryan's Node.js experience is mostly unknown, as he has not publicly discussed his career or work on his resume. However, his projects, such as the homepage of his website and the Sample Dashboard, suggest that he has expertise in Node.js and has built projects that utilize it. The Search Experience tool suggests that he has experience in software engineering, with a focus on Node.js, and has worked on projects that involve building APIs, data pipelines, and real-time metrics dashboards.

### 5. Postgres work and realtime projects

- **Prompt:** Did Ryan ever work with Postgres or data pipelines, and has he built anything realtime with WebSockets?
- **Caveman:** did Ryan work with Postgres or data pipelines? has he built?
- **Answer:** Ryan has worked with Postgres and has built Node.js APIs and data pipelines on Postgres.

### 6. Mentoring and the in-browser LLM project

- **Prompt:** Tell me about Ryan's mentoring at work, and which of his projects runs an LLM in the browser.
- **Caveman:** Tell me about Ryan's mentoring at work, and which of his projects runs an LLM in the browser.
- **Answer:** I couldn't find any information about a project at Sample Co. that runs an LLM in the browser.

### 7. Redux at a job and in a project

- **Prompt:** Did Ryan use Redux at a job, and which of his projects uses Redux?
- **Caveman:** Did Ryan use Redux at a job?
- **Answer:** Timed out: no answer within the 180 s limit per request (stopped at step 6).

### 8. Look up React work, then message

- **Prompt:** Hi, I'm Sam from Acme. Look up Ryan's React experience, then send him a message asking if he's open to an interview.
- **Caveman:** I'm Sam from Acme. Look up Ryan's React experience, then send him a message asking if he's open to an interview.
- **Answer:** I don't have any information about Ryan's career or experience with React.

### 9. Check for a WebGPU project, then message

- **Prompt:** Check whether Ryan has a WebGPU project. If he does, send him a message from Priya: loved the WebGPU demo, want to chat?
- **Caveman:** Check whether Ryan has a WebGPU project. If he does, send him a message from Priya: loved the WebGPU demo, want to chat?
- **Answer:** Loved the WebGPU demo, want to chat?

### 10. All three tools: TypeScript role

- **Prompt:** I'm Jordan from Initech. Find Ryan's TypeScript job and his TypeScript project, then message him that we have a TypeScript role open.
- **Caveman:** I'm Jordan from Initech. Find Ryan's TypeScript job. Message him that we have a TypeScript role open.
- **Answer:** We have a TypeScript role open for a Senior Software Engineer at Initech. It's a great opportunity to work on a cutting-edge project. The role is currently available, but we need a strong TypeScript developer to join our team. Interested candidates should apply ASAP. We'll be in touch to discuss the details.
