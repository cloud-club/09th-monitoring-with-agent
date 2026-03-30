export type BackendHealthState = 'ok' | 'unavailable'

export interface BackendHealthSnapshot {
  readonly status: BackendHealthState
  readonly source: string
}

interface CreateBackendHealthFetcherParams {
  readonly baseUrl: string
  readonly timeoutMs: number
}

export function createBackendHealthFetcher(params: CreateBackendHealthFetcherParams): () => Promise<BackendHealthSnapshot> {
  const { baseUrl, timeoutMs } = params

  return async () => {
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => {
      controller.abort()
    }, timeoutMs)

    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: controller.signal
      })

      if (!response.ok) {
        return {
          status: 'unavailable',
          source: baseUrl
        }
      }

      return {
        status: 'ok',
        source: baseUrl
      }
    } catch (_error) {
      return {
        status: 'unavailable',
        source: baseUrl
      }
    } finally {
      clearTimeout(timeoutHandle)
    }
  }
}
