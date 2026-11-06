import { getAppVersion } from '@/utils/tools'

const appVersion = getAppVersion()

export const RELEASE_CONFIG = {
  downloadUrl: 'https://pan.quark.cn/s/9cbc820db4ef',
  fallbackLabel: '夸克网盘下载',
  latestVersion: appVersion,
  releaseNotes: '当前发布通道用于在自动更新不可达时提供备用下载。',
  updateSources: [
    {
      id: 'reviva-github-releases',
      type: 'github',
      name: 'GitHub Releases',
      url: 'https://api.github.com/repos/mingchen666/Reviva/releases?per_page=20',
      downloadUrl: 'https://github.com/mingchen666/Reviva/releases/latest',
      canAutoDownload: false,
    },
    {
      id: 'reviva-website',
      type: 'manifest',
      name: 'Reviva 官网发布通道',
      url: 'https://www.reviva.cn/latest.json',
      downloadUrl: 'https://www.reviva.cn/download.html',
      canAutoDownload: false,
    },
    {
      id: 'reviva-quark',
      type: 'manual',
      name: '夸克网盘备用发布',
      version: appVersion,
      downloadUrl: 'https://pan.quark.cn/s/9cbc820db4ef',
      releaseNotes: '当前发布通道用于在自动更新不可达时提供备用下载。',
      canAutoDownload: false,
    },
  ],
}

export const versionChangelog = [
  { type: 'new', text: '新增新手教程导航链接（新手小白不会使用的可以看这个）' },
  { type: 'new', text: '新增微信ClawBot，扫码即可连接对话，方便管理(beta)' },
  { type: 'new', text: '新增全局字体自定义设置' },
  { type: 'improve', text: '优化一些主题ui和修复一些字体颜色，改善ui' },
  { type: 'new', text: '添加模型后支持自动启用' },
  { type: 'new', text: '模型配置页面支持一键启用和禁用模型' },
  { type: 'new', text: '支持添加自定义模型服务商，选择请求协议、填写名称即可创建自定义模型服务商' },
  { type: 'fix', text: '修复powershell和cmd命令执行全部拦截问题' },
  { type: 'new', text: '新增Linux系统安装包支持' },
  { type: 'improve', text: '调整Reviva关闭最小化托盘菜单，默认显示' },
  { type: 'improve', text: '清除工具无效开关' },
  { type: 'improve', text: '优化完善PPT创作工具' },
  { type: 'fix', text: '修复笔记文件夹级联恢复' },
  { type: 'new', text: '新增支持回收站类型：任务记录，对话分组' },
  { type: 'new', text: '新增外部知识库源腾讯ima知识库' },
  { type: 'improve', text: '默认模型页面ui选择器优化' },
  { type: 'improve', text: '修复Mac打包不内置officeCLI问题' },
  { type: 'improve', text: '更新office相关工具' },
  { type: 'improve', text: '完善优化一些页面ui' },
  { type: 'fix', text: '修复一些其他问题...' },
]
