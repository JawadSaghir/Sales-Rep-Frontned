# Roleplay History — Next.js integration

Drop-in files matching your existing conventions (globals.css tokens, `Icon`, `api.ts`).

## 1. Copy files

```
lib/history.ts               → frontend/lib/history.ts
components/HistoryList.tsx   → frontend/components/HistoryList.tsx
components/SessionDetail.tsx → frontend/components/SessionDetail.tsx
```

## 2. Append to `app/globals.css`

```css
/* ------------------------------------------------------- Roleplay History */
.session-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 14px 18px;
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.session-row:hover {
  border-color: var(--brand-line);
  box-shadow: var(--shadow-md);
}
.pill-brand {
  font-size: 11px;
  font-weight: 700;
  color: var(--brand-ink);
  background: var(--brand-soft);
  padding: 3px 9px;
  border-radius: var(--r-pill);
}
.pill-neutral {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-soft);
  background: var(--surface-2);
  border: 1px solid var(--line);
  padding: 3px 9px;
  border-radius: var(--r-pill);
}
```

## 3. Wire into `app/page.tsx`

Replace the old `HistoryView` usage:

```tsx
import { useState } from 'react';
import { HistoryList } from '../components/HistoryList';
import { SessionDetail } from '../components/SessionDetail';

// inside HomeInner, next to the other useState calls:
const [sessionId, setSessionId] = useState<string | null>(null);

// replace the 'Roleplay History' block:
{activeTab === 'Roleplay History' && (
  sessionId ? (
    <SessionDetail
      id={sessionId}
      onBack={() => setSessionId(null)}
      onRetry={() => setActiveTab('home')}
    />
  ) : (
    <div className="scroll-y" style={{ overflowY: 'auto', height: '100%' }}>
      <HistoryList onOpen={setSessionId} onStart={() => setActiveTab('home')} />
    </div>
  )
)}
```

The old `HistoryView` function in `page.tsx` can be deleted.

## 4. Real data

`lib/history.ts` ships with mock sessions so the tab works immediately.
When the backend endpoints exist, replace the two stubs at the bottom:

```ts
export const getSessions = () => get<SessionSummary[]>('/api/sessions');
export const getSession = (id: string) => get<SessionDetail>(`/api/sessions/${id}`);
```

(import `get` by exporting it from `lib/api.ts`, or move these two lines there.)

No new dependencies. Icons reuse `lib/icons.tsx`; play/pause are tiny inline SVGs.
