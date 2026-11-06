// 扫码登录流程：包装 SDK client.loginWithQr 的回调，转发为 IPC 事件。
// 真正的凭证保存与 monitor 启动由 WeChatBridgeService 在 login() 成功后处理。

export class QrLoginService {
  constructor({ client, send, logger = console }) {
    this.client = client
    this.send = send
    this.logger = logger
  }

  async login() {
    return await this.client.loginWithQr({
      on_qrcode: (url) => this.send('wechat-bridge:qr-url', { url: String(url || '') }),
      on_scanned: () => this.send('wechat-bridge:scanned', {}),
      on_expired: () => this.send('wechat-bridge:expired', {}),
    })
  }
}
