import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'node:crypto'

type Body = {
  tenantId: string
  accessToken: string
  pageId: string
  pageName?: string
  igBusinessAccountId: string
  igUsername?: string
  expiresAt?: string
}

function b64url(input: Uint8Array): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function encryptToken(plain: string, keySeed: string): Promise<{ ciphertext: string; iv: string }> {
  const subtle = webcrypto.subtle
  const enc = new TextEncoder()
  const hash = await subtle.digest('SHA-256', enc.encode(keySeed))
  const key = await subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt'])
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain))

  return {
    ciphertext: b64url(new Uint8Array(encrypted)),
    iv: b64url(iv),
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !anonKey || !serviceRole) {
      return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 })
    }

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

    const isAdmin = (user.email || '').toLowerCase() === 'alanweb7@gmail.com' || adminEmails.includes((user.email || '').toLowerCase())
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'forbidden_admin_only' }, { status: 403 })
    }

    const body = (await req.json()) as Body

    if (!body?.tenantId || !body?.accessToken || !body?.pageId || !body?.igBusinessAccountId) {
      return NextResponse.json({ ok: false, error: 'missing_required_fields' }, { status: 400 })
    }

    const keySeed = process.env.TOKEN_ENCRYPTION_KEY || process.env.OAUTH_STATE_SECRET
    if (!keySeed) {
      return NextResponse.json({ ok: false, error: 'missing_encryption_key' }, { status: 500 })
    }

    const encrypted = await encryptToken(body.accessToken, keySeed)

    const admin = createClient(supabaseUrl, serviceRole)

    const { data: account, error: accountErr } = await admin
      .from('tenant_social_account')
      .upsert({
        tenant_id: body.tenantId,
        provider: 'instagram',
        external_account_id: body.igBusinessAccountId,
        external_account_name: body.igUsername || null,
        page_id: body.pageId,
        page_name: body.pageName || null,
        status: 'active',
      }, { onConflict: 'tenant_id,provider,external_account_id' })
      .select('id')
      .single()

    if (accountErr || !account) {
      return NextResponse.json({ ok: false, error: accountErr?.message || 'account_upsert_failed' }, { status: 400 })
    }

    const { error: credErr } = await admin
      .from('tenant_social_credential')
      .upsert({
        tenant_id: body.tenantId,
        social_account_id: account.id,
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        scopes: ['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic', 'instagram_content_publish', 'instagram_business_basic', 'instagram_business_content_publish'],
        token_expires_at: body.expiresAt || null,
        refreshed_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,social_account_id' })

    if (credErr) {
      return NextResponse.json({ ok: false, error: credErr.message || 'credential_upsert_failed' }, { status: 400 })
    }

    await admin.from('integration_audit_event').insert({
      tenant_id: body.tenantId,
      provider: 'instagram',
      event_type: 'manual_connected',
      payload: {
        actor_user_id: user.id,
        actor_email: user.email,
        page_id: body.pageId,
        ig_user_id: body.igBusinessAccountId,
      },
    })

    return NextResponse.json({ ok: true, connected: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
