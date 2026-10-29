import '@fontsource-variable/source-serif-4/wght.css'
import '@fontsource-variable/source-serif-4/wght-italic.css'
import './styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useConfig } from './lib/config'
import { useExecucoes } from './lib/execucoes'
import { useUi } from './lib/ui'

// Só no desenvolvimento: os stores à mão no console (e nos testes de ponta a ponta), para o que
// passa por diálogo nativo, que a automação não alcança.
if (import.meta.env.DEV) Object.assign(window, { launcher: { useConfig, useExecucoes, useUi } })

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
