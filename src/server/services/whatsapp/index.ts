/**
 * Integração com WhatsApp via Evolution API — configurada de verdade só na
 * Fase 10 (self-hosted no VPS). Até lá, este serviço é um stub best-effort:
 * nunca lança erro, nunca trava o fluxo que o chamou (agendamento, lembrete,
 * cupom de retorno continuam funcionando mesmo sem WhatsApp conectado).
 *
 * Quando a Evolution API estiver configurada (via variáveis de ambiente
 * EVOLUTION_API_URL/EVOLUTION_API_KEY), troque a implementação de `send`
 * por uma chamada HTTP real — a assinatura já é a mesma que o resto do
 * sistema usa (ver server/services/jobs/reminderScheduler.ts).
 */

export type WhatsAppSendResult = { sent: boolean; reason?: string };

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME ?? "barbearia-bacelar";

export function isWhatsAppConfigured(): boolean {
  return Boolean(EVOLUTION_API_URL && EVOLUTION_API_KEY);
}

/** Só dígitos, com DDI — formato que a Evolution API espera em `number`. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function sendWhatsAppMessage(params: {
  phone: string;
  message: string;
}): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[whatsapp stub] enviaria para ${params.phone}: ${params.message}`);
    }
    return { sent: false, reason: "Evolution API não configurada ainda (prevista para a Fase 10)." };
  }

  try {
    // Endpoint/payload do formato Evolution API v2 (POST /message/sendText/{instance}).
    // Confirme contra a versão realmente implantada na VPS antes de depender
    // disso em produção — a Evolution API já teve mudanças de formato entre
    // versões major, e isso nunca rodou contra uma instância real ainda.
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY!,
      },
      body: JSON.stringify({
        number: normalizePhone(params.phone),
        text: params.message,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { sent: false, reason: `Evolution API respondeu ${res.status}: ${await res.text().catch(() => "")}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
