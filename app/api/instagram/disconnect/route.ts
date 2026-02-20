import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const body = await req.json().catch(() => ({})) as { tenantId?: string, unitId?: string }
    const tenantId =
      body?.tenantId ||
      (user.app_metadata as any)?.tenant_id ||
      (user.user_metadata as any)?.tenant_id ||
      process.env.NEXT_PUBLIC_TENANT_ID || ''
    const unitId =
      body?.unitId ||
      (user.app_metadata as any)?.unit_id ||
      (user.user_metadata as any)?.unit_id ||
      process.env.NEXT_PUBLIC_UNIT_ID || ''

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'tenant_id_required' }, { status: 400 })
    }
    if (!unitId) {
      return NextResponse.json({ ok: false, error: 'unit_id_required' }, { status: 400 })
    }

    const admin = createClient(supabaseUrl, serviceRole)

    const { error: upErr } = await admin
      .from('tenant_social_account')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('unit_id', unitId)
      .eq('provider', 'instagram')

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message || 'disconnect_update_failed' }, { status: 400 })
    }

    await admin.from('integration_audit_event').insert({
      tenant_id: tenantId,
      provider: 'instagram',
      event_type: 'manual_disconnect',
      payload: { by_user_id: user.id, by_email: user.email || null },
    })

    return NextResponse.json({ ok: true, disconnected: true, tenantId, unitId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
