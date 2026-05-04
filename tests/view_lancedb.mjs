import { connect } from "@lancedb/lancedb";
import path from "node:path";
import os from "node:os";

console.log("Viewing LanceDB contents...\n");

function getVectorDBPath() {
  const homeDir = os.homedir();
  if (process.platform === "win32") {
    return process.env.APPDATA
      ? path.join(process.env.APPDATA, "EVPAgent", "lancedb")
      : path.join(homeDir, ".evpagent", "lancedb");
  }
  if (process.platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "EVPAgent", "lancedb");
  }
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "EVPAgent", "lancedb")
    : path.join(homeDir, ".config", "EVPAgent", "lancedb");
}

async function viewAll() {
  const dbPath = getVectorDBPath();
  const db = await connect(dbPath);

  let tbl;
  try {
    tbl = await db.openTable("evpagent_wikipedia");
  } catch (error) {
    console.log(`Table "evpagent_wikipedia" does not exist yet.\n`);
    console.log(`DB path: ${dbPath}`);
    return;
  }

  // Query all data
  const allData = await tbl.query().limit(100).toArray();

  console.log(`Total records: ${allData.length}\n`);

  // Group by type
  const byType = {};
  for (const row of allData) {
    const type = row.type || "unknown";
    if (!byType[type]) byType[type] = [];
    byType[type].push(row);
  }

    // Print by type
  for (const [type, rows] of Object.entries(byType)) {
    console.log(`\n=== ${type} (${rows.length} records) ===`);
    for (const row of rows) {
      console.log(`\n-------------------------------------------`);
      console.log(`id: "${row.id}"`);
      console.log(`type: "${row.type}"`);
      console.log(`article: "${row.article}"`);
      console.log(`section: "${row.section}"`);
      console.log(`sectionIndex: "${row.sectionIndex}"`);
      console.log(`url: "${row.url}"`);
      console.log(`lastEdited: "${row.lastEdited}"`);
      console.log(`text: "${row.text || ""}"`);
    }
  }
}

viewAll().catch(console.error);