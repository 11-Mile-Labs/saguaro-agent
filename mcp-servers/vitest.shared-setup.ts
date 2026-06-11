// Shared vitest setup for every mcp-servers package.
//
// Unit tests must never inherit a real vector store from the developer's
// shell (VECTOR_STORE_BASE_URL et al. typically point at a production
// ChromaDB instance). Strip that configuration before any test code runs so
// the filesystem backend is the only reachable default. Integration tests
// that genuinely need a live ChromaDB opt in through the dedicated
// SAGUARO_TEST_VECTOR_STORE_BASE_URL variable, which is left untouched.
const PRODUCTION_STORAGE_ENV = [
  "SAGUARO_STORAGE_BACKEND",
  "VECTOR_STORE_BASE_URL",
  "SAGUARO_VECTOR_STORE_BASE_URL",
  "VECTOR_STORE_API_KEY",
  "SAGUARO_VECTOR_STORE_API_KEY",
];

for (const key of PRODUCTION_STORAGE_ENV) {
  delete process.env[key];
}
