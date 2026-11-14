import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import { store } from './state'
import { Header } from './ui/components/Header'
import { Stage } from './ui/components/Stage'
import { Chat } from './ui/components/Chat'
import { Footer } from './ui/components/Footer'
import { Projects } from './ui/components/Projects'
import { Intro } from './ui/components/Intro'

import styles from './ui/styles.module.css'
import { initTelemetry } from './telemetry'

initTelemetry()

const Root = document.getElementById('root')
if (Root)
  createRoot(Root).render(
    <StrictMode>
      <Provider store={store}>
        <div className={styles.app}>
          <Header />
          <Stage className={styles.stage}>
            <Chat />
            <Projects />
            <Intro />
          </Stage>
          <Footer />
        </div>
      </Provider>
    </StrictMode>
  )
