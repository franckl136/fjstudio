type Slot = { hour: number; subject: string };

export function formatSlot(slot: Slot): string {
  return String(slot.hour).padStart(2,'0') + ' h · ' + slot.subject;
}
