import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installBroadcastChannelPolyfill } from "./auth/installBroadcastChannelPolyfill";
import { setRuntimeEnv } from "./utils/env";

installBroadcastChannelPolyfill();
setRuntimeEnv(import.meta.env as Record<string, string | boolean | undefined>);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
