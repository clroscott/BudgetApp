interface AntiforgeryResponse {
  token: string
}

export class ApiError extends Error {
  readonly status: number
  readonly details: string[]

  constructor(message: string, status = 0, details: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readApiError(response: Response): Promise<ApiError> {
  let body: unknown

  try {
    body = await response.json()
  } catch {
    return new ApiError('The request could not be completed.', response.status)
  }

  if (!isRecord(body)) {
    return new ApiError('The request could not be completed.', response.status)
  }

  const details: string[] = []
  if (isRecord(body.errors)) {
    for (const value of Object.values(body.errors)) {
      if (Array.isArray(value)) {
        details.push(...value.filter((item): item is string => typeof item === 'string'))
      }
    }
  }

  const message = typeof body.detail === 'string'
    ? body.detail
    : typeof body.title === 'string'
      ? body.title
      : 'The request could not be completed.'

  return new ApiError(message, response.status, details)
}

async function fetchWithCredentials(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, credentials: 'include' })
  } catch {
    throw new ApiError('Unable to connect to BudgetApp. Please try again.')
  }
}

async function getAntiforgeryToken(): Promise<string> {
  const response = await fetchWithCredentials('/api/auth/antiforgery', {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw await readApiError(response)
  }

  const body = await response.json() as AntiforgeryResponse
  if (!body.token) {
    throw new ApiError('BudgetApp did not return an antiforgery token.')
  }

  return body.token
}

export async function apiGet<TResponse>(path: string): Promise<TResponse> {
  const response = await fetchWithCredentials(path, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw await readApiError(response)
  }

  return await response.json() as TResponse
}

export async function apiPost<TResponse>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const token = await getAntiforgeryToken()
  const response = await fetchWithCredentials(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-XSRF-TOKEN': token,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw await readApiError(response)
  }

  return response.status === 204
    ? undefined as TResponse
    : await response.json() as TResponse
}

export async function apiPut<TResponse>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const token = await getAntiforgeryToken()
  const response = await fetchWithCredentials(path, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-XSRF-TOKEN': token,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw await readApiError(response)
  }

  return response.status === 204
    ? undefined as TResponse
    : await response.json() as TResponse
}
