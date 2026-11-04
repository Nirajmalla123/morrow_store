const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "morrow_store",
  user: process.env.DB_USER || "morrow_app",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  charset: "utf8mb4"
});

const seedProducts = [
  ["Sunday Midi Dress", "Dresses", "An easy, swishy favorite for any kind of day.", 68, 20, "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=750&q=80", "BESTSELLER"],
  ["Daydream Shirt Dress", "Dresses", "Throw on, head out, feel like yourself.", 74, 20, "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=750&q=80", "JUST ARRIVED"],
  ["Everyday Ribbed Tee", "Tops", "The one you'll reach for again tomorrow.", 32, 30, "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=750&q=80", "A LITTLE FAVORITE"],
  ["Soft Days Blouse", "Tops", "A little something special, with jeans or anything.", 48, 20, "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=750&q=80", ""],
  ["Easy Wide-Leg Trousers", "Bottoms", "Room to move, comfy all day long.", 62, 18, "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=750&q=80", "BESTSELLER"],
  ["Weekend Denim", "Bottoms", "Your favorite jeans, already broken in.", 72, 18, "https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=750&q=80", ""],
  ["The Cozy Cardigan", "Layers", "A soft extra layer for the just-in-case moments.", 78, 16, "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=750&q=80", "A LITTLE FAVORITE"],
  ["Out-the-Door Jacket", "Layers", "Lightweight, throw-on, and goes with everything.", 92, 12, "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=750&q=80", ""]
];

async function initializeDatabase() {
  const schema = await fs.readFile(path.join(__dirname, "schema.sql"), "utf8");
  const statements = schema
    .replace(/^\s*CREATE DATABASE[\s\S]*?;\s*USE\s+[\w`]+\s*;\s*/i, "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }

  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM products");
  if (Number(count) === 0) {
    await pool.query(
      "INSERT INTO products (name, category, description, price, stock, image_url, badge) VALUES ?",
      [seedProducts]
    );
  }
}

module.exports = { pool, initializeDatabase };
