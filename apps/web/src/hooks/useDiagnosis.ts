import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDiagnosis, deleteDiagnosis, generateDiagnosisFollowUp, getDiagnosis, listDiagnoses, retryDiagnosis, supplementDiagnosis, type DiagnosisFollowUpRequest, type DiagnosisInput } from '../api/diagnosis';
import type { DiagnosisSupplementInput } from '@health/shared';

type UseDiagnosisOptions = {
  historyEnabled?: boolean;
};

export function useDiagnosis(options: UseDiagnosisOptions = {}) {
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ['diagnoses'],
    queryFn: listDiagnoses,
    enabled: options.historyEnabled ?? true,
    refetchInterval: (query) => (query.state.data?.some((item) => item.status === 'pending') ? 3000 : false),
  });
  const create = useMutation({
    mutationFn: (input: DiagnosisInput) => createDiagnosis(input),
    onSuccess: (session) => {
      queryClient.setQueryData(['diagnoses'], (current: Awaited<ReturnType<typeof listDiagnoses>> | undefined) => {
        const withoutDuplicate = (current ?? []).filter((item) => item.id !== session.id);
        return [session, ...withoutDuplicate];
      });
      queryClient.setQueryData(['diagnosis', session.id], session);
      queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
    },
  });
  const followUp = useMutation({
    mutationFn: (input: DiagnosisFollowUpRequest) => generateDiagnosisFollowUp(input),
  });
  const remove = useMutation({
    mutationFn: deleteDiagnosis,
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
      queryClient.removeQueries({ queryKey: ['diagnosis', id] });
    },
  });
  return { history, create, followUp, remove };
}

export function useDiagnosisDetail(id?: string) {
  return useQuery({
    queryKey: ['diagnosis', id],
    queryFn: () => getDiagnosis(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2000 : false),
  });
}

export function useDiagnosisSupplement(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DiagnosisSupplementInput) => supplementDiagnosis(id!, input),
    onMutate: () => {
      queryClient.setQueryData(['diagnosis', id], (current: Awaited<ReturnType<typeof getDiagnosis>> | undefined) =>
        current ? { ...current, status: 'pending' as const } : current,
      );
    },
    onSuccess: (session) => {
      queryClient.setQueryData(['diagnosis', session.id], session);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnosis', id] });
      queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
    },
  });
}

export function useDiagnosisRetry(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => retryDiagnosis(id!),
    onMutate: () => {
      queryClient.setQueryData(['diagnosis', id], (current: Awaited<ReturnType<typeof getDiagnosis>> | undefined) =>
        current ? { ...current, status: 'pending' as const } : current,
      );
    },
    onSuccess: (session) => {
      queryClient.setQueryData(['diagnosis', session.id], session);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnosis', id] });
      queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
    },
  });
}
