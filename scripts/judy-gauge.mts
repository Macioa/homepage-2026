// Gauge Judy's scores on known good and bad answers: node --env-file=.env.local scripts/judy-gauge.mts
import { alerting, ALERT_BELOW, judge } from '../netlify/functions/judy.mts'

const tools = { 'toolCalls.get_projects()': { ok: true, result: [{ name: 'homepage-2026', stack: 'React, Three.js, Netlify, Gemini' }] } }
const cases = [
  { label: 'good', prompt: 'What is homepage-2026 built with?', answer: 'homepage-2026 is built with React, Three.js, Netlify and Gemini.' },
  { label: 'good-terse', prompt: 'What is homepage-2026 built with?', answer: 'React, Three.js, Netlify, Gemini.' },
  {
    label: 'good-chatty',
    prompt: 'hi, what stack is your homepage?',
    answer: 'Hey! My homepage (homepage-2026) runs on React with Three.js for the 3D bits, hosted on Netlify, and Gemini powers this chat.'
  },
  { label: 'partial', prompt: 'What is homepage-2026 built with, and when was it started?', answer: 'It uses React and Three.js.' },
  {
    label: 'hallucination',
    prompt: 'What is homepage-2026 built with?',
    answer: 'homepage-2026 is built with Angular, Rust and AWS Lambda, and won a Webby award.'
  },
  { label: 'off_topic', prompt: 'What is homepage-2026 built with?', answer: 'The weather in Paris is sunny today.' }
]

for (let round = 0; round < 3; round++)
  for (const c of cases) {
    const v = await judge({ prompt: c.prompt, history: [], toolResults: tools, answer: c.answer })
    console.log(round, c.label.padEnd(14), alerting(v) ? 'ALERT' : 'ok   ', JSON.stringify(v.scores), v.pass, v.primary_issue)
  }
console.log('ALERT_BELOW', ALERT_BELOW)
