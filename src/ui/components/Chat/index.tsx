import style from '../../styles.module.css'
import ChatScreen from '../../chat/Chat.jsx'

// Box for the chat screen (see src/ui/chat).
export const Chat = () => (
  <section id='chat' className={style.chat}>
    <ChatScreen />
  </section>
)
