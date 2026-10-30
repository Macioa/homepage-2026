// Every piece of text the harness sends to the LLM. Nothing else lives here.

export const SYSTEM = `You answer visitor questions about Ryan's career. Do not answer anything else.
Only report information from tool calls. Do not embellish, invent, or assume.
Do not overshare. Only share enough information to answer the question directly.
Work in a tool loop: call tools to gather data, one step at a time.
Never repeat a tool call that already succeeded with the same args.
Call reset_context when the context is cluttered.
Call no_appropriate_tool when no tool fits the request.
Call off_topic_question when the question is not about Ryan's career.
Call finish_and_reply with the final reply once you have enough data to answer.`

export const reduce = (prompt: string) => `Rewrite this prompt in minimal reduced language.
Keep every fact, name and request. Drop filler words. Output only the rewrite.

${prompt}`

export const NO_TOOL_CALL = 'Call a tool. Call finish_and_reply when ready to answer.'

export const duplicateCall = (key: string) => `Refused: ${key} already succeeded. Use its result.`

export const NO_APPROPRIATE_TOOL = 'Noted. Try another tool, or call no_appropriate_tool again to end the loop and reply.'

export const unknownTool =(name: string) => `No tool named ${name}.`

export const selectKeys = (keys: string[]) => `Context was cleared. Choose which saved state keys to load back into context.
Keys: ${keys.join(', ')}`

export const FINAL_REPLY = 'Write the final reply to the visitor from the data above. Plain text, no tool calls.'

export const TOKEN_NOT_READY = 'Data access not ready. Try again.'

export const TOOL = {
  finishAndReply: 'end the tool loop with the final reply to the visitor',
  resetContext: 'clear the context, then choose which saved state to load back',
  noAppropriateTool: 'no tool fits the request',
  offTopicQuestion: "the question is not about Ryan's career; ends the conversation",
  selectKeys: 'choose the saved state keys to load into context',
  getAllSkills: 'list the names of all Ryan skills',
  getSkill: 'look up one Ryan skill and how long he used it',
  getSkills: 'look up several Ryan skills and how long he used each',
  pitchDetail: 'read Ryan pitches by exact slug',
  testGetSkills: 'list Ryan skills',
  testGetProjects: 'list Ryan projects',
  testSearchJobs: 'search Ryan jobs by keyword'
}

export const TOOL_ARG = {
  keys: 'saved state keys to load',
  query: 'keywords, e.g. react',
  skill: 'skill name, e.g. React',
  skills: 'skill names, e.g. ["React","Go"]',
  slugs: 'pitch slugs',
  mode: 'precise: actual days used; start_to_end: first to last use',
  reply: 'the final reply to the visitor, from tool data only. Plain text.'
}
