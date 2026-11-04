const loginPage = document.getElementById("loginPage");
const adminLayout = document.getElementById("adminLayout");
const loginForm = document.getElementById("loginForm");
const notice = document.getElementById("adminNotice");
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const state = { products: [], orders: [], customers: [], view: "overview" };
let noticeTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  return dateFormat.format(new Date(value));
}

function formatMoney(value) {
  return currency.format(Number(value));
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.classList.add("visible");
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => notice.classList.remove("visible"), 3500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: options.body instanceof FormData
      ? options.headers
      : { "Content-Type": "application/json", ...options.headers }
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function setSignedIn(email) {
  loginPage.hidden = true;
  adminLayout.hidden = false;
  document.getElementById("adminEmail").textContent = email;
}

function renderOverview() {
  document.getElementById("productStat").textContent = String(state.products.length);
  document.getElementById("orderStat").textContent = String(state.orders.length);
  document.getElementById("customerStat").textContent = String(state.customers.length);
  const sales = state.orders.filter((order) => order.status !== "cancelled").reduce((total, order) => total + Number(order.subtotal), 0);
  document.getElementById("salesStat").textContent = formatMoney(sales);
  const pending = state.orders.filter((order) => order.status === "pending").length;
  const pendingBadge = document.getElementById("pendingBadge");
  pendingBadge.hidden = !pending;
  pendingBadge.textContent = String(pending);
  const recentOrders = state.orders.slice(0, 5);
  document.getElementById("recentOrders").innerHTML = recentOrders.length
    ? recentOrders.map((order) => `<tr>
        <td>#${order.id}</td><td>${escapeHtml(order.customer_name)}</td><td>${formatMoney(order.subtotal)}</td>
        <td><span class="status-pill ${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
      </tr>`).join("")
    : '<tr><td class="empty-row" colspan="4">No orders just yet. They’ll show up here.</td></tr>';
}

function renderProducts(filter = "") {
  const query = filter.trim().toLowerCase();
  const visible = state.products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(query));
  document.getElementById("productsCount").textContent = String(state.products.length);
  document.getElementById("productsTable").innerHTML = visible.length
    ? visible.map((product) => `<tr>
        <td><div class="product-cell"><img src="${escapeHtml(product.image_url || "")}" alt=""><span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.badge || "No badge")}</small></span></div></td>
        <td>${escapeHtml(product.category)}</td><td>${formatMoney(product.price)}</td><td>${Number(product.stock)}</td>
        <td><div class="row-actions"><button data-edit-product="${product.id}">Edit</button><button class="delete-action" data-delete-product="${product.id}">Delete</button></div></td>
      </tr>`).join("")
    : '<tr><td class="empty-row" colspan="5">No products match your search.</td></tr>';
}

function renderOrders() {
  document.getElementById("ordersCount").textContent = String(state.orders.length);
  const statuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
  document.getElementById("ordersTable").innerHTML = state.orders.length
    ? state.orders.map((order) => `<tr>
        <td><b>#${order.id}</b><br><small>${formatDate(order.created_at)}</small></td>
        <td>${escapeHtml(order.customer_name)}<br><small>${escapeHtml(order.customer_email)}</small><br><small>${escapeHtml(order.customer_phone)}</small></td>
        <td>${order.items.map((item) => `${escapeHtml(item.product_name)} · ${escapeHtml(item.size)} × ${Number(item.quantity)}`).join("<br>")}</td>
        <td>${formatMoney(order.subtotal)}</td>
        <td><span class="status-pill ${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
        <td><select class="status-select" data-order-status="${order.id}" aria-label="Update status for order ${order.id}">
          ${statuses.map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join("")}
        </select></td>
      </tr>`).join("")
    : '<tr><td class="empty-row" colspan="6">There are no orders yet.</td></tr>';
}

function renderCustomers(filter = "") {
  const query = filter.trim().toLowerCase();
  const visible = state.customers.filter((customer) => `${customer.name} ${customer.email} ${customer.phone}`.toLowerCase().includes(query));
  document.getElementById("customersCount").textContent = String(state.customers.length);
  document.getElementById("customersTable").innerHTML = visible.length
    ? visible.map((customer) => `<tr>
        <td><b>${escapeHtml(customer.name)}</b></td><td>${escapeHtml(customer.email)}</td><td>${escapeHtml(customer.phone || "—")}</td>
        <td>${Number(customer.order_count)}</td><td>${formatMoney(customer.total_spent)}</td><td>${formatDate(customer.created_at)}</td>
      </tr>`).join("")
    : '<tr><td class="empty-row" colspan="6">No customers match your search.</td></tr>';
}

async function refreshData() {
  const [products, orders, customers] = await Promise.all([
    api("/api/admin/products"), api("/api/admin/orders"), api("/api/admin/customers")
  ]);
  state.products = products;
  state.orders = orders;
  state.customers = customers;
  renderOverview();
  renderProducts(document.getElementById("productSearch").value);
  renderOrders();
  renderCustomers(document.getElementById("customerSearch").value);
}

