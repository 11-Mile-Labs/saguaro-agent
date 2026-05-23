const products = [
  { id: "saguaro-hoodie", name: "Saguaro Hoodie", category: "Apparel" },
  { id: "desert-mug", name: "Desert Mug", category: "Home" },
  { id: "memory-notebook", name: "Memory Notebook", category: "Stationery" },
];

export default function Page() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 32 }}>
      <h1>Saguaro Shop Search</h1>
      <p>Use this page as a realistic engineering-workflow target.</p>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            {product.name} - {product.category}
          </li>
        ))}
      </ul>
    </main>
  );
}
