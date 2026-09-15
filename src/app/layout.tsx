'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OperatorProvider, useOperator } from './client';

const LABELS: Record<string, string> = {
  front_desk: '前台',
  instructor: '教练',
  admin: '管理员',
};

function OperatorSelect() {
  const { operatorId, setOperatorId } = useOperator();
  const [operators, setOperators] = useState<{ id: number; name: string; role: string }[]>([]);

  useEffect(() => {
    fetch('/api/operators').then((r) => r.json()).then((d) => setOperators(d.operators));
  }, []);

  return (
    <label className="muted">
      当前操作人：{' '}
      <select
        value={operatorId ?? ''}
        onChange={(e) => setOperatorId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— 请选择 —</option>
        {operators.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}（{LABELS[o.role] ?? o.role}）
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <OperatorProvider>
          <div className="topbar">
            <h1>🏫 驾校内部管理系统</h1>
            <nav>
              <Link href="/">学员</Link>
              <Link href="/book">约课</Link>
              <Link href="/schedule">课表/消课</Link>
            </nav>
            <span className="spacer" />
            <OperatorSelect />
          </div>
          <div className="container">{children}</div>
        </OperatorProvider>
      </body>
    </html>
  );
}
