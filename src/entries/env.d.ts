/// <reference types="vite/client" />

import type { PetBridge } from './preload'

declare global {
  interface Window {
    pet: PetBridge
  }
}

export {}
