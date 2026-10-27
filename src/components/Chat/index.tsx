import style from '../../styles.module.css'
import LlmChat from '../../ui/Chat.jsx'

// Box for the in-browser LLM chat (ported from the browser_llm POC in src/llm and src/ui).
export const Chat = () => (
  <section id='chat' className={style.chat}>
    <LlmChat />
  </section>
)
