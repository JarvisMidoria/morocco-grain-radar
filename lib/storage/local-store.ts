import path from "node:path";

const RADAR_LOCAL_STORE_DIR_ENV = "RADAR_LOCAL_STORE_DIR";

export function getRadarLocalStoreDir() {
  const configured = process.env[RADAR_LOCAL_STORE_DIR_ENV]?.trim();
  if (!configured) {
    return path.join(process.cwd(), ".radar");
  }

  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}
