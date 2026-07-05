import { useQuery } from '@tanstack/react-query';
import { getAgentRun, listAgentRuns } from '../api/agentRuns';

export function useAgentRuns(limit = 6) {
  return useQuery({ queryKey: ['agent-runs', limit], queryFn: () => listAgentRuns(limit), staleTime: 30_000 });
}

export function useAgentRun(id?: string) {
  return useQuery({
    queryKey: ['agent-run', id],
    queryFn: () => getAgentRun(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
