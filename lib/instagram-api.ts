
import { supabase } from './supabase'

async function fetchEdgeFunction(endpoint: string, options: RequestInit = {}) {
  let { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    session = refreshed.session
  }

  const token = session?.access_token

  if (!token) {
    console.error("⛔ [instagram-api] Falha: Usuário não está logado (sem token de sessão).")
    throw new Error("Usuário não autenticado. Por favor, faça login novamente.")
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${endpoint}`
  console.log(`[Pure Fetch] Calling ${url}`)

  const tenantFromSession =
    (session?.user?.app_metadata as any)?.tenant_id ||
    (session?.user?.user_metadata as any)?.tenant_id ||
    ''

  const unitFromSession =
    (session?.user?.app_metadata as any)?.unit_id ||
    (session?.user?.user_metadata as any)?.unit_id ||
    ''

  const baseHeaders: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    'Content-Type': 'application/json',
  }

  if (tenantFromSession) {
    baseHeaders['x-tenant-id'] = tenantFromSession
  }

  if (unitFromSession) {
    baseHeaders['x-unit-id'] = unitFromSession
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
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Usuário não autenticado. Faça login novamente.')

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
  startAuth: (tenantId?: string, unitId?: string) => fetchEdgeFunction('instagram-auth-start', {
    headers: {
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...(unitId ? { 'x-unit-id': unitId } : {}),
    },
  }),
  getStatus: (tenantId?: string, unitId?: string) => fetchEdgeFunction('instagram-status', {
    headers: {
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...(unitId ? { 'x-unit-id': unitId } : {}),
    },
  }),
  disconnect: (tenantId?: string, unitId?: string) => callInternalApi('/api/instagram/disconnect', {
    ...(tenantId ? { tenantId } : {}),
    ...(unitId ? { unitId } : {}),
  }),
  generateLink: (tenantId: string, unitId: string, expiresInHours: number) => fetchEdgeFunction('instagram-auth-start', {
    method: 'POST',
    headers: {
      'x-tenant-id': tenantId,
      'x-unit-id': unitId,
    },
    body: JSON.stringify({ tenantId, unitId, expiresInHours })
  }),
  manualConnect: (payload: ManualConnectPayload) => callInternalApi('/api/instagram/manual-connect', payload),
  publishTest: (payload: PublishTestPayload) => callInternalApi('/api/instagram/publish-test', payload),
  registerTenantWithReader: (payload: RegisterTenantPayload) => callInternalApi('/api/admin/register-tenant', payload),
}
