const DATA = [
  { id: "saguaro-hoodie", score: 0.92, label: "Saguaro Hoodie" },
  { id: "desert-mug", score: 0.81, label: "Desert Mug" },
  { id: "memory-notebook", score: 0.77, label: "Memory Notebook" },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").toLowerCase();
  const results = DATA.filter((item) => item.label.toLowerCase().includes(query));

  return Response.json({
    query,
    count: results.length,
    results,
  });
}
