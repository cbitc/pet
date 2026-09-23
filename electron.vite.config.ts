import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/entries/main.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/entries/preload.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html')
        }
      }
    },
    resolve: {
      // dev 下 Vite 以 src/renderer 为根，HTML 无法用相对路径加载根之外的组装根：
      // 浏览器会把 ../entries/x 归一化成 /entries/x 再来请求，而根目录下并没有 entries/。
      // 这里把这两个"看似根路径"的请求映射回真实目录（构建时 HTML 走原生相对路径
      // 解析，不经过别名，因此打包产物与此无关）。
      alias: {
        '/entries': resolve(__dirname, 'src/entries'),
        '/adapters': resolve(__dirname, 'src/adapters')
      }
    }
  }
})
