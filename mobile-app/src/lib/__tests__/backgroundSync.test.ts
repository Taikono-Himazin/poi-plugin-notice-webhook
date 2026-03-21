import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'

;(global as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary')

import {
  BACKGROUND_SYNC_TASK,
  registerBackgroundSync,
  unregisterBackgroundSync,
} from '../backgroundSync'

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage as any)._resetStore()
})

describe('BACKGROUND_SYNC_TASK', () => {
  it('タスク名が定義されている', () => {
    expect(BACKGROUND_SYNC_TASK).toBe('poi-notice-background-sync')
  })

  it('defineTask で登録されている', () => {
    // defineTask はモジュール読み込み時に呼ばれるため、
    // モックの _tasks に関数が登録されているかで確認する
    expect((TaskManager as any)._tasks['poi-notice-background-sync']).toBeDefined()
  })
})

describe('registerBackgroundSync', () => {
  it('未登録の場合はタスクを登録する', async () => {
    ;(TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false)
    await registerBackgroundSync()
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(
      'poi-notice-background-sync',
      { minimumInterval: 900 },
    )
  })

  it('登録済みの場合はスキップする', async () => {
    ;(TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true)
    await registerBackgroundSync()
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled()
  })
})

describe('unregisterBackgroundSync', () => {
  it('タスクを解除する', async () => {
    await unregisterBackgroundSync()
    expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith('poi-notice-background-sync')
  })

  it('エラーが発生しても例外を投げない', async () => {
    ;(BackgroundTask.unregisterTaskAsync as jest.Mock).mockRejectedValue(new Error('not registered'))
    await expect(unregisterBackgroundSync()).resolves.toBeUndefined()
  })
})
