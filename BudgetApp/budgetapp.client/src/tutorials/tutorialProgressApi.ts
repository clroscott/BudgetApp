import { apiGet, apiPut } from '../api/apiClient'

export type TutorialProgressStatus = 'InProgress' | 'Completed' | 'Dismissed'

export interface TutorialProgress {
  tutorialKey: string
  tutorialVersion: number
  status: TutorialProgressStatus
  currentStepIndex: number
  startedAtUtc: string
  updatedAtUtc: string
  completedAtUtc: string | null
  dismissedAtUtc: string | null
}

export function getTutorialProgress(): Promise<TutorialProgress[]> {
  return apiGet<TutorialProgress[]>('/api/tutorial-progress')
}

export function saveTutorialProgress(
  tutorialKey: string,
  tutorialVersion: number,
  status: TutorialProgressStatus,
  currentStepIndex: number,
): Promise<TutorialProgress> {
  return apiPut<TutorialProgress>(
    `/api/tutorial-progress/${encodeURIComponent(tutorialKey)}`,
    { tutorialVersion, status, currentStepIndex },
  )
}
