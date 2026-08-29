// ════════════════════════════════════════════════════════════════════════════
//  Aceite do patch ig_reel — roda contra o CÓDIGO REAL já corrigido.
//
//  ⚠️ Isto NÃO é uma réplica do schema: importa `instagramWebhookEventSchema`
//     direto de integrations/instagram/src/schemas.ts, depois do patch aplicado.
//     Se o patch não pegar, estes testes caem.
//
//  ⛔ Fixtures inteiramente inventadas. ⛔ Nenhum dado real de ninguém.
//  Uso no runner:  npx tsx schema-tests.mjs
// ════════════════════════════════════════════════════════════════════════════
import { instagramWebhookEventSchema as SCHEMA } from "../ChatbotX/integrations/instagram/src/schemas.ts";

const CONTA = "17800000000000000";
const P1 = "61300000000000";
const P2 = "61300000000001";

const ev = (m, s = P1) => ({ sender: { id: s }, recipient: { id: CONTA }, timestamp: 1787858042453, ...m });
const env = (...eventos) => ({ object: "instagram", entry: [{ id: CONTA, time: 1787858042453, messaging: eventos }] });
const anexo = (type, mid = "m_FIXTURE") => ({ message: { mid, attachments: [{ type, payload: { url: "https://exemplo.invalido/a" } }] } });
const texto = (t, mid = "m_TXT") => ({ message: { mid, text: t } });

// Reproduz o handler de produção: safeParse do payload inteiro; falha => descarta tudo.
function receber(corpo) {
  const r = SCHEMA.safeParse(corpo);
  if (!r.success) return { ok: false, erro: r.error.issues[0] };
  const atendimentos = [];
  for (const e of r.data.entry) {
    for (const it of e.messaging ?? []) {
      const m = it.message;
      if (!m || m.is_echo) continue;
      atendimentos.push(m.attachments?.length ? `anexo:${m.attachments.map((a) => a.type).join("+")}` : "texto");
    }
  }
  return { ok: true, atendimentos };
}

const CASOS = [
  ["texto inbound passa", env(ev(texto("oi"))), (r) => r.ok && r.atendimentos.length === 1],
  ["ig_reel inbound passa", env(ev(anexo("ig_reel"))), (r) => r.ok && r.atendimentos.some((a) => a.includes("ig_reel"))],
  ["ig_reel is_echo nao vira atendimento", env(ev({ message: { mid: "m_E", is_echo: true, attachments: [{ type: "ig_reel", payload: {} }] } }, CONTA)), (r) => r.ok && r.atendimentos.length === 0],
  ["image/video/audio/file/share continuam", env(ev(anexo("image", "a")), ev(anexo("video", "b")), ev(anexo("audio", "c")), ev(anexo("file", "d")), ev(anexo("share", "e"))), (r) => r.ok && r.atendimentos.length === 5],
  ["story_mention passa", env(ev(anexo("story_mention"))), (r) => r.ok && r.atendimentos.length === 1],
  ["reel passa", env(ev(anexo("reel"))), (r) => r.ok && r.atendimentos.length === 1],
  ["template passa", env(ev(anexo("template"))), (r) => r.ok && r.atendimentos.length === 1],
  ["tipo desconhecido vira fallback", env(ev(anexo("tipo_que_a_meta_ainda_nao_inventou"))), (r) => r.ok && r.atendimentos.some((a) => a.includes("fallback"))],
  ["LOTE texto + ig_reel: as duas sobrevivem", env(ev(texto("nao pode se perder", "m_A")), ev(anexo("ig_reel", "m_B"), P2)), (r) => r.ok && r.atendimentos.length === 2],
  ["LOTE texto + desconhecido: as duas sobrevivem", env(ev(texto("nao pode se perder", "m_C")), ev(anexo("tipo_novo", "m_D"), P2)), (r) => r.ok && r.atendimentos.length === 2],
  ["payload estruturalmente invalido continua rejeitado", { object: "instagram", entry: [{ id: 123, time: "ontem" }] }, (r) => !r.ok],
  ["read/reaction/message_edit sem atendimento", env(ev({ read: { mid: "m_R", watermark: 1 } }), ev({ reaction: { mid: "m_S", action: "react", emoji: "x" } }), ev({ message_edit: { mid: "m_T", text: "x" } })), (r) => r.ok && r.atendimentos.length === 0],
];

let ok = 0;
for (const [nome, corpo, aceite] of CASOS) {
  const r = receber(corpo);
  const passou = aceite(r);
  if (passou) ok++;
  const detalhe = r.ok
    ? `ACEITO [${r.atendimentos.join(" | ") || "sem atendimento"}]`
    : `REJEITADO ${r.erro.code} em ${r.erro.path.join(".")}`;
  console.log(`${passou ? "PASSOU" : "FALHOU"}  ${nome.padEnd(50)} ${detalhe}`);
}
console.log(`\nRESULTADO: ${ok}/${CASOS.length}`);
if (ok !== CASOS.length) {
  console.error("\nAceite REPROVADO — a imagem nao deve ser publicada.");
  process.exit(1);
}
console.log("Aceite APROVADO.");
