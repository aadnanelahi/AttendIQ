'use client';

import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';

export function ComingSoon({ navKey }: { navKey: string }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t(`nav.${navKey}`)} />
      <div className="card flex items-center justify-center py-16 text-sm text-slate-400">
        {t('common.noData')}
      </div>
    </div>
  );
}