# Juntos · finanças da família

App de celular (PWA) para controlar o dinheiro da família: limite do mês, contas a pagar, metas por categoria e projeção dos próximos meses.

- **Funciona sem internet.** Tudo fica salvo no celular e sincroniza quando a conexão volta.
- **Várias pessoas.** Cada pessoa tem login próprio. Um espaço (família) pode ter vários membros, entrando por código de convite.
- **Nota fiscal.** Foto do cupom: o app lê o texto na nuvem (OCR.space, gratuito, função `fin-ocr`) e preenche valor, loja e data. Sem internet, lê no próprio celular (menos preciso).
- **Lançar falando.** Use o microfone do teclado do celular no campo "Fale ou escreva o gasto".
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
| `supabase/functions/fin-ocr/` | Leitura da foto do cupom (precisa do segredo `OCRSPACE_KEY`) |

## Segurança
A chave em `config.js` é a chave **publicável** do Supabase e pode ficar pública. Cada tabela tem regras (RLS) que só deixam um usuário ver os dados dos espaços de que ele é membro.

## Publicar uma nova versão
Altere os arquivos e envie para a branch `main`. O GitHub Pages publica sozinho. Ao mudar `app.js` ou `styles.css`, aumente a versão em `sw.js` (`VERSAO`) para os celulares baixarem a atualização.
