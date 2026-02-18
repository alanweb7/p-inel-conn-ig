
import { supabase } from './supabase'

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID!

async function fetchEdgeFunction(endpoint: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (!token) {
      console.error("⛔ [instagram-api] Falha: Usuário não está logado (sem token de sessão).")
      throw new Error("Usuário não autenticado. Por favor, faça login novamente.")
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${endpoint}`
  console.log(`[Pure Fetch] Calling ${url}`)
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    'x-tenant-id': TENANT_ID,
    'Content-Type': 'application/json',
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

export const instagramApi = {
  startAuth: () => fetchEdgeFunction('instagram-auth-start'),
  getStatus: () => fetchEdgeFunction('instagram-status'),
  disconnect: () => fetchEdgeFunction('instagram-disconnect', { method: 'POST' }),
  generateLink: (tenantId: string, expiresInHours: number) => fetchEdgeFunction('instagram-auth-start', {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId },
    body: JSON.stringify({ tenantId, expiresInHours })
  }),
}
