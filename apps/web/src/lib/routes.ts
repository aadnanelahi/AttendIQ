export interface NavItem {
  path: string;
  navKey: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', navKey: 'dashboard' },
  { path: '/employees', navKey: 'employees' },
  { path: '/attendance', navKey: 'attendance' },
  { path: '/schedules', navKey: 'schedules' },
  { path: '/leave', navKey: 'leave' },
  { path: '/overtime', navKey: 'overtime' },
  { path: '/payroll', navKey: 'payroll' },
  { path: '/devices', navKey: 'devices' },
  { path: '/access', navKey: 'access' },
  { path: '/visitors', navKey: 'visitors' },
  { path: '/reports', navKey: 'reports' },
  { path: '/notifications', navKey: 'notifications' },
  { path: '/ai', navKey: 'ai' },
  { path: '/admin', navKey: 'admin' },
];

export function navKeyForPath(path: string): string {
  const item = NAV_ITEMS.find((n) => path === n.path || path.startsWith(`${n.path}/`));
  return item?.navKey ?? path;
}
