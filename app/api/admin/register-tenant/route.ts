import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'node:crypto'

function generateTempPassword(length = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*'
  let out = ''
  const random = webcrypto.getRandomValues(new Uint32Array(length))
  for (let i = 0; i < length; i++) {
    out += chars[random[i] % chars.length]
  }
  return out
}

type Body = {
  externalRef: string
  displayName: string
  legalName?: string
  readerEmail: string
  readerPassword?: string
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

    const isAdmin =
      (user.email || '').toLowerCase() === 'alanweb7@gmail.com' ||
      adminEmails.includes((user.email || '').toLowerCase())

    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'forbidden_admin_only' }, { status: 403 })
    }

    const body = (await req.json()) as Body
    const externalRef = (body?.externalRef || '').trim()
    const displayName = (body?.displayName || '').trim()
    const legalName = (body?.legalName || '').trim()
    const readerEmail = (body?.readerEmail || '').trim().toLowerCase()
    const readerPassword = (body?.readerPassword || '').trim()

    if (!externalRef || !displayName || !readerEmail) {
      return NextResponse.json({ ok: false, error: 'missing_required_fields' }, { status: 400 })
    }

    const admin = createClient(supabaseUrl, serviceRole)

    const { data: tenant, error: tenantErr } = await admin
      .from('tenant')
      .upsert(
        {
          external_ref: externalRef,
          display_name: displayName,
          legal_name: legalName || null,
          status: 'active',
        },
        { onConflict: 'external_ref' }
      )
      .select('id, external_ref, display_name, legal_name, status')
      .single()

    if (tenantErr || !tenant) {
      return NextResponse.json({ ok: false, error: tenantErr?.message || 'tenant_upsert_failed' }, { status: 400 })
    }

    const generatedPassword = !readerPassword
    const finalPassword = readerPassword || generateTempPassword()

    const { data: createdUser, error: createUserErr } = await admin.auth.admin.createUser({
      email: readerEmail,
      password: finalPassword,
      email_confirm: true,
      user_metadata: {
        role: 'reader',
      },
      app_metadata: {
        role: 'reader',
        tenant_id: tenant.id,
      },
    })

    if (createUserErr || !createdUser?.user) {
      return NextResponse.json(
        {
          ok: false,
          error: createUserErr?.message || 'reader_user_create_failed',
        },
        { status: 400 }
      )
    }

    try {
      await admin.from('integration_audit_event').insert({
        tenant_id: tenant.id,
        provider: 'organix',
        event_type: 'tenant_registered_with_reader',
        payload: {
          actor_user_id: user.id,
          actor_email: user.email,
          tenant_external_ref: tenant.external_ref,
          reader_user_id: createdUser.user.id,
          reader_email: readerEmail,
        },
      })
    } catch {
      // audit não bloqueia fluxo principal
    }

    return NextResponse.json({
      ok: true,
      tenant,
      reader: {
        id: createdUser.user.id,
        email: readerEmail,
        role: 'reader',
        password: generatedPassword ? finalPassword : undefined,
      },
      warning: generatedPassword ? 'generated_temp_password' : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
