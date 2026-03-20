import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native'
import Constants from 'expo-constants'

type Props = {
  onBack: () => void
}

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'

const LIBRARIES = [
  { name: 'React Native', license: 'MIT', url: 'https://github.com/facebook/react-native' },
  { name: 'Expo', license: 'MIT', url: 'https://github.com/expo/expo' },
  { name: 'axios', license: 'MIT', url: 'https://github.com/axios/axios' },
  { name: 'AsyncStorage', license: 'MIT', url: 'https://github.com/react-native-async-storage/async-storage' },
]

export default function AboutScreen({ onBack }: Props) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>このアプリについて</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* アプリ情報 */}
      <View style={styles.card}>
        <Text style={styles.appName}>poi 通知転送</Text>
        <Text style={styles.version}>バージョン {APP_VERSION}</Text>
      </View>

      {/* 権利表示 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>権利表示</Text>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            このアプリは poi (艦これブラウザ) の通知をモバイル端末に転送するための非公式ツールです。
          </Text>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            © 2025 taikonohimazin
          </Text>
        </View>
      </View>

      {/* リンク */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>リンク</Text>
        <TouchableOpacity
          style={styles.libRow}
          onPress={() => Linking.openURL('https://github.com/Taikono-Himazin/poi-plugin-notice-webhook')}
        >
          <View>
            <Text style={styles.libName}>GitHub</Text>
            <Text style={styles.libLicense}>ソースコード・Issue</Text>
          </View>
          <Text style={styles.libLink}>↗</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.libRow}
          onPress={() => Linking.openURL('https://taikono-himazin.github.io/poi-plugin-notice-webhook/')}
        >
          <View>
            <Text style={styles.libName}>プロジェクトページ</Text>
            <Text style={styles.libLicense}>セットアップガイド・ドキュメント</Text>
          </View>
          <Text style={styles.libLink}>↗</Text>
        </TouchableOpacity>
      </View>

      {/* 使用ライブラリ */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>使用ライブラリ</Text>
        {LIBRARIES.map(lib => (
          <TouchableOpacity
            key={lib.name}
            style={styles.libRow}
            onPress={() => Linking.openURL(lib.url)}
          >
            <View>
              <Text style={styles.libName}>{lib.name}</Text>
              <Text style={styles.libLicense}>{lib.license} License</Text>
            </View>
            <Text style={styles.libLink}>↗</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f0f1a' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56 },
  headerTitle:  { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  backText:     { color: '#5865f2', fontSize: 14 },
  card:         { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#1e1e30', borderRadius: 12, padding: 16 },
  appName:      { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  version:      { color: '#666', fontSize: 13, textAlign: 'center', marginTop: 4 },
  section:      { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { color: '#666', fontSize: 11, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  bodyText:     { color: '#ccc', fontSize: 13, lineHeight: 20 },
  libRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e30', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6 },
  libName:      { color: '#fff', fontSize: 15 },
  libLicense:   { color: '#666', fontSize: 11, marginTop: 2 },
  libLink:      { color: '#5865f2', fontSize: 16 },
})
