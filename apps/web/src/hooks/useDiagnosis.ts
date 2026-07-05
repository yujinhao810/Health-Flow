import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDiagnosis, deleteDiagnosis, generateDiagnosisFollowUp, getDiagnosis, listDiagnoses, type DiagnosisFollowUpRequest, type DiagnosisInput } from '../api/diagnosis';

export function useDiagnosis() {
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ['diagnoses'], queryFn: listDiagnoses });
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
  });
}
