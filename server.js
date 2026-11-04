require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { pool, initializeDatabase } = require("./database");

const app = express();
const port = Number(process.env.PORT || 3000);
const uploadDirectory = path.resolve(__dirname, process.env.UPLOAD_DIR || "uploads");
const sessionDurationMs = 8 * 60 * 60 * 1000;
const allowedStatuses = new Set(["pending", "processing", "shipped", "delivered", "cancelled"]);
const allowedSizes = new Set(["XS", "S", "M", "L", "XL"]);
const allowedImages = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://images.unsplash.com", "data:", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "100kb" }));

function publicError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function positiveId(value, label = "ID") {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw publicError(`${label} is invalid.`);
  return id;
}

function text(value, label, maxLength, { required = false } = {}) {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw publicError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (required && !normalized) throw publicError(`${label} is required.`);
  if (normalized.length > maxLength) throw publicError(`${label} must be ${maxLength} characters or fewer.`);
  return normalized;
}

function parseProduct(body = {}) {
  const name = text(body.name, "Product name", 160, { required: true });
  const category = text(body.category, "Category", 80, { required: true });
  const description = text(body.description ?? "", "Description", 1000);
  const badge = text(body.badge ?? "", "Badge", 80);
  const price = Number(body.price);
  const stock = Number(body.stock);
  if (!Number.isFinite(price) || price < 0 || price > 99999999) throw publicError("Enter a valid product price.");
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) throw publicError("Enter a valid stock quantity.");
  const imageUrl = text(body.image_url ?? "", "Image URL", 1000);
  if (imageUrl && !imageUrl.startsWith("/uploads/") && !imageUrl.startsWith("https://")) {
    throw publicError("Product images must use HTTPS or an uploaded photo.");
  }
  return { name, category, description, price, stock, badge, imageUrl };
}

function cookieToken(request) {
  const cookies = request.headers.cookie || "";
  const pair = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith("morrow_admin="));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice("morrow_admin=".length));
  } catch {
    return null;
  }
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sameOrigin(request, response, next) {
  const origin = request.get("origin");
  if (!origin) return next(publicError("A same-origin request is required.", 403));
  try {
    if (new URL(origin).host !== request.get("host")) return next(publicError("A same-origin request is required.", 403));
  } catch {
    return next(publicError("The request origin is invalid.", 403));
  }
  return next();
}

