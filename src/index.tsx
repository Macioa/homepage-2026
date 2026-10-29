import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import { store } from './state'
import { Header } from './ui/components/Header'
import { Stage } from './ui/components/Stage'
import { Chat } from './ui/components/Chat'
import { Footer } from './ui/components/Footer'

import styles from './ui/styles.module.css'

const Root = document.getElementById('root')
if (Root)
  createRoot(Root).render(
    <StrictMode>
      <Provider store={store}>
        <div className={styles.app}>
          <Header />
          <Stage className={styles.stage}>
            <Chat />
          </Stage>
          <Footer />
        </div>
      </Provider>
    </StrictMode>
  )
