import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'node:crypto'

type Body = {
  tenantId?: string
  mediaId?: string
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

async function graphDelete(url: string) {
  const res = await fetch(url, { method: 'DELETE' })
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

    let actorUserId = 'delete-post-secret'
    let actorEmail = 'secret-bypass@local'
    let user: any = null

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

      user = userData.user
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
    const tenantId =
      body?.tenantId ||
      (user?.app_metadata as any)?.tenant_id ||
      (user?.user_metadata as any)?.tenant_id ||
      process.env.NEXT_PUBLIC_TENANT_ID || ''

    const mediaId = String(body?.mediaId || '').trim()

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'tenant_id_required' }, { status: 400 })
    }

    if (!mediaId) {
      return NextResponse.json({ ok: false, error: 'media_id_required' }, { status: 400 })
    }

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
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (accountErr || !account) {
      return NextResponse.json({ ok: false, error: accountErr?.message || 'instagram_account_not_found' }, { status: 404 })
    }

    const { data: cred, error: credErr } = await admin
      .from('tenant_social_credential')
      .select('token_ciphertext, token_iv')
      .eq('tenant_id', tenantId)
      .eq('social_account_id', account.id)
      .maybeSingle()

    if (credErr || !cred?.token_ciphertext || !cred?.token_iv) {
      return NextResponse.json({ ok: false, error: credErr?.message || 'instagram_credential_not_found' }, { status: 404 })
    }

    const accessToken = await decryptToken(cred.token_ciphertext, cred.token_iv, keySeed)
    const version = process.env.GRAPH_API_VERSION || 'v22.0'

    const deleteResult = await graphDelete(
      `https://graph.facebook.com/${version}/${mediaId}?access_token=${encodeURIComponent(accessToken)}`,
    )

    await admin.from('integration_audit_event').insert({
      tenant_id: tenantId,
      provider: 'instagram',
      event_type: 'delete_post_success',
      payload: {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        media_id: mediaId,
        ig_user_id: account.external_account_id,
        page_id: account.page_id,
        delete_result: deleteResult,
      },
    })

    return NextResponse.json({
      ok: true,
      deleted: true,
      tenantId,
      mediaId,
      delete_result: deleteResult,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
