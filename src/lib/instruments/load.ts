import fs from "node:fs";
import path from "node:path";
import type { InstrumentDef } from "./types";

const INSTRUMENT_DIR = path.join(process.cwd(), "instruments");

export function loadInstrumentFile(id: string): InstrumentDef {
  const file = path.join(INSTRUMENT_DIR, `${id}.json`);
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw) as InstrumentDef;
  validateInstrument(parsed);
  return parsed;
}

export function listInstrumentFiles(): string[] {
  if (!fs.existsSync(INSTRUMENT_DIR)) return [];
  return fs
    .readdirSync(INSTRUMENT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function loadAllInstruments(): InstrumentDef[] {
  return listInstrumentFiles().map(loadInstrumentFile);
}

function validateInstrument(inst: InstrumentDef): void {
  if (!inst.id || !inst.items?.length) {
    throw new Error(`Instrument missing id or items: ${inst.id ?? "<unknown>"}`);
  }
  const expectedScaleLen = inst.scaleMax - inst.scaleMin + 1;
  if (inst.scaleLabels.length !== expectedScaleLen) {
    throw new Error(
      `Instrument ${inst.id}: scaleLabels has ${inst.scaleLabels.length} entries, expected ${expectedScaleLen}`,
    );
  }
  const positions = new Set<number>();
  for (const it of inst.items) {
    if (positions.has(it.position)) {
      throw new Error(`Instrument ${inst.id}: duplicate position ${it.position}`);
    }
    positions.add(it.position);
    if (!inst.dimensions.find((d) => d.id === it.dimension)) {
      throw new Error(`Instrument ${inst.id}: item ${it.position} uses unknown dimension ${it.dimension}`);
    }
  }
}
