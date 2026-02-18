
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
  
  // Link Generator State
  const [genTenantId, setGenTenantId] = useState(() => {
    const envTenant = process.env.NEXT_PUBLIC_TENANT_ID || ''
    // avoid keeping mock UUID as default in UI
    return envTenant === '11111111-1111-1111-1111-111111111111' ? '' : envTenant
  })
  const [genExpiresIn, setGenExpiresIn] = useState(168)
  const [genLink, setGenLink] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  
  const router = useRouter()

  const fetchStatus = async () => {
    setStatusLoading(true)
    try {
      const data = await instagramApi.getStatus()
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
      const sanitizedTenantId = userTenantId === '11111111-1111-1111-1111-111111111111' ? '' : userTenantId
      setGenTenantId(sanitizedTenantId)

      setLoading(false)
      fetchStatus()
    })
  }, [router])

  const handleConnect = async () => {
    try {
      const { url } = await instagramApi.startAuth()
      window.location.href = url
    } catch (e) {
      alert('Erro ao iniciar conexão: ' + (e as Error).message)
    }
  }

  const handleDisconnect = async () => {
    if(!confirm('Tem certeza que deseja desconectar?')) return
    try {
      await instagramApi.disconnect()
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
                     <Button onClick={handleConnect} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-none">
                        Conectar Instagram
                     </Button>
                  ) : (
                     <Button variant="danger" onClick={handleDisconnect}>
                        Desconectar
                     </Button>
                  )}
                  <Button variant="secondary" onClick={fetchStatus} isLoading={statusLoading} disabled={statusLoading}>
                    Atualizar Status
                  </Button>
               </div>
            </div>
            {/* DEBUG BUTTON */}
            <div className="mt-8 border-t pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Debug Tools</h3>
              <Button
                variant="outline"
                onClick={() => window.open(
                  "https://gaacobzmhinrxyaikgga.supabase.co/functions/v1/instagram-auth-start-debug?tenant_id=11111111-1111-1111-1111-111111111111",
                  "_blank"
                )}
              >
                Testar Auth Debug (Direct Link)
              </Button>
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
      </div>
    </div>
  )
}
