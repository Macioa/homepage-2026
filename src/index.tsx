import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import { store } from './store'
import { Header } from './components/Header'
import { Stage } from './components/Stage'
import { Chat } from './components/Chat'
import { Footer } from './components/Footer'

import styles from './styles.module.css'

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
