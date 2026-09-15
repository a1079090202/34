'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const OperatorContext = createContext<{
  operatorId: number | null;
  setOperatorId: (id: number | null) => void;
}>({ operatorId: null, setOperatorId: () => {} });

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [operatorId, setId] = useState<number | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('operatorId');
    if (raw) setId(Number(raw));
  }, []);

  const setOperatorId = (id: number | null) => {
    setId(id);
    if (id) localStorage.setItem('operatorId', String(id));
    else localStorage.removeItem('operatorId');
  };

  return <OperatorContext.Provider value={{ operatorId, setOperatorId }}>{children}</OperatorContext.Provider>;
}

export function useOperator() {
  return useContext(OperatorContext);
}

// 所有写请求统一带上操作人头；钱、规则都在服务端算，前端只负责传参和展示结果。
export async function apiFetch(input: string, init: RequestInit = {}, operatorId?: number | null) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (operatorId) headers.set('x-operator-id', String(operatorId));
  const res = await fetch(input, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
