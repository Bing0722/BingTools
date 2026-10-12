import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../shared/contracts/app-api'

const api: AppApi = {
  platform: process.platform as AppApi['platform'],
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
  },
}
contextBridge.exposeInMainWorld('app', api)
