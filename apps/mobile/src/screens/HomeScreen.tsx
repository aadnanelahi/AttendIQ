import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { api, clearTokens } from '../api';

interface Me {
  id: string;
  email: string;
  name: string;
  employee?: { id: string; employeeNumber: string; firstName: string; lastName: string } | null;
}

interface AttendanceDay {
  id: string;
  date: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  workMinutes: number;
}

interface Paged<T> {
  items: T[];
  total: number;
}

interface HomeProps {
  onLogout: () => void;
}

export function HomeScreen({ onLogout }: HomeProps): React.JSX.Element {
  const [me, setMe] = useState<Me | null>(null);
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [loc, setLoc] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const profile = await api<Me>('/auth/me');
      setMe(profile);
      const today = new Date().toISOString().slice(0, 10);
      const history = await api<Paged<AttendanceDay>>(`/attendance?from=${today}&to=${today}`);
      setDays(history.items);
    } catch {
      onLogout();
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function captureLocation(): Promise<void> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      setLoc(`${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`);
    } catch {
      setLoc(null);
    }
  }

  async function punch(type: 'CHECK_IN' | 'CHECK_OUT'): Promise<void> {
    if (!me?.employee) {
      Alert.alert('No employee profile', 'This account is not linked to an employee.');
      return;
    }
    setBusy(true);
    try {
      await api('/attendance/manual-punch', {
        method: 'POST',
        body: {
          employeeId: me.employee.id,
          timestamp: new Date().toISOString(),
          type,
          reason: loc ? `mobile punch from ${loc}` : 'mobile punch',
        },
      });
      await load();
      Alert.alert('Punched', type === 'CHECK_IN' ? 'Checked in' : 'Checked out');
    } catch (err) {
      Alert.alert('Punch failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{me?.employee ? `${me.employee.firstName} ${me.employee.lastName}` : me?.name ?? 'AttendIQ'}</Text>
          <Text style={styles.subtitle}>{me?.email}</Text>
        </View>
        <Pressable onPress={onLogout}>
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.punchCard}>
        <Text style={styles.cardTitle}>Attendance</Text>
        <Text style={styles.locText}>{loc ? `GPS: ${loc}` : 'Location not captured'}</Text>
        <View style={styles.row}>
          <Pressable style={[styles.button, styles.in]} onPress={() => void punch('CHECK_IN')} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Check in</Text>}
          </Pressable>
          <Pressable style={[styles.button, styles.out]} onPress={() => void punch('CHECK_OUT')} disabled={busy}>
            <Text style={styles.buttonText}>Check out</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => void captureLocation()}>
          <Text style={styles.capture}>Capture location</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Today</Text>
      <FlatList
        data={days}
        keyExtractor={(d) => d.id}
        ListEmptyComponent={<Text style={styles.empty}>No attendance records</Text>}
        renderItem={({ item }) => (
          <View style={styles.dayRow}>
            <Text style={styles.dayText}>{item.date.slice(0, 10)}</Text>
            <Text style={styles.dayText}>{item.status}</Text>
            <Text style={styles.dayText}>
              {item.checkIn ? new Date(item.checkIn).toLocaleTimeString() : '—'}
            </Text>
            <Text style={styles.dayText}>
              {item.checkOut ? new Date(item.checkOut).toLocaleTimeString() : '—'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b' },
  logout: { color: '#2563eb', fontWeight: '600' },
  punchCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  locText: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  in: { backgroundColor: '#16a34a' },
  out: { backgroundColor: '#dc2626' },
  buttonText: { color: '#fff', fontWeight: '600' },
  capture: { color: '#2563eb', fontSize: 13, marginTop: 12, textAlign: 'center' },
  section: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 },
  dayText: { fontSize: 13, color: '#334155' },
  empty: { color: '#94a3b8', textAlign: 'center', padding: 20 },
});
