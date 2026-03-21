import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'

// loadConfigFromOutputs が null を返すケース（手動入力フォーム表示）
jest.mock('../../lib/storage', () => {
  const actual = jest.requireActual('../../lib/storage')
  return {
    ...actual,
    loadConfigFromOutputs: jest.fn(() => null),
  }
})

jest.mock('../../lib/auth', () => ({
  login: jest.fn(),
}))

import LoginScreen from '../LoginScreen'
import { login } from '../../lib/auth'
import { loadConfigFromOutputs } from '../../lib/storage'

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage as any)._resetStore()
})

describe('LoginScreen（手動入力モード）', () => {
  it('タイトルと入力フォームが表示される', () => {
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen onLogin={jest.fn()} />,
    )
    expect(getByText('poi 通知転送')).toBeTruthy()
    expect(getByPlaceholderText(/execute-api/)).toBeTruthy()
  })

  it('空のフォームでログインするとアラートが出る', () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const { getByText } = render(<LoginScreen onLogin={jest.fn()} />)

    fireEvent.press(getByText('ログイン'))

    expect(alertSpy).toHaveBeenCalledWith('入力エラー', '全ての項目を入力してください')
  })

  it('フォーム入力後にログインが成功するとコールバックが呼ばれる', async () => {
    const onLogin = jest.fn()
    ;(login as jest.Mock).mockResolvedValue({ jwt: 'token', email: 'user@example.com' })

    const { getByText, getByPlaceholderText } = render(
      <LoginScreen onLogin={onLogin} />,
    )

    fireEvent.changeText(getByPlaceholderText(/execute-api/), 'https://api.example.com/v1')
    fireEvent.changeText(getByPlaceholderText(/xxxxxxxxx/), 'client-id')
    fireEvent.changeText(getByPlaceholderText(/poi-webhook/), 'my-domain')
    fireEvent.press(getByText('ログイン'))

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('user@example.com')
    })
  })

  it('ログイン失敗時にアラートが出る', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    ;(login as jest.Mock).mockRejectedValue(new Error('ログインに失敗しました'))

    const { getByText, getByPlaceholderText } = render(
      <LoginScreen onLogin={jest.fn()} />,
    )

    fireEvent.changeText(getByPlaceholderText(/execute-api/), 'https://api.example.com/v1')
    fireEvent.changeText(getByPlaceholderText(/xxxxxxxxx/), 'client-id')
    fireEvent.changeText(getByPlaceholderText(/poi-webhook/), 'my-domain')
    fireEvent.press(getByText('ログイン'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('ログイン失敗', 'ログインに失敗しました')
    })
  })
})

describe('LoginScreen（プリセットモード）', () => {
  it('aws-outputs.json がある場合はボタンのみ表示', () => {
    ;(loadConfigFromOutputs as jest.Mock).mockReturnValue({
      apiUrl: 'https://api.example.com',
      clientId: 'preset-client',
      cognitoDomain: 'preset-domain',
    })

    const { getByText, queryByPlaceholderText } = render(
      <LoginScreen onLogin={jest.fn()} />,
    )

    expect(getByText('ログイン')).toBeTruthy()
    expect(queryByPlaceholderText(/execute-api/)).toBeNull()
  })
})
