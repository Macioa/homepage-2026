import style from '../../styles.module.css'
import ChatScreen from '../../chat/Chat.jsx'
import { runHarness } from '../../../harness'
import { store } from '../../../state'
import { freshToken } from '../../../state/auth'
import { fetchGeminiUsage } from '../../../state/usage'
import { onNetworkError } from '../../../state/networkErrors'
import { transcribeAudio } from '../../../connections/transcribe'
import { useAppSelector, useGeminiUsage } from '../../../state/hooks'

const send = (prompt: string, signal: AbortSignal) => runHarness({ prompt, store, signal })

// A recorded voice prompt to text; the call counts in the Gemini rate window, so the bar is reread after it.
async function transcribe(audio: Blob, signal: AbortSignal) {
  const token = await freshToken(store.getState, store.dispatch)
  if (!token) throw new Error('no chat token')
  try {
    return await transcribeAudio(audio, token, signal, onNetworkError(store.dispatch))
  } finally {
    store.dispatch(fetchGeminiUsage())
  }
}

// Box for the chat screen (see src/ui/chat), with the shared Gemini rate window. Stays mounted while
// the projects page is open so the conversation survives the round trip.
export const Chat = () => {
  const hidden = useAppSelector(s => s.ui.view !== 'chat')
  // No chat token yet: no onSend, so Send (button and Enter) stays disabled instead of failing with no data access.
  const ready = useAppSelector(s => Boolean(s.auth.token))
  return (
    <section id='chat' className={style.chat} hidden={hidden}>
      <ChatScreen onSend={ready ? send : undefined} onTranscribe={ready ? transcribe : undefined} usage={useGeminiUsage()} />
    </section>
  )
}
