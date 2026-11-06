# Juntos · finanças da família

App de celular (PWA) para controlar o dinheiro da família: limite do mês, contas a pagar, metas por categoria e projeção dos próximos meses.

- **Funciona sem internet.** Tudo fica salvo no celular e sincroniza quando a conexão volta.
- **Várias pessoas.** Cada pessoa tem login próprio. Um espaço (família) pode ter vários membros, entrando por código de convite.
- **Lançar por texto ou voz.** Escreva ou fale "45 reais no mercado, no débito" e o app preenche. (A leitura por foto da nota foi removida em 6/nov/2026: errava valores.)
- **Tema claro, escuro ou automático.**

## Como instalar no iPhone
1. Abra o endereço do app no Safari.
2. Toque em Compartilhar e depois em **Adicionar à Tela de Início**.

## Estrutura
| Arquivo | Para quê |
|---|---|
| `index.html`, `styles.css`, `app.js` | O app |
| `config.js` | Endereço e chave publicável do Supabase |
| `sw.js` | Guarda o app no celular para abrir offline |
| `manifest.webmanifest`, `icons/` | Instalação como app |
| `supabase/juntos_banco.sql` | Tabelas `fin_*`, regras de acesso (RLS) e bucket `fin-notas` |
| `supabase/functions/` | Funções antigas de leitura de nota (sem uso) |

## Segurança
A chave em `config.js` é a chave **publicável** do Supabase e pode ficar pública. Cada tabela tem regras (RLS) que só deixam um usuário ver os dados dos espaços de que ele é membro.

## Publicar uma nova versão
Altere os arquivos e envie para a branch `main`. O GitHub Pages publica sozinho. Ao mudar `app.js` ou `styles.css`, aumente a versão em `sw.js` (`VERSAO`) para os celulares baixarem a atualização.
