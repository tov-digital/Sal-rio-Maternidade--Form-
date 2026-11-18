// icon: emoji exibido na opção (não vai para o CRM). label: texto enviado ao CRM em `labels`.
const option = (value, label, icon = "") => ({value, label, icon});
const notSure = option("unknown", "Não tenho certeza", "🤔");

function questions(a) {
  const pregnant = a.situation !== "postpartum";
  // Quem pesquisa para outra pessoa recebe as perguntas falando "dela" (os códigos não mudam).
  const other = a.holder === "other";
  return [
    {id:"situation", title:"Para começar, qual é a sua situação?", options:[
      option("pregnant","Ainda estou grávida","🤰"), option("postpartum","Meu bebê já nasceu","👶")
    ]},
    {id:"timing", title:pregnant ? "Você está com quantos meses de gravidez?" : "Faz quanto tempo que seu bebê nasceu?", options:pregnant ? [
      option("this-month","9 meses","⏰"), option("next-month","8 meses","🤰"),
      option("two-three","6 ou 7 meses","🗓️"), option("later","Até 5 meses","🌱")
    ] : [
      option("under-three","Menos de 3 meses","🍼"), option("under-year","Entre 3 meses e 1 ano","🧸"),
      option("one-three","Entre 1 e 3 anos","🚼"), option("three-five","Entre 3 e 5 anos","🎒"), option("over-five","Mais de 5 anos","📚")
    ]},
    {id:"holder", title:"O benefício é para você mesma?", options:[
      option("self","Sim, é para mim","🙋‍♀️"),option("other","Não, estou pesquisando para outra pessoa","👭")
    ]},
    other ? {id:"work", cheer:"Que bom que você está ajudando! 💜",
      title:pregnant ? "Ela está trabalhando registrada atualmente?" : "Quando o bebê nasceu, ela estava trabalhando registrada?",
      hint:"Responda pensando na situação dela. Registrada é com carteira assinada.", options:pregnant ? [
      option("yes","Sim, ela trabalha de carteira assinada","💼"), option("no","Não, ela está desempregada","🏠"),
      option("self-employed","Ela trabalha por conta própria ou é MEI","💅"), option("informal","Ela trabalha sem registro (bico, diária)","🧺")
    ] : [
      option("yes","Sim, ela trabalhava de carteira assinada","💼"), option("no","Não, ela estava desempregada","🏠"),
      option("self-employed","Ela trabalhava por conta própria ou era MEI","💅"), option("informal","Ela trabalhava sem registro (bico, diária)","🧺")
    ]} : {id:"work", title:pregnant ? "Você está trabalhando registrada atualmente?" : "Quando seu bebê nasceu, você estava trabalhando registrada?", hint:"Registrada é com carteira assinada.", options:pregnant ? [
      option("yes","Sim, trabalho de carteira assinada","💼"), option("no","Não, estou desempregada","🏠"),
      option("self-employed","Trabalho por conta própria ou sou MEI","💅"), option("informal","Trabalho sem registro (bico, diária)","🧺")
    ] : [
      option("yes","Sim, trabalhava de carteira assinada","💼"), option("no","Não, estava desempregada","🏠"),
      option("self-employed","Trabalhava por conta própria ou era MEI","💅"), option("informal","Trabalhava sem registro (bico, diária)","🧺")
    ]},
    ...(a.work === "yes" ? [] : [
      {id:"history", title:other ? "Ela já trabalhou registrada ou pagou INSS alguma vez?" : "Você já trabalhou registrada ou pagou INSS alguma vez?", hint:"Pode ser qualquer emprego, mesmo que por pouco tempo.", options:other ? [
        option("yes","Sim, ela já trabalhou registrada ou pagou","✅"), option("no","Não, ela nunca trabalhou registrada nem pagou","🙅‍♀️"), notSure
      ] : [
        option("yes","Sim, já trabalhei registrada ou paguei","✅"), option("no","Não, nunca trabalhei registrada nem paguei","🙅‍♀️"), notSure
      ]}
    ]),
    ...(pregnant ? [] : [
      {id:"request", title:other ? "Ela já pediu esse benefício?" : "Você já pediu esse benefício?", options:[
        option("none",other ? "Não, ela ainda não pediu" : "Não, ainda não pedi","📝"),option("denied",other ? "Ela pediu e foi negado" : "Pedi e foi negado","🚫"),
        option("pending",other ? "Ela pediu e ainda está em análise" : "Pedi e ainda está em análise","⏳"),option("approved",other ? "Ela pediu e já foi aprovado" : "Pedi e já foi aprovado","✅"),notSure
      ]}
    ]),
    // A captura vem por último: a vontade de ver o resultado é o gatilho para preencher.
    {id:"capture", title:other ? "Para onde enviamos o resultado dela?" : "Para onde enviamos o seu resultado?"},
  ];
}

function assessment(a) {
  const outside = a.situation === "postpartum" &&
    (a.timing === "over-five" || ["pending","approved"].includes(a.request));
  if (outside) return {priority:"fora_da_fila", eligibleForHandoff:false};
  if (a.holder === "other") return {priority:"media", eligibleForHandoff:true};
  const urgent = a.situation === "pregnant"
    ? ["this-month","next-month"].includes(a.timing) || (a.work === "no" && a.history === "no")
    : (a.timing === "under-three" && a.request === "none") || a.request === "denied";
  return {priority:urgent ? "maxima" : "media", eligibleForHandoff:true};
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g,"");
  const local = digits.length === 13 && digits.startsWith("55") ? digits.slice(2) : digits;
  return /^[1-9][0-9]9[0-9]{8}$/.test(local) ? "55" + local : null;
}
