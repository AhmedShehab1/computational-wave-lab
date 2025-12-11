export type JobToken = string

export type WorkerMessageType =
  | 'JOB_START'
  | 'JOB_COMPLETE'
  | 'JOB_ERROR'
  | 'JOB_PROGRESS'
  | 'JOB_CANCEL'

export interface WorkerMessageEnvelope<TPayload = unknown> {
  type: WorkerMessageType
  jobId: JobToken
  payload?: TPayload
  error?: string
  progress?: number
}
