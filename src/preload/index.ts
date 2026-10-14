import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateSnapshot } from '../shared/contracts/updater'
import type { AppApi } from '../shared/contracts/app-api'
import type { SimulatorEvent } from '../shared/contracts/simulator'
import type { SimulatorCommand } from '../shared/schemas/simulator'
// 包装固定通道，不把 ipcRenderer 或原始 Electron event 暴露给页面。
const command = (value: SimulatorCommand) => ipcRenderer.invoke('simulator:command', value)
const api: AppApi = {
  platform: process.platform as AppApi['platform'],
  settings: { get: () => ipcRenderer.invoke('settings:get'), update: (patch) => ipcRenderer.invoke('settings:update', patch) },
  updater: {
    getSnapshot: () => ipcRenderer.invoke('updater:snapshot'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: UpdateSnapshot) => listener(snapshot)
      ipcRenderer.on('updater:event', handler)
      return () => ipcRenderer.removeListener('updater:event', handler)
    },
  },
  simulator: {
    getSnapshot: () => ipcRenderer.invoke('simulator:snapshot'),
    saveCustomer: (customer) => command({ type: 'saveCustomer', customer }),
    deleteCustomer: (customerId) => command({ type: 'deleteCustomer', customerId }),
    selectCustomer: (customerId) => command({ type: 'selectCustomer', customerId }),
    saveEndpoint: (customerId, endpoint) => command({ type: 'saveEndpoint', customerId, endpoint }),
    deleteEndpoint: (customerId, endpointId) => command({ type: 'deleteEndpoint', customerId, endpointId }),
    setEndpointEnabled: (customerId, endpointId, enabled) => command({ type: 'setEndpointEnabled', customerId, endpointId, enabled }),
    start: (customerId) => command({ type: 'start', customerId }), stop: () => command({ type: 'stop' }),
    clearLogs: (customerId) => command({ type: 'clearLogs', customerId }),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: SimulatorEvent) => listener(payload)
      ipcRenderer.on('simulator:event', handler)
      return () => ipcRenderer.removeListener('simulator:event', handler)
    },
  },
}
contextBridge.exposeInMainWorld('app', api)
