// Every piece of text the harness sends to the LLM. Nothing else lives here.

export const SYSTEM = `You answer visitor questions about Ryan's career. Do not answer anything else.
Only report information from tool calls. Do not embellish, invent, or assume.
Do not overshare. No TMI. Only share enough information to answer the question directly.
Use tables and structured replies when appropriate. Use first 10-15 for long lists - choose by response order unless prompt asks specifics.
Answer immmediately when you have enough information. Do not explore tools needlessly. Minimum necessary.`

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
  finishAndReply: 'End the tool loop with the final reply to the visitor.',
  resetContext: 'clear the context, then choose which saved state to load back',
  noAppropriateTool: 'no tool fits the request',
  offTopicQuestion: "the question is not about Ryan's career; ends the conversation",
  selectKeys: 'choose the saved state keys to load into context',
  getAllSkills: 'list the names of all Ryan skills in order by significance',
  getSkill: 'look up one Ryan skill and how long he used it',
  getSkills: 'look up several Ryan skills and how long he used each',
  getAllPitches: 'list slug, title and when to use every Ryan pitch, no text',
  getPitches: 'read Ryan pitch text by exact slugs from get_all_pitches, no skills or evidence',
  pitchDetail: 'read Ryan pitches with skills and evidence by exact slugs (list them with graphql_query pitchCatalogCollection)',
  getAllFaqs: 'list slug and question of every FAQ about Ryan, no answers',
  getFaq: 'read one FAQ answer by exact slug from get_all_faqs',
  getFaqs: 'read several FAQ answers by exact slugs from get_all_faqs',
  sendMessage: 'send Ryan a message. Only when the visitor asks to contact Ryan; use their words',
  graphqlQuery: `Read Ryan's career data with a GraphQL query (read only, no mutations).
Shape: { xCollection(first:N, after:cursor, filter:{col:{eq|neq|in|ilike|is:NULL}}, orderBy:[{col:AscNullsLast|DescNullsLast}]) { edges { node { ... } } pageInfo { hasNextPage endCursor } } }
Names are camelCase (start_year -> startYear). Single parent = FK column without _id (employer_id -> employer). Children = <table>Collection.
Use only the fields listed. List fields (keywords, toolsUsed, skills, imageUrls) filter with {contains:["x"]}, not ilike.
FAQ: list faqCollection { slug question } first, then read the answer by exact slug. Do not guess slugs. "dates" = startDay startMonth startYear endDay endMonth endYear. Every table has id.

| Collection | Fields | Links to |
|---|---|---|
| employer | name address phone website companyDesc resumeDesc endTitle private, dates | employmentTitlesCollection, skillLinksCollection |
| employmentTitles | name desc remote private, dates | employer, skillLinksCollection |
| educationAndTraining | name address phone website descShort descLong completed accredited attending remote private gpa identificationNumber issuingAuthority specialty, dates | skillLinksCollection |
| personalGrowth | name descShort descLong url otherInfo private, dates | skillLinksCollection, pitchGrowthCollection, projectGrowthCollection |
| skills | name desc type private | skillLinksCollection, skillGroupMembersCollection, pitchSkillsCollection, projectSkillsCollection |
| skillLinks | private | skill, employer, employmentTitle, educationAndTraining, personalGrowth |
| skillGroups / skillGroupMembers | name desc / – | skillGroupMembersCollection / skill, group |
| pitches | slug type title useWhen material keywords | pitchSkillsCollection, pitchEvidenceCollection, pitchGrowthCollection, pitchProjectsCollection |
| pitchEvidence | note | pitch, employmentTitle, employer, educationAndTraining |
| pitchCatalog (view) | slug title useWhen keywords skills evidenceCount | pitch |
| projects | name desc problemToSolve keyFeatures toolsUsed liveUrl sourceUrl objective result bragDetail imageUrls private, dates | projectSkillsCollection, projectGrowthCollection, pitchProjectsCollection |
| pitchSkills / projectSkills / pitchGrowth / projectGrowth / pitchProjects | – | the two linked rows |
| faq | slug question answer | – |`,
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
  faqSlug: 'FAQ slug',
  faqSlugs: 'FAQ slugs',
  message: "the visitor's message to Ryan",
  from: "the visitor's name or email, if given",
  mode: 'precise: actual days used; start_to_end: first to last use',
  reply: 'the final reply to the visitor',
  graphqlQuery: 'GraphQL query text, e.g. { skillsCollection(first:5) { edges { node { name } } } }'
}
