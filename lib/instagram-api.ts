
import { supabase } from './supabase'

async function getValidAccessToken() {
  let { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    session = refreshed.session
  }

  let token = session?.access_token

  if (token) {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user) {
      const { data: refreshed } = await supabase.auth.refreshSession()
      token = refreshed.session?.access_token
    }
  }

  if (!token) {
    console.error("⛔ [instagram-api] Falha: Usuário não está logado (sem token de sessão).")
    throw new Error("Usuário não autenticado. Por favor, faça login novamente.")
  }

  return token
}

async function fetchEdgeFunction(endpoint: string, options: RequestInit = {}) {
  const token = await getValidAccessToken()

  const { data: { session } } = await supabase.auth.getSession()

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${endpoint}`
  console.log(`[Pure Fetch] Calling ${url}`)

  const tenantFromSession =
    (session?.user?.app_metadata as any)?.tenant_id ||
    (session?.user?.user_metadata as any)?.tenant_id ||
    ''

  const baseHeaders: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    'Content-Type': 'application/json',
  }

  if (tenantFromSession) {
    baseHeaders['x-tenant-id'] = tenantFromSession
  }

  const headers: Record<string, string> = {
    ...baseHeaders,
    ...(options.headers as Record<string, string> || {}),
  }

  try {
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body as BodyInit,
    })

    console.log(`[Pure Fetch] Status: ${response.status}`)
    const text = await response.text()
    console.log(`[Pure Fetch] Body: ${text}`)

    if (!response.ok) {
        if (text.includes('Auth session missing')) {
          throw new Error('Sessão expirada ou inválida. Faça logout e login novamente.')
        }
        throw new Error(`Error ${response.status}: ${text}`)
    }

    try {
        return JSON.parse(text)
    } catch(e) {
        return { message: text } 
    }
  } catch (error) {
      console.error("[Pure Fetch Error]", error)
      throw error
  }
}

type ManualConnectPayload = {
  tenantId: string
  unitId?: string
  accessToken: string
  pageId: string
  pageName?: string
  igBusinessAccountId: string
  igUsername?: string
  expiresAt?: string
}

type PublishTestPayload = {
  tenantId?: string
  imageUrl?: string
  caption?: string
}

type RegisterTenantPayload = {
  externalRef: string
  displayName: string
  legalName?: string
  readerEmail: string
  readerPassword?: string
}

async function callInternalApi(path: string, payload: Record<string, unknown>) {
  const token = await getValidAccessToken()

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  if (!response.ok) throw new Error(`Error ${response.status}: ${text}`)

  try {
    return JSON.parse(text)
  } catch {
    return { ok: true, message: text }
  }
}

export const instagramApi = {
  startAuth: (tenantId?: string) => fetchEdgeFunction('instagram-auth-start', {
    headers: {
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
  }),
  getStatus: (tenantId?: string) => fetchEdgeFunction('instagram-status', {
    headers: {
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
  }),
  disconnect: (tenantId?: string) => callInternalApi('/api/instagram/disconnect', {
    ...(tenantId ? { tenantId } : {}),
  }),
  generateLink: (tenantId: string, expiresInHours: number) => fetchEdgeFunction('instagram-auth-start', {
    method: 'POST',
    headers: {
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify({ tenantId, expiresInHours })
  }),
  manualConnect: (payload: ManualConnectPayload) => callInternalApi('/api/instagram/manual-connect', payload),
  publishTest: (payload: PublishTestPayload) => callInternalApi('/api/instagram/publish-test', payload),
  registerTenantWithReader: (payload: RegisterTenantPayload) => callInternalApi('/api/admin/register-tenant', payload),
}
