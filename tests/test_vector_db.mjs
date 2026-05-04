import {
  searchVectorDB,
  formatCachedSearchResults,
  getTable,
  getEmbeddings,
} from "../system/agents/MainAgent/tools/vector/vectorHelpers.mjs";

console.log("Starting test...");

async function test() {
  try {
    console.log("Initializing table...");
    const tbl = await getTable();
    console.log("Table: OK");

    console.log("Testing embeddings...");
    const embeddings = getEmbeddings();
    console.log("Embeddings instance: OK");

    console.log("Embedding test query (with 3s timeout)...");

    // Create a promise that rejects after timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Embedding timeout after 3s")), 3000)
    );

    // Race embedding vs timeout
    const embedding = await Promise.race([
      embeddings.embedQuery("test"),
      timeout
    ]);

    console.log("Embedding done, length:", embedding.length);

    console.log("Searching Wikipedia cache...");
    const searchResults = await searchVectorDB("Python", 3, "wikipediaSearch");
    console.log("Search done, count:", searchResults.length);

    if (searchResults.length > 0) {
      console.log("First result:", JSON.stringify(searchResults[0]).slice(0, 200));
    } else {
      console.log("No results found.");
    }

    console.log("=== Complete ===");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test().then(() => console.log("Done")).catch(e => console.error("Fatal:", e));