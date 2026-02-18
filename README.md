# OpenClaw Web App

Aplicação Next.js para gerenciamento de integrações, focado em Supabase Auth e Instagram.

## Pré-requisitos

- Node.js 18+
- Projeto Supabase configurado com Edge Functions (`instagram-auth-start`, `instagram-status`, `instagram-disconnect`)

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Configure as variáveis de ambiente:
   Copie `.env.example` para `.env.local` e preencha com suas credenciais.

   ```bash
   cp .env.example .env.local
   ```

3. Execute o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   Acesse [http://localhost:3000](http://localhost:3000).

## Estrutura

- `/app`: Páginas (Login, Dashboard) e Layout.
- `/components`: Componentes UI reutilizáveis e formulários.
- `/lib`: Clientes Supabase e utilitários de API.
- `middleware.ts`: Proteção de rotas via Supabase Auth.

## Gerador de Link de Conexão (Admin)

Para utilizar a funcionalidade de geração de links de conexão do Instagram no Dashboard:

1. **Configuração Supabase Edge Functions**:
   É necessário configurar a variável de ambiente `OAUTH_LINK_SECRET` no painel do Supabase (Edge Functions > Secrets).
   Esta chave é usada para assinar os links gerados e validar sua integridade e expiração.

   ```bash
   supabase secrets set OAUTH_LINK_SECRET=sua-chave-secreta-forte
   ```

2. **Uso**:
   No Dashboard, utilize o card "Gerador de Link de Conexão" para criar links personalizados para clientes, definindo o Tenant ID e o tempo de validade.
