"use strict";

const screen = document.querySelector("#screen");
const intro = document.querySelector("#quiz-intro");
const start = document.querySelector("#quiz-start");
const back = document.querySelector("#back");
const progress = document.querySelector("#progress");
const progressFill = progress.querySelector(".progress-fill");
const progressTrack = progress.querySelector(".progress-track");
const progressCaption = document.querySelector("#progress-caption");
const progressCount = document.querySelector("#progress-count");
const demo = !config.leadEndpoint;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.querySelector("#https-badge").hidden = location.protocol !== "https:";
const allowedCampaignKeys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
const params = new URLSearchParams(location.search);
const campaign = Object.fromEntries(allowedCampaignKeys.filter(k => params.has(k)).map(k => [k,params.get(k).slice(0,160)]));
const VALUE_MIN = 6484, VALUE_MAX = 15160;
let answers = {}, contact = null, index = 0, busy = false;
let leadId = "";
let renderToken = 0;
let analyzedFor = "";   // respostas já "analisadas", para não repetir a animação ao voltar

const icons = {
  shield: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3l7 3v5.5c0 4.3-3 7.9-7 9.5-4-1.6-7-5.2-7-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/></svg>',
  lock: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="4" y="10" width="16" height="11" rx="2"/></svg>',
  check: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  badge: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  chat: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z"/></svg>',
};

/* ---------- utilidades ---------- */

function element(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value) el.textContent = value;
  return el;
}

function withIcon(tag, className, icon, text) {
  const el = element(tag, className);
  el.innerHTML = icon;
  el.append(text);
  return el;
}

const wait = ms => new Promise(r => setTimeout(r, reducedMotion ? Math.min(ms, 150) : ms));
const money = n => Math.round(n).toLocaleString("pt-BR");

