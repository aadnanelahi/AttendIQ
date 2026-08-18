import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, setTokens } from '../api';

interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}

interface LoginProps {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginProps): React.JSX.Element {
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(): Promise<void> {
    setBusy(true);
    try {
      const res = await api<LoginData>('/auth/login', { method: 'POST', body: { email, password } });
      await setTokens(res.accessToken, res.refreshToken);
      onSuccess();
    } catch (err) {
      Alert.alert('Sign in failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AttendIQ</Text>
      <Text style={styles.subtitle}>Workforce management</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#94a3b8"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#94a3b8"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Pressable style={styles.button} onPress={() => void login()} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0f172a' },
  title: { fontSize: 32, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#93c5fd', textAlign: 'center', marginBottom: 32 },
  input: {
    backgroundColor: '#1e293b',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
