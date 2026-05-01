"use client";

import type { Debtor, EventLogEntry } from "@/lib/models";
import { useMemo } from "react";

interface NarratorPanelProps {
  debtors: Debtor[];
  events: EventLogEntry[];
}

export function NarratorPanel({ debtors, events }: NarratorPanelProps) {
  const lastMessageGenerated = useMemo(
    () => [...events].reverse().find((e) => e.eventType === "MESSAGE_GENERATED"),
    [events],
  );

  const lastWhatsAppEvent = useMemo(
    () => [...events].reverse().find((e) => e.eventType.startsWith("TWILIO_WHATSAPP_")),
    [events],
  );

  const demoPhase = useMemo(() => {
    if (debtors.length === 0) return "STANDBY";
    if (debtors.every((d) => d.state === "closed")) return "RECOVERY_COMPLETE";
    if (debtors.some((d) => d.state === "payment_matched")) return "RECONCILING_PAYMENTS";
    if (debtors.some((d) => d.state === "call_triggered")) return "VOICE_ESCALATION_L3";
    if (debtors.some((d) => d.state === "sms_2_sent")) return "SMS_ESCALATION_L2";
    if (debtors.some((d) => d.state === "sms_1_sent")) return "SMS_ESCALATION_L1";
    return "INITIAL_OUTREACH";
  }, [debtors]);

  const whatsappStatus = useMemo(() => {
    if (!lastWhatsAppEvent) return "WAITING";
    if (lastWhatsAppEvent.eventType === "TWILIO_WHATSAPP_SENT") return "DELIVERED";
    if (lastWhatsAppEvent.eventType === "TWILIO_WHATSAPP_FAILED") return "FAILED";
    if (lastWhatsAppEvent.eventType === "TWILIO_WHATSAPP_SEND_ATTEMPTED") return "ATTEMPTING...";
    if (lastWhatsAppEvent.eventType.includes("SKIPPED")) {
      const reason = lastWhatsAppEvent.metadata?.reason as string;
      if (reason === "twilio_whatsapp_not_configured") return "OFFLINE (NOT CONFIGURED)";
      if (reason === "non_demo_recipient") return "SKIPPED (RECIPIENT RESTRICTED)";
      if (reason === "demo_message_limit_reached") return "SKIPPED (RATE LIMIT)";
      return "SKIPPED";
    }
    return "PENDING";
  }, [lastWhatsAppEvent]);

  const narratorHint = useMemo(() => {
    if (demoPhase === "STANDBY") return "Awaiting demo initialization. Ready to seed PesterPay with social debt data.";
    if (demoPhase === "INITIAL_OUTREACH") return "The agent has identified the debt and is preparing the first outreach cycle.";
    
    const lastTickEvents = [...events].reverse().slice(0, 5);
    const skippedLucia = lastTickEvents.some(e => e.message.includes("skipped for Lucia"));
    const skippedHamza = lastTickEvents.some(e => e.message.includes("skipped for Hamza"));
    const sentDev = lastTickEvents.some(e => e.message.includes("sent to opted-in demo recipient for Dev") || e.eventType === "TWILIO_WHATSAPP_SENT");

    if (sentDev && skippedLucia && skippedHamza) {
      return "Agent generated a safe message, attempted WhatsApp only to Dev, skipped Lucia and Hamza, and is now waiting for payment.";
    }

    if (demoPhase === "SMS_ESCALATION_L1") {
      if (lastWhatsAppEvent?.eventType === "TWILIO_WHATSAPP_SENT") return "Level 1 pestering delivered via WhatsApp. Agent is now monitoring bank feeds for reconciliation.";
      return "Level 1 outreach attempted. Autonomous monitoring active.";
    }
    if (demoPhase === "SMS_ESCALATION_L2") return "Escalating to Level 2. The communication tone is becoming increasingly persistent.";
    if (demoPhase === "VOICE_ESCALATION_L3") return "Critical escalation: Autonomous voice call triggered. System will now attempt direct verbal contact.";
    if (demoPhase === "RECONCILING_PAYMENTS") return "Payment match detected! Reconciling transaction against debt record to verify closure.";
    if (demoPhase === "RECOVERY_COMPLETE") return "All funds recovered successfully. Social debt case closed autonomously by PesterPay.";
    
    return "Agent is monitoring the debt state and preparing the next autonomous action.";
  }, [demoPhase, lastWhatsAppEvent, events]);

  const nextActionHint = useMemo(() => {
    const activeDebtors = debtors.filter((d) => d.state !== "closed" && d.state !== "payment_matched");
    if (activeDebtors.length === 0) return "No further actions required. All targets settled.";

    const dev = activeDebtors.find((d) => d.name.toLowerCase() === "dev");
    if (dev) {
      return `Next agent cycle will process ${dev.name} (currently ${dev.state}).`;
    }
    return `Next agent cycle will process ${activeDebtors[0].name}.`;
  }, [debtors]);

  if (debtors.length === 0) return null;

  return (
    <div className="border-2 border-[var(--pp-lime)] bg-[var(--pp-bg-soft)] p-5 shadow-[0_0_30px_rgba(198,255,74,0.2)] mb-6">
      <div className="mb-4 flex items-center justify-between border-b border-[var(--pp-border-strong)] pb-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--pp-lime)]" />
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--pp-lime)]">Autonomous Demo Narrator</h2>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-[10px] font-bold text-[var(--pp-text-dim)] uppercase">
                Phase: <span className="text-[var(--pp-lime)]">{demoPhase.replace(/_/g, " ")}</span>
            </div>
            <div className="text-[10px] font-bold text-[var(--pp-text-dim)] uppercase">
                Mode: <span className="text-[var(--pp-text)]">LIVE HACKATHON</span>
            </div>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Integration Status</p>
                <p className="text-[10px] font-bold text-[var(--pp-green)] uppercase">Online</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-2 flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${whatsappStatus === "DELIVERED" ? "bg-[var(--pp-green)]" : "bg-[var(--pp-amber)]"}`} />
                    <p className="text-[10px] font-bold text-[var(--pp-text)]">WHATSAPP: {whatsappStatus}</p>
                </div>
                <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-2 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--pp-green)]" />
                    <p className="text-[10px] font-bold text-[var(--pp-text)]">LLM: OLLAMA_L3.2</p>
                </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)] mb-1">Latest Generated Agent Communication</p>
            <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-1 opacity-20">
                <div className="h-12 w-12 border-t-2 border-r-2 border-[var(--pp-lime)]" />
              </div>
              <p className="text-xs italic leading-relaxed text-[var(--pp-text-muted)] font-mono">
                {lastMessageGenerated ? lastMessageGenerated.message : "Awaiting agent execution..."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between space-y-5">
          <div className="border-l-2 border-[var(--pp-lime)] pl-4">
            <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)] mb-1">Narration Strategy</p>
            <p className="text-base font-bold leading-snug text-[var(--pp-text)]">
              {narratorHint}
            </p>
          </div>

          <div className="bg-[var(--pp-lime)]/5 border border-[var(--pp-lime)]/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-lime)] mb-1">Agent Planning</p>
            <p className="text-xs font-bold text-[var(--pp-text)]">
              {nextActionHint}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
