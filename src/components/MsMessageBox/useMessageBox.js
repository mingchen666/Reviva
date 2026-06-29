import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import MsMessageBox from './MsMessageBox.vue'

let queue = Promise.resolve()

function mount(options) {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const app = createApp({
      setup() {
        return () => h(MsMessageBox, {
          ...options,
          onConfirm: (val) => {
            cleanup()
            resolve(val)
          },
          onCancel: () => {
            cleanup()
            resolve(options.type === 'prompt' ? null : false)
          },
        })
      },
    })

    const pinia = createPinia()
    app.use(pinia)
    app.mount(container)

    function cleanup() {
      setTimeout(() => {
        app.unmount()
        container.remove()
      }, 250)
    }
  })
}

function enqueue(fn) {
  queue = queue.then(() => fn())
}

export function useMessageBox() {
  return {
    confirm(options) {
      return new Promise((resolve) => {
        enqueue(() => mount({ type: 'confirm', ...options }).then(resolve))
      })
    },
    alert(options) {
      return new Promise((resolve) => {
        enqueue(() => mount({ type: 'alert', closeOnOverlay: true, confirmText: '知道了', ...options }).then(resolve))
      })
    },
    prompt(options) {
      return new Promise((resolve) => {
        enqueue(() => mount({ type: 'prompt', closeOnOverlay: false, ...options }).then(resolve))
      })
    },
  }
}