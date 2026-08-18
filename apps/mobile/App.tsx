import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';
import { getToken, clearTokens } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App(): React.JSX.Element {
  const [authed, setAuthed] = useState<boolean | null>(null);

  const checkAuth = useCallback(async () => {
    const token = await getToken();
    setAuthed(Boolean(token));
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  async function logout(): Promise<void> {
    await clearTokens();
    setAuthed(false);
  }

  if (authed === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar style="light" />
      {authed ? <HomeScreen onLogout={() => void logout()} /> : <LoginScreen onSuccess={() => setAuthed(true)} />}
    </SafeAreaView>
  );
}
