import style from '../../styles.module.css'
import ChatScreen from '../../chat/Chat.jsx'
import { runHarness } from '../../../harness'
import { store } from '../../../state'
import { useAppSelector, useGeminiUsage } from '../../../state/hooks'

const send = (prompt: string, signal: AbortSignal) => runHarness({ prompt, store, signal })

// Box for the chat screen (see src/ui/chat), with the shared Gemini rate window. Stays mounted while
// the projects page is open so the conversation survives the round trip.
export const Chat = () => {
  const hidden = useAppSelector(s => s.ui.view !== 'chat')
  // No chat token yet: no onSend, so Send (button and Enter) stays disabled instead of failing with no data access.
  const ready = useAppSelector(s => Boolean(s.auth.token))
  return (
    <section id='chat' className={style.chat} hidden={hidden}>
      <ChatScreen onSend={ready ? send : undefined} usage={useGeminiUsage()} />
    </section>
  )
}
