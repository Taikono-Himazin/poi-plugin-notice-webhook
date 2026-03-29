import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Storage, AuthConfig, loadConfigFromOutputs } from '../lib/storage';
import { login, loginWithApple } from '../lib/auth';
import { reportError } from '../lib/reportError';
import DebugScreen from './DebugScreen';

type Props = {
  onLogin: (email: string) => void;
};

export default function LoginScreen({ onLogin }: Props) {
  const [showDebug, setShowDebug] = useState(false);
  // aws-outputs.json から読み込まれた設定（あれば入力フォームを非表示にする）
  const [presetConfig, setPresetConfig] = useState<AuthConfig | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [cognitoDomain, setCognitoDomain] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // aws-outputs.json のデータがあればフォームに反映
    const cfg = loadConfigFromOutputs();
    if (cfg) {
      setPresetConfig(cfg);
    } else {
      // 手動入力フォーム用: AsyncStorage の保存済み値を初期値にする
      Storage.getAuthConfig().then((saved) => {
        if (saved) {
          setApiUrl(saved.apiUrl);
          setClientId(saved.clientId);
          setCognitoDomain(saved.cognitoDomain);
        }
      });
    }
  }, []);

  const handleLogin = async (config: AuthConfig) => {
    setLoading(true);
    try {
      await Storage.setAuthConfig(config);
      const { email } = await login(config);
      onLogin(email);
    } catch (e: unknown) {
      reportError(e, { action: 'login' });
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('ログイン失敗', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginWithPreset = () => {
    if (presetConfig) handleLogin(presetConfig);
  };

  const handleAppleLogin = async (config: AuthConfig) => {
    setLoading(true);
    try {
      await Storage.setAuthConfig(config);
      const { email } = await loginWithApple(config);
      onLogin(email);
    } catch (e: unknown) {
      reportError(e, { action: 'apple-login' });
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('ログイン失敗', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLoginWithPreset = () => {
    if (presetConfig) handleAppleLogin(presetConfig);
  };

  const handleLoginWithManual = () => {
    const config: AuthConfig = {
      apiUrl: apiUrl.trim().replace(/\/$/, ''),
      clientId: clientId.trim(),
      cognitoDomain: cognitoDomain.trim(),
    };
    if (!config.apiUrl || !config.clientId || !config.cognitoDomain) {
      Alert.alert('入力エラー', '全ての項目を入力してください');
      return;
    }
    handleLogin(config);
  };

  if (showDebug) {
    return <DebugScreen onBack={() => setShowDebug(false)} />;
  }

  // aws-outputs.json から設定が読み込まれている場合: ボタンのみ表示
  if (presetConfig) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>poi 通知転送</Text>
        <Text style={styles.subtitle}>遠征・入渠・建造の完了をオフラインで受け取る</Text>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLoginWithPreset}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>ログイン</Text>}
        </TouchableOpacity>
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={10}
            style={styles.appleButton}
            onPress={handleAppleLoginWithPreset}
          />
        )}
        <Text style={styles.registerHint}>新規登録もログイン画面から行えます</Text>
        <TouchableOpacity style={styles.debugButton} onPress={() => setShowDebug(true)}>
          <Text style={styles.debugButtonText}>デバッグ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // aws-outputs.json がない場合: 手動入力フォーム（開発者・セルフホスト向け）
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>poi 通知転送</Text>
      <Text style={styles.subtitle}>遠征・入渠・建造の完了をオフラインで受け取る</Text>

      <View style={styles.card}>
        <Text style={styles.label}>API URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://xxxx.execute-api.ap-northeast-1.amazonaws.com/v1"
          placeholderTextColor="#555"
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.label}>Cognito クライアント ID</Text>
        <TextInput
          style={styles.input}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxx"
          placeholderTextColor="#555"
          value={clientId}
          onChangeText={setClientId}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.label}>Cognito ドメイン</Text>
        <TextInput
          style={styles.input}
          placeholder="poi-webhook-123456789012"
          placeholderTextColor="#555"
          value={cognitoDomain}
          onChangeText={setCognitoDomain}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          deploy.ps1 を実行すると aws-outputs.json が自動配置され、この入力が不要になります
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLoginWithManual}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>ログイン</Text>}
      </TouchableOpacity>
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={10}
          style={styles.appleButton}
          onPress={() => {
            const config: AuthConfig = {
              apiUrl: apiUrl.trim().replace(/\/$/, ''),
              clientId: clientId.trim(),
              cognitoDomain: cognitoDomain.trim(),
            };
            if (!config.apiUrl || !config.clientId || !config.cognitoDomain) {
              Alert.alert('入力エラー', '全ての項目を入力してください');
              return;
            }
            handleAppleLogin(config);
          }}
        />
      )}
      <TouchableOpacity style={styles.debugButton} onPress={() => setShowDebug(true)}>
        <Text style={styles.debugButtonText}>デバッグ</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0f0f1a', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 32 },
  registerHint: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 16 },
  card: { backgroundColor: '#1e1e30', borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { color: '#aaa', fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: '#2a2a3e', color: '#fff', borderRadius: 8, padding: 12, fontSize: 13 },
  hint: { color: '#555', fontSize: 11, marginTop: 12, lineHeight: 16 },
  button: { backgroundColor: '#5865f2', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  appleButton: { width: '100%', height: 50, marginTop: 12 },
  debugButton: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  debugButtonText: { color: '#555', fontSize: 12 },
});
