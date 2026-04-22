export const LEDGER_DIR = ".ankh/ledger";

export function ledgerPath(moduleId: string): string {
  return `${LEDGER_DIR}/${moduleId}.json`;
}
