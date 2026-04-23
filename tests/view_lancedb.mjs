import { getTable } from "../system/agents/SearchAgent/tools/vector/vectorHelpers.mjs";

console.log("Viewing LanceDB contents...\n");

async function viewAll() {
  const tbl = await getTable();

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
      console.log(`url: "${row.url}"`);
      console.log(`lastEdited: "${row.lastEdited}"`);
      console.log(`text: "${row.text || ""}"`);
    }
  }
}

viewAll().catch(console.error);