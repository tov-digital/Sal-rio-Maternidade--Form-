# PLENA — Quiz do benefício maternidade

Quiz de captação de leads para a PLENA, assessoria privada especializada em salário-maternidade.
Funil: **anúncio no Meta Ads → este quiz → WhatsApp da equipe.**

O front-end está pronto: design, perguntas, regras de prioridade, captura e resultado.
**Falta o backend:** salvar o lead (Supabase), configurar o WhatsApp oficial e publicar na Vercel.

---

## 1. Como rodar

É um site estático, sem build e sem dependências. HTML, CSS e JS puros.

```bash
python3 -m http.server 4173
# abrir http://localhost:4173
```

Se o arquivo for aberto direto (`file://`) ou com `leadEndpoint` vazio, o quiz roda em **modo de teste**. Nesse modo o lead não é gravado. Se `whatsappNumber` estiver preenchido, o botão do WhatsApp abre a conversa de verdade (sem número, ele só mostra a mensagem que seria enviada).

## 2. Estrutura

```text
index.html     estrutura da página (entrada, barra de progresso, rodapé)
style.css      todo o visual
funnel.js      perguntas, ramificações, regra de prioridade e validação de celular
app.js         telas, animações, captura, resultado e envio do lead (função save)
config.js      leadEndpoint e whatsappNumber  ← configurar
assets/        símbolo da marca, foto, fontes Nunito/Mulish (licenças OFL junto)
vercel.json    cabeçalhos de segurança e cache
```

## 3. Fluxo do quiz

1. **Entrada:** "Está grávida ou seu bebê já nasceu?". Os dois botões já respondem a primeira pergunta.
2. **Meses de gravidez** (gestante) ou **idade do bebê** (pós-parto).
3. **O benefício é para você?** Se for para outra pessoa, aparece “Que bom que você está ajudando! 💜” e as perguntas seguintes passam a falar “dela”. Os códigos não mudam; só os `labels` chegam em terceira pessoa.
4. **Situação de trabalho.**
5. **Já trabalhou registrada ou pagou INSS?** Só aparece se ela não estiver de carteira assinada.
6. **Já pediu o benefício?** Só no pós-parto.
7. **Tela "Analisando…"** (cerca de 2,5 s, apenas visual).
8. **Captura:** nome e WhatsApp. É a "chave" para ver o resultado. Uma prévia mostra a situação já aberta ("Aprovado") e o valor e o próximo passo borrados. Não use cadeado nem a palavra "Bloqueado": o público lê como cobrança.
9. **Resultado:** "Perfil aprovado", valor estimado, resumo das respostas, prioridade e botão do WhatsApp.

O lead só existe a partir do passo 8. **Há um único envio por lead**, com todas as respostas.

## 4. Onde integrar

Toda a integração passa por **uma função**, `save()` em `app.js`:

```js
async function save(stage, currentAnswers, currentContact) { ... fetch(config.leadEndpoint, {method:"POST", body: JSON}) ... }
```

- Ela é chamada quando a pessoa envia nome e WhatsApp.
- Se der erro (não 2xx ou timeout de 8 s), a tela mostra "A conexão falhou. Tente continuar de novo." e o resultado **não** abre. Ela pode tentar de novo.
- Se ela voltar e mudar respostas, o envio acontece de novo com o **mesmo `leadId`**. Por isso o backend deve fazer **upsert por `leadId`**.

### Payload enviado (POST JSON)

```json
{
  "leadId": "3f1c9a52-6a0e-4c47-9a57-2d7a3b1c8e10",
  "stage": "completed",
  "contact": { "name": "Ana Paula Souza", "phone": "5511988887777" },
  "answers": {
    "situation": "postpartum", "timing": "under-three", "holder": "self",
    "work": "no", "history": "no", "request": "none"
  },
  "labels": {
    "situation": "Meu bebê já nasceu", "timing": "Menos de 3 meses", "holder": "Sim, é para mim",
    "work": "Não, estava desempregada", "history": "Não, nunca trabalhei registrada nem paguei",
    "request": "Não, ainda não pedi"
  },
  "campaign": { "utm_source": "facebook", "utm_campaign": "...", "utm_content": "..." },
  "priority": "maxima",
  "eligibleForHandoff": true,
  "thirdParty": false
}
```

