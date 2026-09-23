/// <reference types="vite/client" />

import type { PetBridge } from '../../preload/index'

declare global {
  interface Window {
    pet: PetBridge
  }
}

export {}
