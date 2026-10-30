import style from '../../styles.module.css'
import ChatScreen from '../../chat/Chat.jsx'
import { runHarness } from '../../../harness'
import { store } from '../../../state'
import { useGeminiUsage } from '../../../state/hooks'

const send = (prompt: string, signal: AbortSignal) => runHarness({ prompt, store, signal })

// Box for the chat screen (see src/ui/chat), with the shared Gemini rate window.
export const Chat = () => (
  <section id='chat' className={style.chat}>
    <ChatScreen onSend={send} usage={useGeminiUsage()} />
  </section>
)
