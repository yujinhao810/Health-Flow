import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dismissHealthInsight, listHealthInsights, markHealthInsightRead, refreshHealthInsights } from '../api/health';

export function useHealthInsights() {
  const queryClient = useQueryClient();
  const insights = useQuery({ queryKey: ['health-insights'], queryFn: listHealthInsights, staleTime: 60_000 });
  const refresh = useMutation({
    mutationFn: refreshHealthInsights,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health-insights'] }),
  });
  const markRead = useMutation({
    mutationFn: markHealthInsightRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health-insights'] }),
  });
  const dismiss = useMutation({
    mutationFn: dismissHealthInsight,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health-insights'] }),
  });

  return { insights, refresh, markRead, dismiss };
}