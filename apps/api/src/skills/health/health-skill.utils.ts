import type { SnapshotsService } from '../../snapshots/snapshots.service';

export function formatSnapshot(snapshot: Awaited<ReturnType<SnapshotsService['latest']>>) {
  return {
    id: snapshot.id,
    period: snapshot.period,
    startedAt: snapshot.startedAt.toISOString(),
    endedAt: snapshot.endedAt.toISOString(),
    summary: snapshot.summary,
    signals: snapshot.signals,
    recommendations: snapshot.recommendations,
  };
}
