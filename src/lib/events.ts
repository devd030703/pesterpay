import { nanoid } from "nanoid";
import type { EventLogEntry, EventType } from "./models";

const events: EventLogEntry[] = [];

export type LogEventInput = {
  entityType: EventLogEntry["entityType"];
  entityId: string;
  eventType: EventType;
  message: string;
  metadata?: Record<string, unknown>;
};

export function logEvent(input: LogEventInput): EventLogEntry {
  const event: EventLogEntry = {
    id: nanoid(),
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: input.eventType,
    message: input.message,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };

  events.push(event);
  return event;
}

export function listEvents(entityId?: string): EventLogEntry[] {
  if (!entityId) {
    return [...events];
  }

  return events.filter((event) => event.entityId === entityId);
}

export function resetEvents(): void {
  events.length = 0;
}

