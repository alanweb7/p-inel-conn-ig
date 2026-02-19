import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'node:crypto'

type Body = {
  tenantId?: string
  imageUrl?: string
  caption?: string
}

function unb64url(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4)
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

async function decryptToken(ciphertext: string, iv: string, keySeed: string): Promise<string> {
  const subtle = webcrypto.subtle
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  const hash = await subtle.digest('SHA-256', enc.encode(keySeed))
  const key = await subtle.importKey('raw', hash, 'AES-GCM', false, ['decrypt'])

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: unb64url(iv) },
    key,
    unb64url(ciphertext),
  )

  return dec.decode(decrypted)
}

async function graphPost(url: string, payload: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload),
  })

  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }

  if (!res.ok || data?.error) {
    const message = data?.error?.message || `graph_error_${res.status}`
    throw new Error(message)
  }

  return data
}

async function graphGetJson(url: string) {
  const res = await fetch(url)
  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }

  if (!res.ok || data?.error) {
    const message = data?.error?.message || `graph_error_${res.status}`
    throw new Error(message)
  }

  return data
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !anonKey || !serviceRole) {
      return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 })
    }

    const testSecret = process.env.PUBLISH_TEST_SECRET || ''
    const providedTestSecret = req.headers.get('x-publish-test-secret') || ''

    if (providedTestSecret && !testSecret) {
      return NextResponse.json({ ok: false, error: 'publish_test_secret_not_configured' }, { status: 500 })
    }

    if (providedTestSecret && testSecret && providedTestSecret !== testSecret) {
      return NextResponse.json({ ok: false, error: 'invalid_publish_test_secret' }, { status: 401 })
    }

    const secretBypass = !!testSecret && providedTestSecret === testSecret

    let actorUserId = 'publish-test-secret'
    let actorEmail = 'secret-bypass@local'

    if (!secretBypass) {
      const authHeader = req.headers.get('authorization') || ''
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ ok: false, error: 'missing_authorization' }, { status: 401 })
      }
      const jwt = authHeader.replace('Bearer ', '').trim()

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })

      const { data: userData, error: userErr } = await userClient.auth.getUser()
      if (userErr || !userData?.user) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
      }

      const user = userData.user
      const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)

      const isAdmin =
        (user.email || '').toLowerCase() === 'alanweb7@gmail.com' ||
        adminEmails.includes((user.email || '').toLowerCase())

      if (!isAdmin) {
        return NextResponse.json({ ok: false, error: 'forbidden_admin_only' }, { status: 403 })
      }

      actorUserId = user.id
      actorEmail = user.email || 'unknown@local'
    }

    const body = (await req.json().catch(() => ({}))) as Body
    const tenantId = body.tenantId || process.env.NEXT_PUBLIC_TENANT_ID
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'tenant_id_required' }, { status: 400 })
    }

    const imageUrl =
      body.imageUrl ||
      'https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg'

    const caption =
      body.caption ||
      `Post de validação Organix ✅ (${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`

    const keySeed = process.env.TOKEN_ENCRYPTION_KEY || process.env.OAUTH_STATE_SECRET
    if (!keySeed) {
      return NextResponse.json({ ok: false, error: 'missing_encryption_key' }, { status: 500 })
    }

    const admin = createClient(supabaseUrl, serviceRole)

    const { data: account, error: accountErr } = await admin
      .from('tenant_social_account')
      .select('id, external_account_id, external_account_name, page_id, status')
      .eq('tenant_id', tenantId)
      .eq('provider', 'instagram')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (accountErr || !account) {
      return NextResponse.json({ ok: false, error: accountErr?.message || 'instagram_account_not_found' }, { status: 404 })
    }

    if (account.status !== 'active') {
      return NextResponse.json({ ok: false, error: 'instagram_account_inactive' }, { status: 400 })
    }

    const { data: cred, error: credErr } = await admin
      .from('tenant_social_credential')
      .select('token_ciphertext, token_iv, token_expires_at, scopes')
      .eq('tenant_id', tenantId)
      .eq('social_account_id', account.id)
      .maybeSingle()

    if (credErr || !cred?.token_ciphertext || !cred?.token_iv) {
      return NextResponse.json({ ok: false, error: credErr?.message || 'instagram_credential_not_found' }, { status: 404 })
    }

    const scopes = Array.isArray(cred.scopes) ? cred.scopes.map(String) : []
    const hasPublishScope =
      scopes.includes('instagram_content_publish') ||
      scopes.includes('instagram_business_content_publish')

    if (!hasPublishScope) {
      return NextResponse.json({ ok: false, error: 'missing_scope_publish', scopes }, { status: 400 })
    }

    const accessToken = await decryptToken(cred.token_ciphertext, cred.token_iv, keySeed)

    const version = process.env.GRAPH_API_VERSION || 'v22.0'
    const igUserId = String(account.external_account_id)

    const createMedia = await graphPost(`https://graph.facebook.com/${version}/${igUserId}/media`, {
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    })

    const creationId = createMedia?.id
    if (!creationId) {
      throw new Error('media_creation_id_missing')
    }

    // Aguarda processamento da mídia antes de publicar
    let statusCode = 'IN_PROGRESS'
    let status = null as any
    for (let i = 0; i < 8; i++) {
      status = await graphGetJson(
        `https://graph.facebook.com/${version}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
      )
      statusCode = String(status?.status_code || 'IN_PROGRESS')
      if (statusCode === 'FINISHED') break
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`media_container_${statusCode.toLowerCase()}`)
      }
      await sleep(1500)
    }

    const publishMedia = await graphPost(`https://graph.facebook.com/${version}/${igUserId}/media_publish`, {
      creation_id: String(creationId),
      access_token: accessToken,
    })

    await admin.from('integration_audit_event').insert({
      tenant_id: tenantId,
      provider: 'instagram',
      event_type: 'publish_test_success',
      payload: {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        ig_user_id: igUserId,
        page_id: account.page_id,
        media_creation_id: creationId,
        media_id: publishMedia?.id || null,
        image_url: imageUrl,
      },
    })

    return NextResponse.json({
      ok: true,
      published: true,
      tenantId,
      account: {
        ig_user_id: igUserId,
        username: account.external_account_name,
        page_id: account.page_id,
      },
      publish_result: publishMedia,
      media_creation_id: creationId,
      image_url: imageUrl,
      caption,
      token_expires_at: cred.token_expires_at || null,
      auth_mode: secretBypass ? 'secret_bypass' : 'user_jwt',
      media_status: status,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
