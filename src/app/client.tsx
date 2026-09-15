'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// 与服务端 src/lib/operator.ts 的 Role 保持一致；此处单独声明，
// 避免把 better-sqlite3 等服务端依赖打进浏览器包。
export type Role = 'front_desk' | 'instructor' | 'admin';

export interface Operator {
  id: number;
  name: string;
  role: Role;
}

const OperatorContext = createContext<{
  operatorId: number | null;
  role: Role | null;
  operators: Operator[];
  setOperatorId: (id: number | null) => void;
}>({ operatorId: null, role: null, operators: [], setOperatorId: () => {} });

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [operatorId, setId] = useState<number | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);

  useEffect(() => {
    fetch('/api/operators').then((r) => r.json()).then((d) => setOperators(d.operators ?? []));
  }, []);

  // localStorage 里恢复上次选择；同时保留原有纯 id 的初始化
  useEffect(() => {
    const raw = localStorage.getItem('operatorId');
    if (raw) setId(Number(raw));
  }, []);

  const role = operatorId ? operators.find((o) => o.id === operatorId)?.role ?? null : null;

  const setOperatorId = (id: number | null) => {
    setId(id);
    if (id) localStorage.setItem('operatorId', String(id));
    else localStorage.removeItem('operatorId');
  };

  return (
    <OperatorContext.Provider value={{ operatorId, role, operators, setOperatorId }}>
      {children}
    </OperatorContext.Provider>
  );
}

export function useOperator() {
  return useContext(OperatorContext);
}

// 可办前台业务（建档/科目/收费/约课/取消/报表）的角色；教练只能消课与查看
export const STAFF_ROLES: Role[] = ['front_desk', 'admin'];
export function isStaffRole(role: Role | null): boolean {
  return role !== null && STAFF_ROLES.includes(role);
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
