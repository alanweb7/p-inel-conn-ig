# Manual completo — Meta App + Instagram OAuth (Organix)

## Objetivo
Configurar do zero um app na Meta e conectar Instagram no painel da Organix com OAuth, mantendo também os campos de conexão manual para contingência.

---

## 1) Pré-requisitos

- Conta Meta Developer com acesso ao Business/portfólio correto.
- Conta Instagram **profissional** (Business/Creator) vinculada a uma Página Facebook.
- Projeto Supabase ativo (com Edge Functions).
- Web app da Organix rodando (Vercel).

---

## 2) Criar o App na Meta

1. Acesse Meta for Developers > **Meus Apps** > **Criar App**.
2. No fluxo de casos de uso, selecione:
   - **Gerenciar mensagens e conteúdo no Instagram**.
3. Na etapa de empresa/portfólio, selecione o portfólio correto (ex.: **Organix CRM**).
4. Conclua e entre no painel do app.

---

## 3) Permissões corretas

Em **Permissões e recursos**, garantir (modo teste já basta no início):

- `instagram_business_basic`
- `instagram_business_content_publish`
- `pages_show_list`
- `pages_read_engagement`
- `business_management`

Opcional (se usar mensagens/comentários):
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`
- `instagram_business_manage_insights`

---

## 4) Domínios e Redirect URI (ESSENCIAL)

Erro comum resolvido: “Não é possível carregar a URL / domínio não incluído”.

No App Meta:

### Settings > Basic
- **App Domains**: adicionar
  - `gaacobzmhinrxyaikgga.supabase.co`

### Facebook/Instagram Login (config de OAuth)
- **Valid OAuth Redirect URIs**: adicionar exatamente
  - `https://gaacobzmhinrxyaikgga.supabase.co/functions/v1/instagram-auth-callback`

---

## 5) Variáveis de ambiente necessárias

### Supabase (Edge Functions)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` (callback acima)
- `GRAPH_API_VERSION` (ex.: `v22.0`)
- `OAUTH_STATE_SECRET`
- `OAUTH_LINK_SECRET` (p/ links públicos assinados)
- `TOKEN_ENCRYPTION_KEY`
- `META_SCOPES` (recomendado):
  - `instagram_business_basic,instagram_business_content_publish,pages_show_list,pages_read_engagement,business_management`

### Vercel (Web app)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TENANT_ID` (se aplicável)
- `SUPABASE_SERVICE_ROLE_KEY`
- `TOKEN_ENCRYPTION_KEY`
- `PUBLISH_TEST_SECRET` (somente para endpoint de teste)

---

## 6) Fluxo que ficou funcionando

### 6.1 Conectar via OAuth (painel)
- Botão “Conectar Instagram” chama `instagram-auth-start`.
- Gera `state` assinado + nonce anti-replay.
- Redireciona para OAuth da Meta.
- Callback troca `code` por token, descobre `instagram_business_account`, salva em:
  - `tenant_social_account`
  - `tenant_social_credential`
- Exibe sucesso:
  - “Instagram conectado com sucesso ✅ / Você já pode publicar para este tenant.”

### 6.2 Status de conexão
Ajuste importante aplicado:
- A função `instagram-status` agora prioriza conta com `status='active'`.
- Se não houver ativa, cai para a mais recente.

Isso corrige o falso “desconectado” quando existe registro antigo com status `disconnected`.

### 6.3 Desconectar
Ajuste aplicado:
- Painel passou a usar endpoint interno `/api/instagram/disconnect` (evita erro `Invalid JWT` da edge antiga em alguns cenários).

---

## 7) Manual Connect (contingência)

Mantido no painel por decisão operacional.

Campos mínimos:
- `tenantId`
- `accessToken`
- `pageId`
- `igBusinessAccountId`

Opcionais:
- `pageName`
- `igUsername`
- `expiresAt`

---

## 8) Como obter IDs corretos no Graph Explorer

Endpoint:
- `GET /me/accounts?fields=id,name,instagram_business_account{id,username}`

Use:
- `pageId` = `id` da página
- `igBusinessAccountId` = `instagram_business_account.id`

Importante:
- O “ID do usuário no escopo do aplicativo” NÃO é o `igBusinessAccountId`.

---

## 9) Troubleshooting rápido

### A) OAuth abre mas dá erro de domínio
- Falta `App Domains` ou `Valid OAuth Redirect URIs`.

### B) Painel mostra desconectado após sucesso no callback
- Verificar tenant enviado no header.
- Garantir versão nova da função `instagram-status` (prioriza `active`).

### C) `Invalid JWT` ao desconectar
- Usar endpoint interno `/api/instagram/disconnect` (já aplicado).

### D) Publicação intermitente (`Media ID is not available`)
- Necessário polling de status do container antes de `media_publish`.

### E) Git commit falha por permissão em `.git/objects`
- Ajustar dono do `.git` para usuário do runtime (ex.: UID 1000).

---

## 10) Deploy operacional

### Git + push
```bash
git add .
git commit -m "sua mensagem"
git push origin main
```

### Vercel
```bash
vercel --prod
```

Observação:
- `vercel --prod` não faz git push; são passos separados.

---

## 11) Checklist final (go-live)

- [ ] App Meta criado com caso de uso Instagram correto
- [ ] Permissões business adicionadas
- [ ] Domínio + redirect URI configurados
- [ ] Edge Functions com envs corretas
- [ ] Web app com envs corretas
- [ ] OAuth conectando e gravando conta `active`
- [ ] Status refletindo `connected=true`
- [ ] Desconectar funcionando
- [ ] Publish de teste concluído com `post_id`

---

## Nota
Este manual reflete o processo validado durante os ajustes da Organix em produção de teste e os fixes aplicados no painel + funções Edge.
