import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import Components from 'unplugin-vue-components/vite'
// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 1234,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/v1': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  },
  resolve: {
    // 2. 配置别名
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },

  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      'pinia-plugin-persistedstate',
      'naive-ui',
      '@vueuse/core',
      'axios',
      'markdown-it',
      'highlight.js',
      'katex',
      'mathjs',
      'mermaid',
      '@antv/g6',
      'simple-mind-map',
      'pptxgenjs',
      'markstream-vue',
      'stream-markdown'
    ]
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate'],
          'vendor-ui': ['naive-ui', '@vueuse/core'],
          'vendor-markdown': [
            'markdown-it',
            'highlight.js',
            'katex',
            'markstream-vue',
            'stream-markdown'
          ],
          'vendor-mermaid': ['mermaid'],
          'vendor-graph': ['@antv/g6'],
          'vendor-mindmap': ['simple-mind-map'],
          'vendor-pptx': ['pptxgenjs'],
          'vendor-math': ['mathjs']
        }
      }
    }
  },
  plugins: [
    vue(),
    UnoCSS(),
    createSvgIconsPlugin({
      // 指定图标文件夹路径
      iconDirs: [path.resolve(process.cwd(), 'src/assets/icons')],
      // 指定symbolId格式
      symbolId: 'icon-[name]'
    }),
    AutoImport({
      imports: [
        'vue',
        {
          'naive-ui': ['useDialog', 'useNotification', 'useLoadingBar'],
          '@/components/MsMessage/useMessage': [['useMessage', 'useMsMessage']],
          '@/components/MsMessageBox/useMessageBox': [['useMessageBox', 'useMsMessageBox']]
        }
      ]
    }),
    Components({
      resolvers: [NaiveUiResolver()]
    }),
    electron({
      main: {
        entry: 'electron/main.js',
        vite: {
          build: {
            rollupOptions: {
              external: [
                'better-sqlite3',
                'electron-updater',
                '@anthropic-ai/sdk',
                'openai',
                'deepagents',
                'langchain',
                '@langchain/core',
                '@langchain/anthropic',
                '@langchain/openai',
                '@langchain/langgraph',
                '@langchain/tavily',
                'langsmith',
                'zod'
              ]
            }
          }
        }
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.js'),
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].js'
              }
            }
          }
        }
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {}
    })
  ]
});
