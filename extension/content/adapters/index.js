import { hepsiburada } from "./hepsiburada.js";
import { trendyol } from "./trendyol.js";
import { amazon } from "./amazon.js";
import { n11 } from "./n11.js";
import { teknosa } from "./teknosa.js";
import { vatan } from "./vatan.js";

const ADAPTERS = [hepsiburada, trendyol, amazon, n11, teknosa, vatan];

export function adapterFor(hostname) {
  const h = (hostname || "").replace(/^www\./, "");
  return ADAPTERS.find((a) => a.hosts.some((host) => h === host || h.endsWith("." + host))) || null;
}
