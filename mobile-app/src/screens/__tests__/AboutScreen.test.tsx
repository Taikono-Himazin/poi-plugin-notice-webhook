import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

import AboutScreen from '../AboutScreen'

describe('AboutScreen', () => {
  it('アプリ名とバージョンが表示される', () => {
    const { getByText } = render(<AboutScreen onBack={jest.fn()} />)

    expect(getByText('poi 通知転送')).toBeTruthy()
    expect(getByText(/バージョン/)).toBeTruthy()
  })

  it('戻るボタンを押すと onBack が呼ばれる', () => {
    const onBack = jest.fn()
    const { getByText } = render(<AboutScreen onBack={onBack} />)

    fireEvent.press(getByText('← 戻る'))
    expect(onBack).toHaveBeenCalled()
  })

  it('使用ライブラリ一覧が表示される', () => {
    const { getByText } = render(<AboutScreen onBack={jest.fn()} />)

    expect(getByText('React Native')).toBeTruthy()
    expect(getByText('Expo')).toBeTruthy()
    expect(getByText('axios')).toBeTruthy()
    expect(getByText('AsyncStorage')).toBeTruthy()
  })

  it('権利表示セクションが表示される', () => {
    const { getByText } = render(<AboutScreen onBack={jest.fn()} />)

    expect(getByText(/非公式ツール/)).toBeTruthy()
    expect(getByText(/taikonohimazin/)).toBeTruthy()
  })

  it('GitHub リンクが表示される', () => {
    const { getByText } = render(<AboutScreen onBack={jest.fn()} />)

    expect(getByText('GitHub')).toBeTruthy()
    expect(getByText('プロジェクトページ')).toBeTruthy()
  })
})