function setView(view) {
  state.view = view;
  const titles = { overview: "Overview", products: "Products", orders: "Orders", customers: "Customers" };
  document.getElementById("viewTitle").textContent = titles[view];
  document.querySelectorAll(".view-panel").forEach((panel) => { panel.hidden = panel.id !== `${view}View`; });
  document.querySelectorAll(".side-link").forEach((button) => button.classList.toggle("selected", button.dataset.view === view));
}

function showProductDialog(product = null) {
  const dialog = document.getElementById("productDialog");
  const form = document.getElementById("productForm");
  form.reset();
  document.getElementById("productMessage").textContent = "";
  document.getElementById("photoList").replaceChildren();
  document.getElementById("productDialogTitle").textContent = product ? "Edit product" : "Add a product";
  form.elements.id.value = product?.id || "";
  if (product) {
    form.elements.name.value = product.name;
    form.elements.category.value = product.category;
    form.elements.price.value = Number(product.price).toFixed(2);
    form.elements.stock.value = product.stock;
    form.elements.badge.value = product.badge || "";
    form.elements.description.value = product.description || "";
    form.elements.image_url.value = product.image_url || "";
    renderPhotos(product);
  }
  dialog.showModal();
}

function renderPhotos(product) {
  const photoList = document.getElementById("photoList");
  photoList.innerHTML = (product.images || []).map((image) => `<div class="photo-thumb">
    <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.original_name)}">
    <button type="button" data-delete-photo="${image.id}" data-product-id="${product.id}" aria-label="Delete ${escapeHtml(image.original_name)}">×</button>
  </div>`).join("");
}

async function checkSession() {
  try {
    const admin = await api("/api/admin/me");
    setSignedIn(admin.email);
    await refreshData();
  } catch (error) {
    if (!error.message.includes("Sign in")) showNotice(error.message, true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("loginMessage");
  const button = loginForm.querySelector("button[type=submit]");
  const form = new FormData(loginForm);
  message.textContent = "";
  button.disabled = true;
  try {
    const admin = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
    loginForm.reset();
    setSignedIn(admin.email);
    await refreshData();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    window.location.reload();
  } catch (error) {
    showNotice(error.message, true);
  }
});

document.querySelectorAll(".side-link").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));
document.getElementById("productSearch").addEventListener("input", (event) => renderProducts(event.target.value));
document.getElementById("customerSearch").addEventListener("input", (event) => renderCustomers(event.target.value));
document.getElementById("addProductButton").addEventListener("click", () => showProductDialog());
document.getElementById("closeProductDialog").addEventListener("click", () => document.getElementById("productDialog").close());
document.getElementById("cancelProduct").addEventListener("click", () => document.getElementById("productDialog").close());

document.getElementById("productsTable").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-product]");
  const remove = event.target.closest("[data-delete-product]");
  if (edit) {
    const product = state.products.find((item) => item.id === Number(edit.dataset.editProduct));
    if (product) showProductDialog(product);
  }
  if (remove) {
    const product = state.products.find((item) => item.id === Number(remove.dataset.deleteProduct));
    if (!product || !window.confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    try {
      await api(`/api/admin/products/${product.id}`, { method: "DELETE" });
      await refreshData();
      showNotice("Product deleted.");
    } catch (error) {
      showNotice(error.message, true);
    }
  }
});

document.getElementById("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById("productMessage");
  const saveButton = document.getElementById("saveProductButton");
  const formData = new FormData(form);
  const productId = formData.get("id");
  const product = {
    name: formData.get("name"),
    category: formData.get("category"),
    price: formData.get("price"),
    stock: formData.get("stock"),
    badge: formData.get("badge"),
    description: formData.get("description"),
    image_url: formData.get("image_url")
  };
  const photos = document.getElementById("photoInput").files;
  message.textContent = "";
  saveButton.disabled = true;
  try {
    const savedProduct = await api(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
      method: productId ? "PUT" : "POST",
      body: JSON.stringify(product)
    });
    if (photos.length) {
      const upload = new FormData();
      for (const photo of photos) upload.append("photos", photo);
      await api(`/api/admin/products/${savedProduct.id}/photos`, { method: "POST", body: upload });
    }
    document.getElementById("productDialog").close();
    await refreshData();
    showNotice("Product saved.");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("photoList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-photo]");
  if (!button) return;
  if (!window.confirm("Delete this product photo?")) return;
  try {
    await api(`/api/admin/products/${button.dataset.productId}/photos/${button.dataset.deletePhoto}`, { method: "DELETE" });
    const product = await api("/api/admin/products");
    state.products = product;
    const updated = state.products.find((item) => item.id === Number(button.dataset.productId));
    if (updated) renderPhotos(updated);
    renderProducts(document.getElementById("productSearch").value);
    showNotice("Photo deleted.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

document.getElementById("ordersTable").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  try {
    await api(`/api/admin/orders/${select.dataset.orderStatus}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: select.value })
    });
    await refreshData();
    showNotice("Order status updated.");
  } catch (error) {
    showNotice(error.message, true);
    await refreshData();
  }
});

checkSession();
