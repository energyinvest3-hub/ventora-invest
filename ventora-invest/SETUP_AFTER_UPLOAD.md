# Ventora — pós-upload

## 1. Banco
No Supabase SQL Editor, execute nesta ordem:
1. `supabase/energy-parity-admin-referrals.sql`
2. Crie a conta administrativa em Authentication > Users com o e-mail `windinvest@gmail.com` e marque Auto Confirm User.
3. Execute `supabase/bind-only-admin.sql`.

O segundo script vincula o UUID real da conta à tabela privada de administradores. A senha nunca deve ser salva no GitHub.

## 2. Confirm Email
Authentication > Providers > Email > Confirm email: OFF.

## 3. URL Configuration
Site URL: `https://ventora-invest.vercel.app`
Redirect URLs: `https://ventora-invest.vercel.app/**`

## 4. Vercel
Root Directory: `ventora-invest`
Variáveis:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_SITE_URL

## 5. Testes
- Crie uma conta comum.
- Abra Perfil > Convidar e copie o código.
- Cadastre outra conta pela URL `/cadastro?ref=CODIGO`.
- Confirme que ela aparece em Perfil > Equipe.
- Entre com a conta admin e confirme que `/admin` abre.
- Entre com uma conta comum e confirme que `/admin` volta para `/perfil`.