async function requireAdmin(request, response, next) {
  try {
    const token = cookieToken(request);
    if (!token || token.length > 100) throw publicError("Sign in to continue.", 401);
    const [sessions] = await pool.execute(
      `SELECT admins.id, admins.email
       FROM admin_sessions
       INNER JOIN admins ON admins.id = admin_sessions.admin_id
       WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > NOW()`,
      [tokenHash(token)]
    );
    if (!sessions.length) throw publicError("Sign in to continue.", 401);
    request.admin = sessions[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

function imageSignatureIsValid(buffer, mimeType) {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/gif") return buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/) !== null;
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, uploadDirectory),
    filename: (_request, file, callback) => callback(null, `${crypto.randomBytes(20).toString("hex")}${allowedImages.get(file.mimetype) || ".bin"}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_request, file, callback) => {
    if (!allowedImages.has(file.mimetype)) return callback(publicError("Use a JPEG, PNG, WebP, or GIF image."));
    return callback(null, true);
  }
});

async function removeUploadedFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function getProduct(productId) {
  const [rows] = await pool.execute(
    "SELECT id, name, category, description, price, stock, image_url, badge FROM products WHERE id = ?",
    [productId]
  );
  return rows[0] || null;
}

app.get("/", (_request, response) => response.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html", (_request, response) => response.sendFile(path.join(__dirname, "index.html")));
app.get("/admin.html", (_request, response) => response.sendFile(path.join(__dirname, "admin.html")));
for (const asset of ["styles.css", "script.js", "admin.css", "admin.js"]) {
  app.get(`/${asset}`, (_request, response) => response.sendFile(path.join(__dirname, asset)));
}
app.use("/uploads", express.static(uploadDirectory, { dotfiles: "deny", index: false, maxAge: "1d" }));

app.get("/api/products", async (_request, response) => {
  const [products] = await pool.execute(
    "SELECT id, name, category, description, price, stock, image_url, badge FROM products WHERE stock > 0 ORDER BY id"
  );
  response.json(products);
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many checkout attempts. Please wait a little and try again." }
});

app.post("/api/orders", orderLimiter, async (request, response) => {
  const body = request.body || {};
  const customerName = text(body.name, "Name", 160, { required: true });
  const email = text(body.email, "Email", 254, { required: true }).toLowerCase();
  const phone = text(body.phone ?? "", "Phone", 40);
  const address = text(body.address, "Shipping address", 1000, { required: true });
  const items = body.items;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw publicError("Enter a valid email address.");
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) throw publicError("Your order must contain between 1 and 30 items.");

  const quantities = new Map();
  for (const item of items) {
    const productId = positiveId(item.id, "Product");
    const size = text(item.size, "Size", 2, { required: true });
    const quantity = Number(item.quantity);
    if (!allowedSizes.has(size)) throw publicError("Choose a valid clothing size.");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) throw publicError("Each item quantity must be between 1 and 10.");
    const key = `${productId}:${size}`;
    quantities.set(key, (quantities.get(key) || 0) + quantity);
  }

  const connection = await pool.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();
    const productIds = [...new Set([...quantities.keys()].map((key) => Number(key.split(":")[0])))];
    const [productRows] = await connection.query(
      "SELECT id, name, price, stock FROM products WHERE id IN (?) FOR UPDATE",
      [productIds]
    );
    const productsById = new Map(productRows.map((product) => [Number(product.id), product]));
    const orderLines = [];
    let subtotal = 0;
    for (const [key, quantity] of quantities) {
      const [idText, size] = key.split(":");
      const product = productsById.get(Number(idText));
      if (!product) throw publicError("One of the selected products is no longer available.", 409);
      if (Number(product.stock) < quantity) throw publicError(`${product.name} does not have enough stock.`, 409);
      const unitPrice = Number(product.price);
      subtotal += unitPrice * quantity;
      orderLines.push({ product, size, quantity, unitPrice });
    }
    const [customerResult] = await connection.execute(
      `INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), id = LAST_INSERT_ID(id)`,
      [customerName, email, phone]
    );
    const customerId = customerResult.insertId;
    const [orderResult] = await connection.execute(
      "INSERT INTO orders (customer_id, status, subtotal, shipping_address) VALUES (?, 'pending', ?, ?)",
      [customerId, subtotal.toFixed(2), address]
    );
    for (const line of orderLines) {
      await connection.execute(
        "INSERT INTO order_items (order_id, product_id, product_name, size, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?)",
        [orderResult.insertId, line.product.id, line.product.name, line.size, line.unitPrice.toFixed(2), line.quantity]
      );
      await connection.execute("UPDATE products SET stock = stock - ? WHERE id = ?", [line.quantity, line.product.id]);
    }
    await connection.commit();
    committed = true;
    response.status(201).json({ id: orderResult.insertId, status: "pending", subtotal: Number(subtotal.toFixed(2)) });
  } finally {
    if (!committed) await connection.rollback();
    connection.release();
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." }
});

app.post("/api/admin/login", sameOrigin, loginLimiter, async (request, response) => {
  const body = request.body || {};
  const email = text(body.email, "Email", 254, { required: true }).toLowerCase();
  const password = body.password;
  if (typeof password !== "string" || !password.length || password.length > 200) throw publicError("Email or password is incorrect.", 401);
  const [admins] = await pool.execute("SELECT id, email, password_hash FROM admins WHERE email = ?", [email]);
  const valid = admins.length && await require("bcryptjs").compare(password, admins[0].password_hash);
  if (!valid) throw publicError("Email or password is incorrect.", 401);

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await pool.execute("DELETE FROM admin_sessions WHERE expires_at < NOW()");
  await pool.execute("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)", [
    tokenHash(token), admins[0].id, expiresAt
  ]);
  response.cookie("morrow_admin", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: expiresAt,
    path: "/"
  });
  response.json({ email: admins[0].email });
});

app.get("/api/admin/me", requireAdmin, (request, response) => response.json({ email: request.admin.email }));

app.post("/api/admin/logout", sameOrigin, requireAdmin, async (request, response) => {
  const token = cookieToken(request);
  await pool.execute("DELETE FROM admin_sessions WHERE token_hash = ?", [tokenHash(token)]);
  response.clearCookie("morrow_admin", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
  response.status(204).end();
});

app.get("/api/admin/summary", requireAdmin, async (_request, response) => {
  const [[products]] = await pool.query("SELECT COUNT(*) AS count FROM products");
  const [[orders]] = await pool.query("SELECT COUNT(*) AS count FROM orders");
  const [[customers]] = await pool.query("SELECT COUNT(*) AS count FROM customers");
  const [[sales]] = await pool.query("SELECT COALESCE(SUM(subtotal), 0) AS total FROM orders WHERE status <> 'cancelled'");
  response.json({ products: products.count, orders: orders.count, customers: customers.count, sales: Number(sales.total) });
});

app.get("/api/admin/products", requireAdmin, async (_request, response) => {
  const [products] = await pool.execute("SELECT id, name, category, description, price, stock, image_url, badge, created_at FROM products ORDER BY created_at DESC");
  const [images] = await pool.execute("SELECT id, product_id, image_url, original_name FROM product_images ORDER BY id");
  const imagesByProduct = new Map();
  for (const image of images) {
    const key = Number(image.product_id);
    if (!imagesByProduct.has(key)) imagesByProduct.set(key, []);
    imagesByProduct.get(key).push(image);
  }
  response.json(products.map((product) => ({ ...product, images: imagesByProduct.get(Number(product.id)) || [] })));
});

app.post("/api/admin/products", sameOrigin, requireAdmin, async (request, response) => {
  const product = parseProduct(request.body);
  const [result] = await pool.execute(
    "INSERT INTO products (name, category, description, price, stock, image_url, badge) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [product.name, product.category, product.description, product.price, product.stock, product.imageUrl, product.badge]
  );
  response.status(201).json(await getProduct(result.insertId));
});

app.put("/api/admin/products/:id", sameOrigin, requireAdmin, async (request, response) => {
  const id = positiveId(request.params.id, "Product");
  const product = parseProduct(request.body);
  const [result] = await pool.execute(
    "UPDATE products SET name = ?, category = ?, description = ?, price = ?, stock = ?, image_url = ?, badge = ? WHERE id = ?",
    [product.name, product.category, product.description, product.price, product.stock, product.imageUrl, product.badge, id]
  );
  if (!result.affectedRows) throw publicError("Product not found.", 404);
  response.json(await getProduct(id));
});

app.delete("/api/admin/products/:id", sameOrigin, requireAdmin, async (request, response) => {
  const id = positiveId(request.params.id, "Product");
  const [images] = await pool.execute("SELECT image_url FROM product_images WHERE product_id = ?", [id]);
  const [result] = await pool.execute("DELETE FROM products WHERE id = ?", [id]);
  if (!result.affectedRows) throw publicError("Product not found.", 404);
  for (const image of images) {
    if (image.image_url.startsWith("/uploads/")) await removeUploadedFile(path.join(uploadDirectory, path.basename(image.image_url)));
  }
  response.status(204).end();
});

app.post("/api/admin/products/:id/photos", sameOrigin, requireAdmin, async (request, response, next) => {
  const id = positiveId(request.params.id, "Product");
  const product = await getProduct(id);
  if (!product) return next(publicError("Product not found.", 404));
  return imageUpload.array("photos", 8)(request, response, async (uploadError) => {
    if (uploadError) return next(uploadError);
    const files = request.files || [];
    try {
      for (const file of files) {
        const handle = await fs.open(file.path, "r");
        const header = Buffer.alloc(12);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        await handle.close();
        if (!imageSignatureIsValid(header.subarray(0, bytesRead), file.mimetype)) {
          throw publicError("An uploaded file is not a valid image.");
        }
      }
      const created = [];
      const connection = await pool.getConnection();
      let committed = false;
      try {
        await connection.beginTransaction();
        for (const file of files) {
          const imageUrl = `/uploads/${path.basename(file.filename)}`;
          const [result] = await connection.execute(
            "INSERT INTO product_images (product_id, image_url, original_name) VALUES (?, ?, ?)",
            [id, imageUrl, path.basename(file.originalname).slice(0, 255)]
          );
          created.push({ id: result.insertId, image_url: imageUrl, original_name: path.basename(file.originalname) });
        }
        if (created.length) {
          await connection.execute("UPDATE products SET image_url = ? WHERE id = ?", [created[0].image_url, id]);
        }
        await connection.commit();
        committed = true;
      } finally {
        if (!committed) await connection.rollback();
        connection.release();
      }
      return response.status(201).json(created);
    } catch (error) {
      await Promise.all(files.map((file) => removeUploadedFile(file.path)));
      return next(error);
    }
  });
});

app.delete("/api/admin/products/:productId/photos/:photoId", sameOrigin, requireAdmin, async (request, response) => {
  const productId = positiveId(request.params.productId, "Product");
  const photoId = positiveId(request.params.photoId, "Photo");
  const [images] = await pool.execute("SELECT id, image_url FROM product_images WHERE id = ? AND product_id = ?", [photoId, productId]);
  if (!images.length) throw publicError("Photo not found.", 404);
  await pool.execute("DELETE FROM product_images WHERE id = ?", [photoId]);
  if (images[0].image_url.startsWith("/uploads/")) {
    await removeUploadedFile(path.join(uploadDirectory, path.basename(images[0].image_url)));
  }
  const product = await getProduct(productId);
  if (product.image_url === images[0].image_url) {
    const [nextPhotos] = await pool.execute("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id LIMIT 1", [productId]);
    await pool.execute("UPDATE products SET image_url = ? WHERE id = ?", [nextPhotos[0]?.image_url || "", productId]);
  }
  response.status(204).end();
});

app.get("/api/admin/customers", requireAdmin, async (_request, response) => {
  const [customers] = await pool.execute(
    `SELECT customers.id, customers.name, customers.email, customers.phone, customers.created_at,
            COUNT(orders.id) AS order_count, COALESCE(SUM(orders.subtotal), 0) AS total_spent
     FROM customers
     LEFT JOIN orders ON orders.customer_id = customers.id AND orders.status <> 'cancelled'
     GROUP BY customers.id
     ORDER BY customers.created_at DESC`
  );
  response.json(customers);
});

app.get("/api/admin/orders", requireAdmin, async (_request, response) => {
  const [orders] = await pool.execute(
    `SELECT orders.id, orders.customer_id, orders.status, orders.subtotal, orders.shipping_address, orders.created_at,
            customers.name AS customer_name, customers.email AS customer_email, customers.phone AS customer_phone
     FROM orders INNER JOIN customers ON customers.id = orders.customer_id
     ORDER BY orders.created_at DESC`
  );
  const [items] = await pool.execute(
    "SELECT order_id, product_id, product_name, size, unit_price, quantity FROM order_items ORDER BY order_id DESC, id"
  );
  const itemsByOrder = new Map();
  for (const item of items) {
    const key = Number(item.order_id);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push(item);
  }
  response.json(orders.map((order) => ({ ...order, items: itemsByOrder.get(Number(order.id)) || [] })));
});

app.patch("/api/admin/orders/:id/status", sameOrigin, requireAdmin, async (request, response) => {
  const id = positiveId(request.params.id, "Order");
  const status = text(request.body.status, "Order status", 20, { required: true });
  if (!allowedStatuses.has(status)) throw publicError("Choose a valid order status.");
  const connection = await pool.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute("SELECT id, status FROM orders WHERE id = ? FOR UPDATE", [id]);
    if (!orders.length) throw publicError("Order not found.", 404);
    const oldStatus = orders[0].status;
    if (oldStatus === "cancelled" && status !== "cancelled") {
      const [items] = await connection.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", [id]);
      for (const item of items) {
        const [products] = await connection.execute("SELECT stock FROM products WHERE id = ? FOR UPDATE", [item.product_id]);
        if (!products.length || Number(products[0].stock) < Number(item.quantity)) {
          throw publicError("There is not enough stock to reopen this cancelled order.", 409);
        }
        await connection.execute("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.product_id]);
      }
    } else if (oldStatus !== "cancelled" && status === "cancelled") {
      const [items] = await connection.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", [id]);
      for (const item of items) {
        await connection.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id]);
      }
    }
    await connection.execute("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
    await connection.commit();
    committed = true;
    response.json({ id, status });
  } finally {
    if (!committed) await connection.rollback();
    connection.release();
  }
});

app.use((error, _request, response, _next) => {
  if (response.headersSent) return;
  const status = Number.isInteger(error.status) ? error.status : error instanceof multer.MulterError ? 400 : 500;
  if (status >= 500) console.error("Request failed:", error);
  const message = status >= 500 ? "The request could not be completed. Check the server logs." : error.message;
  response.status(status).json({ error: message });
});

async function start() {
  await fs.mkdir(uploadDirectory, { recursive: true });
  await initializeDatabase();
  const server = app.listen(port, () => console.log(`Morrow storefront ready at http://localhost:${port}`));
  const shutdown = () => server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(async (error) => {
  console.error("Could not start Morrow. Check MySQL is running and verify DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD in .env.", error);
  await pool.end();
  process.exitCode = 1;
});
