
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { instagramApi } from '@/lib/instagram-api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function Dashboard() {
  // symbolic update: redeploy trigger (Nolan)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<any>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  
  // Link Generator State
  const [genTenantId, setGenTenantId] = useState(() => {
    const envTenant = process.env.NEXT_PUBLIC_TENANT_ID || ''
    // avoid keeping mock UUID as default in UI
    return envTenant === '11111111-1111-1111-1111-111111111111' ? '' : envTenant
  })
  const [genUnitId, setGenUnitId] = useState(() => process.env.NEXT_PUBLIC_UNIT_ID || '')
  const [genExpiresIn, setGenExpiresIn] = useState(168)
  const [genLink, setGenLink] = useState('')
  const [genLoading, setGenLoading] = useState(false)

  // Manual connect (admin-only demo)
  const [manualTenantId, setManualTenantId] = useState('')
  const [manualUnitId, setManualUnitId] = useState('')
  const [manualAccessToken, setManualAccessToken] = useState('')
  const [manualPageId, setManualPageId] = useState('')
  const [manualPageName, setManualPageName] = useState('')
  const [manualIgId, setManualIgId] = useState('')
  const [manualIgUsername, setManualIgUsername] = useState('')
  const [manualLoading, setManualLoading] = useState(false)

  // Exemplo de publicação
  const [postCaption, setPostCaption] = useState('Post de validação Organix ✅')
  const [postImageUrl, setPostImageUrl] = useState('https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg')
  const [postLoading, setPostLoading] = useState(false)

  // Registro de tenant + usuário leitor (admin)
  const [tenantExternalRef, setTenantExternalRef] = useState('')
  const [tenantDisplayName, setTenantDisplayName] = useState('')
  const [tenantLegalName, setTenantLegalName] = useState('')
  const [readerEmail, setReaderEmail] = useState('')
  const [readerPassword, setReaderPassword] = useState('')
  const [tenantRegisterLoading, setTenantRegisterLoading] = useState(false)
  
  const router = useRouter()

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const userEmail = (user?.email || '').toLowerCase()
  const isAdmin = userEmail === 'alanweb7@gmail.com' || adminEmails.includes(userEmail)

  const effectiveTenantId = (genTenantId || manualTenantId || '').trim()

  const fetchStatus = async (tenantIdOverride?: string) => {
    setStatusLoading(true)
    try {
      const tid = (tenantIdOverride || effectiveTenantId || '').trim() || undefined
      const data = await instagramApi.getStatus(tid)
      setStatus(data)
    } catch (e) {
      console.error(e)
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
        return
      }
      
      console.log("--- JWT DEBUG ---")
      console.log("Access Token:", session.access_token)
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        console.log("Decoded Payload:", payload)
        console.log("ISS Claim:", payload.iss)
        const expectedIss = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
        console.log("Expected ISS:", expectedIss)
        console.log("Match:", payload.iss === expectedIss)
      } catch (e) {
        console.error("Failed to decode JWT manually:", e)
      }
      console.log("--- END DEBUG ---")

      setUser(session.user)
      
      // Pre-fill Tenant ID from user metadata or app metadata or ENV
      const userTenantId = session.user.app_metadata?.tenant_id || 
                           session.user.user_metadata?.tenant_id || 
                           process.env.NEXT_PUBLIC_TENANT_ID || '';
      const userUnitId = session.user.app_metadata?.unit_id ||
                         session.user.user_metadata?.unit_id ||
                         process.env.NEXT_PUBLIC_UNIT_ID || '';

      const sanitizedTenantId = userTenantId === '11111111-1111-1111-1111-111111111111' ? '' : userTenantId
      setGenTenantId(sanitizedTenantId)
      setManualTenantId(sanitizedTenantId)
      setGenUnitId(userUnitId)
      setManualUnitId(userUnitId)

      setLoading(false)
      fetchStatus(sanitizedTenantId)
    })
  }, [router])

  const handleConnect = async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const { url } = await instagramApi.startAuth(effectiveTenantId || undefined)
      const popup = window.open(url, '_blank', 'noopener,noreferrer')
      if (!popup) {
        window.location.href = url
      }
    } catch (e) {
      alert('Erro ao iniciar conexão: ' + (e as Error).message)
    } finally {
      setTimeout(() => setConnecting(false), 1500)
    }
  }

  const handleDisconnect = async () => {
    if(!confirm('Tem certeza que deseja desconectar?')) return
    try {
      await instagramApi.disconnect(effectiveTenantId || undefined)
      await fetchStatus()
    } catch (e) {
      alert('Erro ao desconectar: ' + (e as Error).message)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleGenerateLink = async () => {
    if (!genTenantId) return alert('Informe o Tenant ID')
    setGenLoading(true)
    setGenLink('')
    try {
      const res = await instagramApi.generateLink(genTenantId, genExpiresIn)
      if (res.url) {
        setGenLink(res.url)
      } else {
        alert('Erro: ' + (res.error || res.message || 'Falha ao gerar'))
      }
    } catch (e) {
      alert('Erro: ' + (e as Error).message)
    } finally {
      setGenLoading(false)
    }
  }

  const handleManualConnect = async () => {
    if (!manualTenantId || !manualAccessToken || !manualPageId || !manualIgId) {
      return alert('Preencha Tenant ID, Access Token, Page ID e IG Business ID.')
    }

    setManualLoading(true)
    try {
      const res = await instagramApi.manualConnect({
        tenantId: manualTenantId,
        unitId: manualUnitId || undefined,
        accessToken: manualAccessToken,
        pageId: manualPageId,
        pageName: manualPageName,
        igBusinessAccountId: manualIgId,
        igUsername: manualIgUsername,
      })

      if (res?.ok) {
        alert('Conexão manual salva com sucesso (modo demo).')
        setManualAccessToken('')
        await fetchStatus()
      } else {
        alert('Erro ao salvar conexão manual.')
      }
    } catch (e) {
      alert('Erro: ' + (e as Error).message)
    } finally {
      setManualLoading(false)
    }
  }

  const handleSamplePost = async () => {
    if (!postImageUrl.trim()) return alert('Informe a URL da imagem.')

    setPostLoading(true)
    try {
      const res = await instagramApi.publishTest({
        tenantId: effectiveTenantId || undefined,
        imageUrl: postImageUrl.trim(),
        caption: postCaption.trim() || 'Post de validação Organix ✅',
      })

      if (res?.ok && res?.published) {
        alert(`Post publicado com sucesso! ID: ${res?.publish_result?.id || 'N/A'}`)
      } else {
        alert('Falha ao publicar post de exemplo.')
      }
    } catch (e) {
      alert('Erro ao publicar: ' + (e as Error).message)
    } finally {
      setPostLoading(false)
    }
  }

  const handleRegisterTenant = async () => {
    if (!tenantExternalRef.trim() || !tenantDisplayName.trim() || !readerEmail.trim()) {
      return alert('Preencha Código Externo, Nome de Exibição e E-mail do Leitor.')
    }

    setTenantRegisterLoading(true)
    try {
      const res = await instagramApi.registerTenantWithReader({
        externalRef: tenantExternalRef.trim(),
        displayName: tenantDisplayName.trim(),
        legalName: tenantLegalName.trim() || undefined,
        readerEmail: readerEmail.trim(),
        readerPassword: readerPassword.trim() || undefined,
      })

      if (res?.ok) {
        const generatedPassword = res?.reader?.password
          ? `\nSenha temporária gerada: ${res.reader.password}`
          : ''

        alert(`Tenant registrado com sucesso!\nTenant ID: ${res?.tenant?.id}\nLeitor: ${res?.reader?.email}${generatedPassword}`)

        if (res?.tenant?.id) {
          setGenTenantId(res.tenant.id)
          setManualTenantId(res.tenant.id)
        }

        setTenantExternalRef('')
        setTenantDisplayName('')
        setTenantLegalName('')
        setReaderEmail('')
        setReaderPassword('')
      } else {
        alert('Erro ao registrar tenant: ' + (res?.error || 'falha_desconhecida'))
      }
    } catch (e) {
      alert('Erro ao registrar tenant: ' + (e as Error).message)
    } finally {
      setTenantRegisterLoading(false)
    }
  }

  const copyLink = () => {
    if(!genLink) return
    navigator.clipboard.writeText(genLink)
    alert('Link copiado!')
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <Button variant="outline" onClick={handleLogout}>Sair</Button>
        </div>

        <Card title="Conta">
           <div className="flex items-center space-x-2">
             <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                {user?.email?.charAt(0).toUpperCase()}
             </div>
             <div>
                <p className="text-sm font-medium text-gray-900">Usuário Logado</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
             </div>
           </div>
        </Card>

        <Card title="Integração Instagram">
            <div className="space-y-6">
               <div className="bg-white rounded-lg border border-gray-100 p-4">
                 {statusLoading ? (
                   <div className="flex items-center space-x-2 text-gray-500">
                      <span className="block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></span>
                      <span>Verificando status...</span>
                   </div>
                 ) : status?.connected ? (
                   <div className="space-y-3">
                      <div className="flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-100">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        <span className="font-semibold">Conectado</span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="bg-gray-50 p-3 rounded">
                           <span className="text-gray-500 block mb-1">Username</span>
                           <span className="font-medium text-gray-900">@{status.account?.username || status.username}</span>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                           <span className="text-gray-500 block mb-1">Página ID</span>
                           <span className="font-medium text-gray-900">{status.account?.id || status.page_id || 'N/A'}</span>
                        </div>
                        {(status.token?.expires_at || status.expires_at) && (
                          <div className="bg-gray-50 p-3 rounded col-span-full">
                             <span className="text-gray-500 block mb-1">Token Expira em</span>
                             <span className="font-mono text-gray-700">{new Date(status.token?.expires_at || status.expires_at).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                   </div>
                 ) : (
                   <div className="flex items-center space-x-2 text-yellow-700 bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      <span>Não conectado ao Instagram</span>
                   </div>
                 )}
               </div>

               <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
                  {!status?.connected ? (
                     <Button onClick={handleConnect} isLoading={connecting} disabled={connecting} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-none">
                        Conectar Instagram
                     </Button>
                  ) : (
                     <Button variant="danger" onClick={handleDisconnect}>
                        Desconectar
                     </Button>
                  )}
                  <Button variant="secondary" onClick={() => fetchStatus()} isLoading={statusLoading} disabled={statusLoading}>
                    Atualizar Status
                  </Button>
               </div>
            </div>
            {isAdmin && (
              <div className="mt-8 border-t pt-6 space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Post de Exemplo (Admin)</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Texto do post</label>
                  <textarea
                    value={postCaption}
                    onChange={(e) => setPostCaption(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border min-h-[90px]"
                    placeholder="Escreva a legenda do post"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">URL da imagem</label>
                  <input
                    type="text"
                    value={postImageUrl}
                    onChange={(e) => setPostImageUrl(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    placeholder="https://..."
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSamplePost} isLoading={postLoading} disabled={postLoading}>
                    Publicar Exemplo
                  </Button>
                </div>
              </div>
            )}
        </Card>

        {isAdmin && (
        <>
        <Card title="Registro de Tenant + Usuário Leitor (Admin)">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Cria/atualiza um tenant e registra um usuário com permissão <strong>apenas de leitura</strong> (role: reader).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Código Externo</label>
                <input
                  type="text"
                  value={tenantExternalRef}
                  onChange={(e) => setTenantExternalRef(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="ex.: 127659"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Nome de Exibição</label>
                <input
                  type="text"
                  value={tenantDisplayName}
                  onChange={(e) => setTenantDisplayName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="ex.: Organix Cliente X"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Razão Social (opcional)</label>
                <input
                  type="text"
                  value={tenantLegalName}
                  onChange={(e) => setTenantLegalName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="Nome jurídico da empresa"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">E-mail do Leitor</label>
                <input
                  type="email"
                  value={readerEmail}
                  onChange={(e) => setReaderEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="leitor@cliente.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Senha do Leitor (opcional)</label>
                <input
                  type="text"
                  value={readerPassword}
                  onChange={(e) => setReaderPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="deixe em branco para gerar automaticamente"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Permissão</label>
                <input
                  type="text"
                  value="reader (somente leitura)"
                  readOnly
                  className="mt-1 block w-full rounded-md border-gray-200 bg-gray-50 text-gray-600 sm:text-sm p-2 border"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleRegisterTenant} isLoading={tenantRegisterLoading} disabled={tenantRegisterLoading}>
                Registrar Tenant + Leitor
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Gerador de Link de Conexão (Admin)">
           <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Gere um link seguro para conectar uma conta do Instagram a um Tenant específico.
                O link expira após o tempo configurado.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tenant ID (UUID)</label>
                  <input 
                    type="text" 
                    value={genTenantId} 
                    onChange={e => setGenTenantId(e.target.value)} 
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    placeholder="e.g. 12345678-..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Validade (Horas)</label>
                  <input 
                    type="number" 
                    value={genExpiresIn} 
                    onChange={e => setGenExpiresIn(Number(e.target.value))} 
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    min={1} max={720}
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button onClick={handleGenerateLink} isLoading={genLoading} disabled={genLoading}>
                  Gerar Link Seguro
                </Button>
              </div>

              {genLink && (
                <div className="mt-4 p-4 bg-green-50 rounded-md border border-green-200 animate-in fade-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-green-700 mb-1 uppercase tracking-wide">Link Gerado (Copie e envie)</label>
                  <div className="flex space-x-2">
                    <input 
                      readOnly 
                      value={genLink} 
                      className="flex-1 text-sm bg-white p-2 rounded border border-green-300 text-green-800 font-mono"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button variant="secondary" onClick={copyLink}>Copiar</Button>
                  </div>
                </div>
              )}
           </div>
        </Card>

        <Card title="Conexão Manual (Admin • Demo)">
          <div className="space-y-4">
            <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded border border-amber-200">
              Use apenas para demonstração rápida. O fluxo oficial recomendado continua sendo Conectar Instagram (OAuth).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tenant ID (UUID)</label>
                <input
                  type="text"
                  value={manualTenantId}
                  onChange={e => setManualTenantId(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="tenant uuid"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Unit ID (UUID)</label>
                <input
                  type="text"
                  value={manualUnitId}
                  onChange={e => setManualUnitId(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="unit uuid"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Page ID</label>
                <input
                  type="text"
                  value={manualPageId}
                  onChange={e => setManualPageId(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="836285..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Page Name (opcional)</label>
                <input
                  type="text"
                  value={manualPageName}
                  onChange={e => setManualPageName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="Organix IA"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">IG Business Account ID</label>
                <input
                  type="text"
                  value={manualIgId}
                  onChange={e => setManualIgId(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="1784..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">IG Username (opcional)</label>
                <input
                  type="text"
                  value={manualIgUsername}
                  onChange={e => setManualIgUsername(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="@sua_conta"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Access Token</label>
                <textarea
                  value={manualAccessToken}
                  onChange={e => setManualAccessToken(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border min-h-[110px]"
                  placeholder="cole o token aqui"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleManualConnect} isLoading={manualLoading} disabled={manualLoading}>
                Salvar Conexão Manual
              </Button>
            </div>
          </div>
        </Card>
        </>
        )}
      </div>
    </div>
  )
}
