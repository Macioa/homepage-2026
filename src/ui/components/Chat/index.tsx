import style from '../../styles.module.css'
import ChatScreen from '../../chat/Chat.jsx'
import { runHarness } from '../../../harness'
import { store } from '../../../state'

const send = (prompt: string, signal: AbortSignal) => runHarness({ prompt, store, signal })

// Box for the chat screen (see src/ui/chat).
export const Chat = () => (
  <section id='chat' className={style.chat}>
    <ChatScreen onSend={send} />
  </section>
)
