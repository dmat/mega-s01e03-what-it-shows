// Splits a ticket's reports into the problems they describe. causes.ts tells the two date-order bugs
// apart by tenant and channel; a report the desk read as a one-day move (desk-notes.json) is neither,
// because no day/month swap moves a date by one day. It is its own problem here, not a footnote.
import { causeOf, uniqueById, type Cause, type Report, type Tenant } from '#lib/kb/causes';

export type Problem = Cause | 'shift';
export const PROBLEMS: readonly Problem[] = ['parser', 'hint', 'shift'];

export function problemOf(r: Report, t: Tenant | undefined, oneDayMove: readonly string[]): Problem | null {
  return oneDayMove.includes(r.id) ? 'shift' : causeOf(r, t);
}

export type ProblemGroup = {
  problem: Problem | 'unplaced';
  reports: Report[];
  tenants: string[];
  channels: Record<string, number>;
  // What intake tagged these reports as, and how many of those tags name a different problem.
  taggedAs: Record<string, number>;
  mistagged: number;
  firstSeen: string;
  lastSeen: string;
};

export function groupByProblem(
  all: Report[],
  ticket: number,
  tenantOf: (r: Report) => Tenant | undefined,
  oneDayMove: readonly string[],
): ProblemGroup[] {
  const merged = uniqueById(all).filter((r) => r.mergedInto === ticket);
  const by = new Map<ProblemGroup['problem'], Report[]>();
  for (const r of merged) {
    const p = problemOf(r, tenantOf(r), oneDayMove) ?? 'unplaced';
    by.set(p, [...(by.get(p) ?? []), r]);
  }
  const count = (rs: Report[], key: (r: Report) => string) =>
    rs.reduce<Record<string, number>>((n, r) => ({ ...n, [key(r)]: (n[key(r)] ?? 0) + 1 }), {});
  return [...by.entries()]
    .map(([problem, rs]) => {
      const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        problem,
        reports: rs,
        tenants: [...new Set(rs.map((r) => r.tenant))].sort(),
        channels: count(rs, (r) => r.channel),
        taggedAs: count(rs, (r) => r.meta.intakeTag),
        mistagged: rs.filter((r) => r.meta.intakeTag !== problem).length,
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length);
}

// Subject lines that more than one problem shares: why decision 0001 merged them all.
export function sharedSubjects(groups: ProblemGroup[]): { subjects: number; shared: number } {
  const problemsBySubject = new Map<string, Set<string>>();
  for (const g of groups)
    for (const r of g.reports) {
      const key = r.subject.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
      problemsBySubject.set(key, (problemsBySubject.get(key) ?? new Set()).add(g.problem));
    }
  return {
    subjects: problemsBySubject.size,
    shared: [...problemsBySubject.values()].filter((s) => s.size > 1).length,
  };
}