// Faz os números "subirem" de zero até o valor final.
function countUp(nodes, duration = 1100) {
  if (reducedMotion || !nodes.length) return;
  const targets = nodes.map(n => Number(n.dataset.count));
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    nodes.forEach((n, i) => { n.textContent = money(targets[i] * eased); });
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function amountElement(className) {
  const el = element("strong", className);
  el.setAttribute("aria-label", `R$ ${money(VALUE_MIN)} a R$ ${money(VALUE_MAX)}`);
  el.innerHTML = `R$&nbsp;<span data-count="${VALUE_MIN}">${money(VALUE_MIN)}</span> a R$&nbsp;<span data-count="${VALUE_MAX}">${money(VALUE_MAX)}</span><sup>*</sup>`;
  return el;
}

function confetti() {
  if (reducedMotion) return;
  const box = element("div","confetti");
  box.setAttribute("aria-hidden","true");
  const colors = ["#12804a","#1fa463","#ddbbc9","#a0607f","#ffd25e","#ff9f7a","#4a1942"];
  for (let i = 0; i < 70; i++) {
    const c = element("i");
    c.style.left = Math.random() * 100 + "%";
    c.style.background = colors[i % colors.length];
    c.style.setProperty("--x", (Math.random() * 160 - 80) + "px");
    c.style.setProperty("--r", (Math.random() * 900 - 450) + "deg");
    c.style.setProperty("--d", (2.2 + Math.random() * 1.6) + "s");
    c.style.setProperty("--delay", (Math.random() * .5) + "s");
    if (i % 3 === 0) { c.style.width = "8px"; c.style.height = "8px"; c.style.borderRadius = "50%"; }
    box.append(c);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 4600);
}

/* ---------- envio ao CRM ---------- */

async function save(stage, currentAnswers, currentContact) {
  if (demo || !currentContact) return;
  if (!leadId) leadId = crypto.randomUUID();

  // Mapeia todas as perguntas da rota percorrida pelo usuário para pegar o texto exato
  const route = questions(currentAnswers);
  const findOptionLabel = (fieldId, val) => {
    if (!val) return null;
    const q = route.find(item => item.id === fieldId);
    if (q?.options) {
      const opt = q.options.find(o => o.value === val);
      if (opt) return opt.label;
    }
    const allRoutes = [
      ...questions({ situation: "pregnant", holder: "self", work: "no" }),
      ...questions({ situation: "pregnant", holder: "other", work: "no" }),
      ...questions({ situation: "postpartum", holder: "self", work: "no" }),
      ...questions({ situation: "postpartum", holder: "other", work: "no" })
    ];
    const fallbackQ = allRoutes.find(item => item.id === fieldId && item.options?.some(o => o.value === val));
    const fallbackOpt = fallbackQ?.options?.find(o => o.value === val);
    return fallbackOpt ? fallbackOpt.label : val;
  };

  const situacao = currentAnswers.situation ? findOptionLabel("situation", currentAnswers.situation) : null;
  const tempo = currentAnswers.timing ? findOptionLabel("timing", currentAnswers.timing) : null;
  const titular = currentAnswers.holder ? findOptionLabel("holder", currentAnswers.holder) : null;
  const trabalho = currentAnswers.work ? findOptionLabel("work", currentAnswers.work) : null;
  const historico = currentAnswers.history ? findOptionLabel("history", currentAnswers.history) : null;
  const pedido = currentAnswers.request ? findOptionLabel("request", currentAnswers.request) : null;
  const nome = currentContact.name?.trim() || null;
  const whatsapp = currentContact.phone || null;

  // Objeto 100% plano, sem arrays ou objetos aninhados, em português claro
  const payload = {
    id_lead: leadId,
    nome: nome,
    whatsapp: whatsapp,
    situacao: situacao,
    tempo: tempo,
    titular_do_beneficio: titular,
    trabalho_registrado: trabalho,
    historico_carteira_ou_inss: historico,
    ja_pediu_beneficio: pedido,
    origem: campaign.utm_source || null,
    campanha: campaign.utm_campaign || null
  };

  const response = await fetch(config.leadEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Falha na gravação");
}

async function advance(nextAnswers, nextContact = contact) {
  if (busy) return;
  busy = true;
  const controls = [...screen.querySelectorAll("button, input")];
  controls.forEach(el => { el.disabled = true; });
  back.disabled = true;
  screen.querySelector(".error")?.remove();
  const nextIndex = index + 1;
  try {
    // Com a captura no fim, o lead é enviado uma única vez, já com todas as respostas.
    if (questions(answers)[index]?.id === "capture") await save("completed", nextAnswers, nextContact);
    answers = nextAnswers;
    contact = nextContact;
    index = nextIndex;
    render();
  } catch {
    const error = element("p","error","A conexão falhou. Tente continuar de novo.");
    error.setAttribute("role","alert");
    screen.append(error);
    screen.querySelector(".options")?.classList.remove("locked");
  } finally {
    controls.forEach(el => { el.disabled = false; });
    back.disabled = false;
    busy = false;
  }
}

/* ---------- barra de progresso ---------- */

function setProgress(route) {
  const total = route.length;
  const known = index >= 4 || Boolean(answers.work);   // o total só aparece quando a rota já está definida
  const done = index >= total;
  const capture = route[index]?.id === "capture";
  const remaining = total - index - 2;   // a captura não conta como pergunta
  const pct = done ? 100 : capture ? 94 : Math.round((index + 1) / total * 100);
  progressFill.style.width = pct + "%";
  progressTrack.setAttribute("aria-valuenow", String(pct));
  progressCount.textContent = !done && !capture && known ? `${index + 1} de ${total - 1}` : "";
  progressCaption.textContent = done ? "Análise completa! ✨"
    : capture ? "Só falta ver seu resultado 👀"
    : index === 0 ? "Leva menos de 1 minuto ⏱️"
    : index === 1 ? "Boa! Vamos lá 👏"
    : index === 2 ? "Você está indo muito bem 💪"
    : known && remaining === 0 ? "Última pergunta! 🎉"
    : known && remaining === 1 ? "Falta só mais uma ✨"
    : "Quase lá 💪";
}

/* ---------- telas ---------- */

function renderQuestion(q, route) {
  const heading = element("h1","question",q.title);
  heading.tabIndex = -1;
  if (q.cheer) screen.append(element("p","cheer",q.cheer));
  screen.append(heading);
  if (q.hint) screen.append(element("p","hint",q.hint));
  if (!q.options) renderCapture();
  else {
    const list = element("div","options");
    q.options.forEach((choice, i) => {
      const button = element("button","option");
      button.type = "button";
      button.style.setProperty("--i", i);
      button.setAttribute("aria-pressed",String(answers[q.id] === choice.value));
      const icon = element("span","option-icon",choice.icon);
      icon.setAttribute("aria-hidden","true");
      const mark = element("span","option-mark");
      mark.innerHTML = icons.check;
      button.append(icon, element("span","option-label",choice.label), mark);
      button.addEventListener("click",() => {
        if (busy || list.classList.contains("locked")) return;
        list.classList.add("locked");
        list.querySelectorAll(".option").forEach(b => b.setAttribute("aria-pressed","false"));
        button.setAttribute("aria-pressed","true");
        button.classList.add("picked");
        const next = {...answers};
        if (next[q.id] !== choice.value) {
          for (const later of route.slice(index+1)) delete next[later.id];
        }
        next[q.id] = choice.value;
        const token = renderToken;
        // pausa curta para a mãe ver a escolha marcada antes de passar
        wait(380).then(() => { if (token === renderToken) advance(next); });
      });
      list.append(button);
    });
    screen.append(list);
    if (index >= 3) screen.append(withIcon("p","reassure",icons.shield,`Não tem resposta errada. A gente usa isso só para indicar o melhor caminho para ${answers.holder === "other" ? "ela" : "você"}.`));
  }
  heading.focus({preventScroll:true});
}

// Formata enquanto digita: (11) 99999-9999
function formatPhone(value) {
  let d = value.replace(/\D/g,"");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0,11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

// Prévia do resultado: a situação já aparece aberta ("Aprovado") e o resto fica borrado,
// para dar a boa notícia e deixar a curiosidade sobre o valor. Nada de cadeado (soa como cobrança).
function renderTeaser() {
  const card = element("div","teaser");
  card.setAttribute("aria-hidden","true");
  const approved = assessment(answers).eligibleForHandoff;
  card.innerHTML = `
    <div class="teaser-head"><span class="teaser-title">${answers.holder === "other" ? "Resultado dela" : "Seu resultado"}</span><span class="teaser-ready">${icons.badge}Pronto</span></div>
    <div class="teaser-row"><span>Situação do perfil</span>${approved ? `<b class="teaser-ok">${icons.badge}Aprovado</b>` : `<i class="blur w1"></i>`}</div>
    <div class="teaser-row"><span>Valor estimado</span><i class="blur w2 green"></i></div>
    <div class="teaser-row"><span>Próximo passo</span><i class="blur w3"></i></div>`;
  return card;
}

function renderCaptureScreen(q) {
  const ready = element("p","ready");
  ready.innerHTML = icons.badge;
  ready.append(answers.holder === "other" ? "A análise está pronta!" : "Sua análise está pronta!");
  const heading = element("h1","question",q.title);
  heading.tabIndex = -1;
  const other = answers.holder === "other";
  // Comando logo acima dos campos: guia o olhar do cartão para o formulário.
  const command = assessment(answers).eligibleForHandoff
    ? `Preencha abaixo e veja quanto ${other ? "ela pode" : "você pode"} receber 👇`
    : "Preencha abaixo e veja o resultado 👇";
  screen.append(ready, heading, renderTeaser(), element("p","fill-cta",command));
  renderCapture();
  heading.focus({preventScroll:true});
}

function renderCapture() {
  const form = element("form","capture");
  form.innerHTML = `
    <label for="lead-name">Seu nome</label>
    <input id="lead-name" name="name" autocomplete="name" autocapitalize="words" maxlength="60" required>
    <label for="phone">${answers.holder === "other" ? "Seu WhatsApp com DDD" : "WhatsApp com DDD"}</label>
    <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="(11) 99999-9999" required>
    <button class="cta">${answers.holder === "other" ? "Ver o resultado dela" : "Ver meu resultado"} <span class="cta-go">${icons.arrow}</span></button>`;
  const name = form.elements.name;
  const phone = form.elements.phone;
  if (contact) { name.value = contact.name; phone.value = formatPhone(contact.phone); }
  phone.addEventListener("input",() => { phone.value = formatPhone(phone.value); });
  form.append(withIcon("p","safe",icons.lock,"Seus dados estão seguros"));
  if (demo) form.append(element("p","preview-note","Ambiente de teste. Use dados fictícios. Nenhuma resposta será enviada."));
  else form.append(element("p","micro","A PLENA usa seu nome, WhatsApp e respostas para analisar seu caso e entrar em contato sobre o atendimento."));
  for (const field of [name,phone]) field.addEventListener("input",() => field.setCustomValidity(""));
  form.addEventListener("submit",e => {
    e.preventDefault();
    const fullName = name.value.trim().replace(/\s+/g," ");
    const normalized = normalizePhone(phone.value);
    name.setCustomValidity(/\p{L}/u.test(fullName) ? "" : "Informe seu nome.");
    phone.setCustomValidity(normalized ? "" : "Informe um celular com DDD e nove dígitos.");
    if (form.reportValidity()) advance(answers,{name:fullName,phone:normalized});
  });
  screen.append(form);
}

async function renderAnalyzing(token) {
  const box = element("div","analyzing");
  box.setAttribute("role","status");
  const mark = element("div","analyzing-mark");
  const img = element("img");
  img.src = "assets/marca.svg"; img.alt = "";
  mark.append(img);
  const steps = ["Conferindo sua situação","Verificando seu histórico de trabalho","Calculando o valor do benefício"];
  const list = element("ul","checklist");
  const items = steps.map(s => element("li",null,s));
  list.append(...items);
  box.append(mark, element("h2",null,"Analisando suas respostas…"), element("p",null,"Só um instante."), list);
  screen.append(box);
  for (const item of items) {
    item.classList.add("active");
    await wait(750);
    if (token !== renderToken) return false;
    item.classList.replace("active","done");
  }
  await wait(350);
  return token === renderToken;
}

// Frases do resumo do resultado, por pergunta e resposta.
const summaryText = {
  timing: {
    "this-month":"Gestação de 9 meses", "next-month":"Gestação de 8 meses",
    "two-three":"Gestação de 6 ou 7 meses", "later":"Gestação de até 5 meses",
    "under-three":"Bebê nascido há menos de 3 meses", "under-year":"Bebê nascido há menos de 1 ano",
    "one-three":"Bebê nascido há 1 a 3 anos", "three-five":"Bebê nascido há 3 a 5 anos", "over-five":"Bebê nascido há mais de 5 anos",
  },
  holder: {self:"Benefício para você", other:"Benefício para outra pessoa"},
  work: {yes:"Trabalho de carteira assinada", no:"Desempregada: pode ter direito mesmo assim", "self-employed":"Trabalho por conta própria ou MEI", informal:"Trabalho sem registro: pode ter direito mesmo assim"},
  history: {yes:"Já contribuiu com o INSS", no:"Sem contribuição: a equipe orienta o caminho", unknown:"Contribuições a confirmar"},
  request: {none:"Benefício ainda não pedido", denied:"Pedido negado: vamos verificar o motivo", pending:"Pedido em análise no INSS", approved:"Pedido já aprovado", unknown:"Pedido a confirmar"},
};

function renderSummary(route) {
  const box = element("div","summary");
  box.append(element("h3",null,"O que analisamos"));
  const list = element("ul");
  for (const q of route) {
    const text = summaryText[q.id]?.[answers[q.id]];
    if (!text) continue;
    const opt = q.options.find(o => o.value === answers[q.id]);
    const li = element("li");
    const em = element("span","em",opt?.icon || "•");
    em.setAttribute("aria-hidden","true");
    li.append(em, element("span","txt",text));
    li.insertAdjacentHTML("beforeend", icons.check);
    list.append(li);
  }
  box.append(list);
  return box;
}

function renderResult(route) {
  const status = assessment(answers);
  const name = contact.name.split(" ")[0];   // o resultado e o WhatsApp usam só o primeiro nome
  const thirdParty = answers.holder === "other";
  const eligible = status.eligibleForHandoff;
  const article = element("article","result");
  const card = element("div","result-card");
  const head = element("div", eligible ? "result-head" : "result-head neutral");
  const badge = element("span","status");
  badge.innerHTML = icons.badge;
  badge.append(!eligible ? "Análise concluída" : thirdParty ? "Caso aprovado" : "Perfil aprovado");
  const title = element("h2",null, !eligible ? `${name}, ${thirdParty ? "a" : "sua"} análise foi concluída`
    : thirdParty ? `Boa notícia, ${name}!` : `Parabéns, ${name}! 🎉`);
  title.tabIndex = -1;
  const lead = !eligible
    ? (thirdParty
      ? ({approved:"Você informou que o pedido dela já foi aprovado.",pending:"Você informou que o pedido dela ainda está em análise."}[answers.request] || "Você informou que o bebê nasceu há mais de cinco anos.")
      : ({approved:"Você informou que seu pedido já foi aprovado.",pending:"Você informou que seu pedido ainda está em análise."}[answers.request] || "Você informou que o bebê nasceu há mais de cinco anos."))
    : thirdParty ? "Pelas respostas, a mãe pode receber esse dinheiro."
    : "Pelas suas respostas, você pode receber esse dinheiro.";
  head.append(badge, title, element("p",null,lead));
  card.append(head);

  const body = element("div","result-body");
  if (eligible) {
    body.append(element("p","result-label","Valor estimado do benefício"));
    const amount = amountElement("result-amount");
    body.append(amount);
    const meter = element("div","meter");
    meter.innerHTML = `<div class="meter-track" aria-hidden="true"></div>
      <div class="meter-scale"><span>Mínimo R$ ${money(VALUE_MIN)}</span><b>Buscamos até R$ ${money(VALUE_MAX)}</b></div>`;
    body.append(meter);
    requestAnimationFrame(() => countUp([...amount.querySelectorAll("[data-count]")], 1300));
  }
  body.append(renderSummary(route));
  if (eligible && status.priority === "maxima" && !thirdParty) {
    const soon = answers.situation === "pregnant" && ["this-month","next-month"].includes(answers.timing);
    const chip = element("p","priority");
    chip.innerHTML = `<span aria-hidden="true">⚡</span><span><b>Seu caso é prioridade.</b> ${soon ? "Como o bebê está chegando, fale" : "Fale"} com a equipe ainda hoje.</span>`;
    body.append(chip);
  }
  card.append(body);
  article.append(card);

  if (eligible) {
    const next = element("div","next-step");
    const em = element("span","em","💬");
    em.setAttribute("aria-hidden","true");
    const text = element("div");
    text.append(element("h3",null, thirdParty ? "Próximo passo: a PLENA faz tudo por ela" : "Próximo passo: a PLENA faz tudo por você"),
      element("p",null, thirdParty
      ? "A gente cuida do pedido dela do começo ao fim, até o dinheiro cair na conta dela. Sem fila, sem papelada, sem risco de errar."
      : "A gente cuida do seu pedido do começo ao fim, no seu lugar, até o dinheiro cair na sua conta. Sem fila, sem papelada, sem risco de errar."));
    next.append(em, text);
    article.append(next);

    const handoff = thirdParty
      ? `Olá! Meu nome é ${name}. Estou pesquisando o benefício maternidade para outra pessoa.`
      : `Olá! Meu nome é ${name} e meu perfil foi aprovado na análise do benefício maternidade. Quero confirmar se posso receber de R$ 6.484 a R$ 15.160.`;
    const label = "Falar com a equipe no WhatsApp";
    // O modo de teste só deixa de gravar o lead; com número configurado, o botão abre o WhatsApp de verdade.
    if (/^55[1-9][0-9]9[0-9]{8}$/.test(config.whatsappNumber)) {
      const link = element("a","cta pulse");
      link.innerHTML = icons.chat;
      link.append(label);
      link.href = `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(handoff)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      article.append(link);
    } else {
      const details = element("details");
      const summary = element("summary","cta pulse");
      summary.innerHTML = icons.chat;
      summary.append(label);
      const preview = element("div","preview-note");
      preview.append(element("strong",null,"Mensagem de teste"),element("p","micro",handoff));
      details.append(summary,preview);
      article.append(details);
    }
    const seals = element("ul","seals");
    for (const t of ["Atendimento on-line","Rápido","Sem burocracia"]) seals.append(withIcon("li",null,icons.check,t));
    article.append(seals);
    if (!thirdParty) confetti();
  }
  screen.append(article);
  title.focus({preventScroll:true});
}

async function render() {
  const token = ++renderToken;
  const route = questions(answers);
  const q = route[index];
  setProgress(route);
  screen.replaceChildren();
  screen.classList.remove("enter");
  void screen.offsetWidth;            // reinicia a animação de entrada
  screen.classList.add("enter");
  window.scrollTo(0,0);
  if (q?.id === "capture") {
    const key = JSON.stringify(answers);
    if (analyzedFor !== key) {
      if (!await renderAnalyzing(token)) return;
      analyzedFor = key;
      screen.replaceChildren();
    }
    return renderCaptureScreen(q);
  }
  if (q) return renderQuestion(q, route);
  renderResult(route);
}

function showQuiz(on) {
  document.body.classList.toggle("in-quiz", on);
  intro.hidden = on;
  screen.hidden = !on;
  back.hidden = !on;
  progress.hidden = !on;
}

// A primeira pergunta (situação) é respondida direto na tela de entrada.
for (const button of start.querySelectorAll(".intro-option")) {
  button.addEventListener("click",() => {
    if (busy || start.classList.contains("locked")) return;
    const value = button.dataset.value;
    start.classList.add("locked");
    start.querySelectorAll(".intro-option").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    button.classList.add("picked");
    const next = answers.situation === value ? {...answers} : {situation:value};
    wait(320).then(() => {
      start.classList.remove("locked");
      index = 0;
      showQuiz(true);
      advance(next);
    });
  });
}

back.addEventListener("click",() => {
  if (busy) return;
  renderToken++;
  if (index <= 1) {
    index = 0;
    showQuiz(false);
    start.querySelector('[aria-pressed="true"]')?.classList.remove("picked");
    (start.querySelector('[aria-pressed="true"]') || start.querySelector(".intro-option")).focus({preventScroll:true});
    window.scrollTo(0,0);
    return;
  }
  index--;
  render();
});

countUp([...document.querySelectorAll(".value-amount [data-count]")], 1400);