- `phone` já chega normalizado: `55` + DDD + 9 dígitos. Na tela, a máscara mostra `(11) 99999-9999`.
- Códigos de `work`: `yes`, `no`, `self-employed` e `informal` (sem registro: bico, diária). Não existe `unknown` nessa pergunta; ele só aparece em `history` e `request`.
- `answers` traz os códigos estáveis, que servem para regras e filtros. `labels` traz o texto que a pessoa viu, que serve para o atendente ler.
- `campaign` só inclui as UTMs presentes na URL (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`), até 160 caracteres cada.
- `priority` é `maxima`, `media` ou `fora_da_fila` (regra em `funnel.js` → `assessment()`, resumida na seção 6).
- `eligibleForHandoff: false` indica que o resultado é neutro e sem botão de WhatsApp.

### Recomendação de arquitetura

**Não** coloque a chave `service_role` do Supabase no front-end. Sugestão:

1. Criar uma **função serverless na Vercel** (`/api/lead`) que:
   - valide o payload no servidor: `leadId` UUID, telefone no padrão `^55[1-9][0-9]9[0-9]{8}$`, nome (`contact.name`, como a pessoa digitou, com espaços normalizados) com até 60 caracteres e valores de `answers` dentro dos códigos de `funnel.js`;
   - faça o **upsert** na tabela do Supabase usando a chave de serviço guardada em variável de ambiente da Vercel;
   - aplique proteção básica contra spam, como limite por IP e/ou um campo honeypot.
2. Em `config.js`, apontar `leadEndpoint: "/api/lead"`.

Se preferir gravar direto do navegador com a chave `anon`, use RLS permitindo só `insert`/`update` controlados. Nesse caso, a função `save()` pode ser trocada pelo client do Supabase.

Tabela sugerida (ajuste à vontade):

```sql
create table leads (
  lead_id uuid primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  name text not null,
  phone text not null,
  situation text, timing text, holder text, work text, history text, request text,
  labels jsonb,
  campaign jsonb,
  priority text check (priority in ('maxima','media','fora_da_fila')),
  eligible_for_handoff boolean,
  third_party boolean
);
```

## 5. WhatsApp

Em `config.js`, `whatsappNumber` recebe o número no formato `5511999999999`, sem pontuação. **Hoje está um número pessoal provisório, só para testes: troque pelo número oficial da PLENA antes de publicar.** Com o número configurado, o botão do resultado abre `wa.me` com uma mensagem pronta, por exemplo:

> Olá! Meu nome é Ana e meu perfil foi aprovado na análise do benefício maternidade. Quero confirmar se posso receber de R$ 6.484 a R$ 15.160.

## 6. Regra de prioridade (comercial)

Definida em `funnel.js` → `assessment()`:

| Situação | Prioridade |
|---|---|
| Pós-parto com bebê de mais de 5 anos, ou pedido já aprovado ou em análise | `fora_da_fila` (resultado neutro, sem WhatsApp) |
| Pesquisando para outra pessoa | `media` |
| Gestante de 8 ou 9 meses (códigos `next-month` e `this-month`) | `maxima` |
| Gestante desempregada que nunca contribuiu | `maxima` |
| Pós-parto há menos de 3 meses sem pedido, ou pedido negado | `maxima` |
| Demais casos | `media` |

Não altere essa regra sem falar com a PLENA.

## 7. Publicar na Vercel

1. Subir esta pasta num repositório do GitHub.
2. Na Vercel: **New Project → importar o repositório**.
   - Framework: **Other**.
   - Build command: vazio.
   - Output: a raiz.
3. Configurar o domínio `queromeubeneficio.com.br`.
4. Variáveis de ambiente (se usar `/api/lead`): `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## 8. Pendências antes de ir ao ar

- [ ] Endpoint de lead funcionando, com teste de ponta a ponta.
- [ ] Trocar o número provisório de `whatsappNumber` pelo oficial.
- [ ] Política de privacidade e dados da empresa (CNPJ) no rodapé, conforme a LGPD. Hoje o rodapé tem só um resumo em "Privacidade e segurança".
- [ ] Pixel do Meta e eventos, por exemplo `Lead` no envio da captura e `Contact` no clique do WhatsApp. Respeitar a configuração de consentimento.
- [ ] Remover `<meta name="robots" content="noindex,nofollow">` do `index.html` **se** a página deve aparecer no Google. Para tráfego só de anúncio, pode manter.
- [ ] Opcional: converter as fontes `.ttf` para `.woff2` (cerca de 490 KB hoje) para carregar mais rápido no celular.

## 9. O que não mudar sem combinar

- Textos, perguntas, ordem do fluxo e valores (R$ 6.484 a R$ 15.160): são decisões de negócio da PLENA.
- Identidade visual: cores, fontes e símbolo seguem o manual da marca.
- Os códigos de `answers` (`pregnant`, `under-three`, etc.): o CRM e os relatórios dependem deles.
