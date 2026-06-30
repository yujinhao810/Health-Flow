import { useQuery } from '@tanstack/react-query';
import { listAgentRuns } from '../api/agentRuns';

export function useAgentRuns(limit = 6) {
  return useQuery({ queryKey: ['agent-runs', limit], queryFn: () => listAgentRuns(limit), staleTime: 30_000 });
}