// electron/menu.js
import { app, shell, Menu } from 'electron'

export function createMenu(win) {
  const template = [
    // 1. Mac 专属：应用名称菜单 (左上角第一个)
    ...(process.platform === 'darwin'
      ? [
        {
          label: app.getName(),
          submenu: [
            { label: '关于', role: 'about' },
            { type: 'separator' },
            { label: '隐藏', role: 'hide' },
            { label: '隐藏其他', role: 'hideothers' },
            { label: '显示全部', role: 'unhide' },
            { type: 'separator' },
            { label: '退出', role: 'quit' }
          ]
        }
      ]
      : []),

    // 2. 编辑菜单 (Mac 必须有，否则复制粘贴快捷键失效)
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },

    // 3. 开发菜单 (新增：包含开发者工具)
    {
      label: '开发',
      submenu: [
        {
          label: '打开开发者工具',
          accelerator: 'CmdOrCtrl+Shift+I', // 设置快捷键
          click: () => {
            // 打开当前窗口的开发者工具
            win.webContents.openDevTools()
          }
        },
        { type: 'separator' },
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            win.webContents.reload()
          }
        },
        {
          label: '强制重新加载',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            win.webContents.reloadIgnoringCache()
          }
        }
      ]
    },

    // 4. 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '访问官网',
          click: () => {
            shell.openExternal('https://your-website.com')
          }
        },
        {
          label: '检查更新',
          click: () => {
            win.webContents.send('check-for-update')
          }
        },
        {
          label: '关于',
          accelerator: 'CmdOrCtrl+F1',
          click: () => {
            win.webContents.send('show-about-modal')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
