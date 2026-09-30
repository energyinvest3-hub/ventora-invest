# Ventora — Wind Energy

Aplicação Next.js com autenticação Supabase, dashboard, projetos eólicos, carteira, perfil, recuperação de senha e participação em projetos via RPC protegida no banco.

## Supabase

Use um projeto Supabase **separado do EnergyInvest**. Na mesma conta/organização pode, mas não reutilize o mesmo banco.

1. Crie o projeto Ventora na região `sa-east-1`.
2. Abra o SQL Editor e aplique `supabase/schema.sql`.
3. Em Authentication, habilite Email/Password.
4. Em Auth → URL Configuration, configure o domínio final e os redirects:
   - `https://SEU-DOMINIO/auth/callback`
   - `https://SEU-DOMINIO/redefinir-senha`
5. Copie a Project URL e a Publishable Key para as variáveis abaixo.

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=https://SEU-DOMINIO
```

A chave publishable pode ser usada no navegador. Não adicione service-role ao frontend.

## Login e cadastro

- `/login`
- `/cadastro`
- `/recuperar-senha`
- `/redefinir-senha`

As rotas da plataforma exigem sessão Supabase. Novos usuários recebem perfil e carteira zerada automaticamente pelo trigger `handle_new_user`.

## Projetos

As imagens eólicas fotográficas ficam dentro de `public/` e não dependem de links externos.

## Financeiro

O schema inclui carteira e compra atômica de participação debitando apenas saldo existente. A recarga PIX/gateway não está conectada nesta etapa. Configure o gateway e a conciliação antes de habilitar depósitos públicos.
