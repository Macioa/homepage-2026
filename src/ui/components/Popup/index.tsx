import { useId, type ReactNode } from 'react'
import style from './popup.module.css'

// Stateless popup: hover the trigger to show children in a row above it; click to pin open.
export const Popup = ({ id, trigger, triggerClassName, children }: {
  id?: string
  trigger: ReactNode
  triggerClassName?: string
  children: ReactNode
}) => {
  const inputId = useId()
  return (
    <div className={style.popup} id={id} data-popup>
      <input id={inputId} type='checkbox' className={style.toggle} />
      <label htmlFor={inputId} className={`${style.trigger} ${triggerClassName ?? ''}`}>
        {trigger}
      </label>
      <div className={style.menu}>{children}</div>
    </div>
  )
}
