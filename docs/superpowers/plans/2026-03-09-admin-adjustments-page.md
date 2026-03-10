# Admin Adjustments Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a page displaying admin lineup adjustments for transparency, accessible to logged-in team owners.

**Architecture:** New API route fetches from `admin_adjustments` table with tournament/team joins. New page component mirrors waiver history pattern. Navigation link added to home page quick actions grid.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Neon PostgreSQL

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/adjustments/route.ts` | GET endpoint returning adjustment history |
| Create | `src/app/adjustments/page.tsx` | Client page displaying adjustments list |
| Modify | `src/app/page.tsx:205-215` | Add navigation link to quick actions grid |

---

## Chunk 1: API Route

### Task 1: Create API Route

**Files:**
- Create: `src/app/api/adjustments/route.ts`

- [ ] **Step 1: Create the API route file**

```typescript
import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  noStore();
  try {
    const rows = await sql`
      SELECT
        a.id,
        a.timestamp,
        a.tournament_id,
        t.name as tournament_name,
        a.team_id,
        tm.team_name,
        a.old_slot,
        a.new_slot,
        a.old_points,
        a.new_points,
        a.note
      FROM admin_adjustments a
      LEFT JOIN tournaments t ON a.tournament_id = t.tournament_id
      LEFT JOIN teams tm ON a.team_id = tm.team_id
      ORDER BY a.timestamp DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Admin adjustments error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test the API route**

Run: `curl http://localhost:3000/api/adjustments`
Expected: JSON array (empty `[]` if no adjustments exist, or list of adjustment objects)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/adjustments/route.ts
git commit -m "feat: add API route for admin adjustments history"
```

---

## Chunk 2: Page Component

### Task 2: Create Page Component

**Files:**
- Create: `src/app/adjustments/page.tsx`

- [ ] **Step 1: Create the page component**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface AdjustmentEntry {
  id: number;
  timestamp: string;
  tournament_id: string;
  tournament_name: string;
  team_id: number;
  team_name: string;
  old_slot: number;
  new_slot: number;
  old_points: number | null;
  new_points: number | null;
  note: string | null;
}

export default function AdjustmentsPage() {
  const { team, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [adjustments, setAdjustments] = useState<AdjustmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !team) {
      router.push('/login');
    }
  }, [authLoading, team, router]);

  useEffect(() => {
    if (team) {
      const fetchAdjustments = async () => {
        try {
          const res = await fetch('/api/adjustments');
          if (!res.ok) throw new Error('Failed to fetch');
          const data = await res.json();
          setAdjustments(data);
        } catch {
          setError('Failed to load admin adjustments');
        } finally {
          setLoading(false);
        }
      };

      fetchAdjustments();
    }
  }, [team]);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Group adjustments by date
  const groupedByDate = adjustments.reduce((acc, entry) => {
    const dateKey = formatDate(entry.timestamp);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, AdjustmentEntry[]>);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-4 animate-pulse">
            <span className="text-3xl">&#9971;</span>
          </div>
          <p className="text-charcoal-light font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return null;
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <Link href="/" className="header-title hover:opacity-80 transition-opacity">
            Fantasy Golf League
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        {/* Page Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-masters-green hover:text-masters-fairway mb-4 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Standings
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cream-dark to-sand flex items-center justify-center">
              <svg className="w-6 h-6 text-masters-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-charcoal">
                Admin Adjustments
              </h2>
              <p className="text-sm text-charcoal-light">
                Commissioner lineup changes this season
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 mb-4">
            <span className="text-red-500 text-xl">!</span>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {adjustments.length === 0 ? (
          <div className="card text-center py-12">
            <span className="text-5xl opacity-20 mb-4 block">&#9971;</span>
            <p className="text-charcoal-light italic">No admin adjustments have been made yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByDate).map(([dateKey, entries]) => (
              <div key={dateKey}>
                <h3 className="text-sm font-semibold text-charcoal-light uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-masters-green"></span>
                  {dateKey}
                </h3>
                <div className="card">
                  <div className="space-y-4">
                    {entries.map((entry, index) => (
                      <div
                        key={entry.id}
                        className={`
                          pb-4
                          ${index < entries.length - 1 ? 'border-b border-cream-dark' : ''}
                        `}
                      >
                        <div className="flex items-center gap-4 mb-2">
                          {/* Time */}
                          <div className="w-16 text-sm text-charcoal-light flex-shrink-0">
                            {formatTime(entry.timestamp)}
                          </div>

                          {/* Team Badge */}
                          <div className="flex-shrink-0">
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-masters-green/10 text-masters-green rounded">
                              {entry.team_name}
                            </span>
                          </div>

                          {/* Tournament */}
                          <div className="flex-1 text-sm text-charcoal">
                            {entry.tournament_name}
                          </div>
                        </div>

                        <div className="ml-20 flex flex-wrap items-center gap-3 text-sm">
                          {/* Slot Change */}
                          <div className="flex items-center gap-1">
                            <span className="text-charcoal-light">Slot</span>
                            <span className="font-medium text-red-600">{entry.old_slot}</span>
                            <svg className="w-4 h-4 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="font-medium text-masters-green">{entry.new_slot}</span>
                          </div>

                          {/* Points Change (if applicable) */}
                          {entry.old_points !== null && entry.new_points !== null && (
                            <div className="flex items-center gap-1">
                              <span className="text-charcoal-light">|</span>
                              <span className="text-charcoal-light">{entry.old_points} pts</span>
                              <svg className="w-4 h-4 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                              <span className="font-medium text-masters-green">{entry.new_points} pts</span>
                            </div>
                          )}
                        </div>

                        {/* Note */}
                        {entry.note && (
                          <div className="ml-20 mt-2 text-sm text-charcoal-light italic">
                            &ldquo;{entry.note}&rdquo;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Test the page manually**

Run: `npm run dev`
Navigate: `http://localhost:3000/adjustments`
Expected: Page loads showing "No admin adjustments have been made yet" (or list if data exists)

- [ ] **Step 3: Commit**

```bash
git add src/app/adjustments/page.tsx
git commit -m "feat: add admin adjustments history page"
```

---

## Chunk 3: Navigation Link

### Task 3: Add Navigation Link

**Files:**
- Modify: `src/app/page.tsx:205-215`

- [ ] **Step 1: Add link after Waiver History in quick actions grid**

Find this block in `src/app/page.tsx` (around line 205-215):
```typescript
          <Link
            href="/waivers/history"
            className="card hover:shadow-golf-lg transition-all group cursor-pointer text-center py-6"
          >
            ...
            <span className="font-medium text-charcoal">Waiver History</span>
          </Link>
```

Add this new Link immediately after it (before the `{isCommissioner && (` block):
```typescript
          <Link
            href="/adjustments"
            className="card hover:shadow-golf-lg transition-all group cursor-pointer text-center py-6"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cream-dark to-sand mx-auto mb-3 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-masters-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-medium text-charcoal">Adjustments</span>
          </Link>
```

- [ ] **Step 2: Test navigation**

Run: `npm run dev`
Navigate: `http://localhost:3000`
Expected: "Adjustments" card appears in quick actions grid after "Waiver History"

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add Adjustments link to home page navigation"
```

---

## Final Verification

- [ ] **Step 1: Run build to verify no TypeScript errors**

```bash
npm run build
```
Expected: Build succeeds with no errors

- [ ] **Step 2: Manual end-to-end test**

1. Start dev server: `npm run dev`
2. Log in as team owner
3. Navigate to home page - verify "Adjustments" card is visible
4. Click "Adjustments" card - verify page loads
5. Verify auth redirect works (log out, try `/adjustments`, should redirect to login)

- [ ] **Step 3: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: final adjustments for admin adjustments page"
```
