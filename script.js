const sizes = ["XS", "S", "M", "L", "XL"];
const products = [
  { id: 1, name: "Sunday Midi Dress", category: "Dresses", price: 68, description: "An easy, swishy favorite for any kind of day.", badge: "BESTSELLER", rating: "★★★★★", reviews: 48, image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=750&q=80" },
  { id: 2, name: "Daydream Shirt Dress", category: "Dresses", price: 74, description: "Throw on, head out, feel like yourself.", badge: "JUST ARRIVED", rating: "★★★★★", reviews: 32, image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=750&q=80" },
  { id: 3, name: "Everyday Ribbed Tee", category: "Tops", price: 32, description: "The one you'll reach for again tomorrow.", badge: "A LITTLE FAVORITE", rating: "★★★★★", reviews: 27, image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=750&q=80" },
  { id: 4, name: "Soft Days Blouse", category: "Tops", price: 48, description: "A little something special, with jeans or anything.", badge: "", rating: "★★★★★", reviews: 19, image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=750&q=80" },
  { id: 5, name: "Easy Wide-Leg Trousers", category: "Bottoms", price: 62, description: "Room to move, comfy all day long.", badge: "BESTSELLER", rating: "★★★★★", reviews: 24, image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=750&q=80" },
  { id: 6, name: "Weekend Denim", category: "Bottoms", price: 72, description: "Your favorite jeans, already broken in.", badge: "", rating: "★★★★★", reviews: 14, image: "https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=750&q=80" },
  { id: 7, name: "The Cozy Cardigan", category: "Layers", price: 78, description: "A soft extra layer for the just-in-case moments.", badge: "A LITTLE FAVORITE", rating: "★★★★★", reviews: 21, image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=750&q=80" },
  { id: 8, name: "Out-the-Door Jacket", category: "Layers", price: 92, description: "Lightweight, throw-on, and goes with everything.", badge: "", rating: "★★★★★", reviews: 18, image: "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=750&q=80" }
];

const money = (amount) => `$${amount.toFixed(2)}`;
let selectedCategory = "All";
let searchTerm = "";
let sortMode = "featured";
let cart = loadCart();
let favorites = new Set();
let toastTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("morrow-womenswear-cart") || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => Number.isInteger(item.id) && products.some((product) => product.id === item.id) && sizes.includes(item.size) && Number.isInteger(item.quantity) && item.quantity > 0);
  } catch (error) {
    console.warn("Could not read the saved shopping bag.", error);
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem("morrow-womenswear-cart", JSON.stringify(cart));
  } catch (error) {
    console.warn("Could not save the shopping bag.", error);
    showToast("Your bag is available for this visit, but couldn't be saved.");
  }
}

function renderProducts() {
  const grid = document.getElementById("products");
  let visible = products.filter((product) => {
    const categoryMatches = selectedCategory === "All" || product.category === selectedCategory;
    const query = searchTerm.toLowerCase();
    return categoryMatches && (!query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query));
  });
  if (sortMode === "price-low") visible = visible.sort((a, b) => a.price - b.price);
  if (sortMode === "price-high") visible = visible.sort((a, b) => b.price - a.price);
  if (sortMode === "name") visible = visible.sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = visible.map((product) => `
    <article class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${escapeHtml(product.image_url || product.image || "")}" alt="${escapeHtml(product.name)}" loading="lazy">
        ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}
        <button class="favorite-button${favorites.has(product.id) ? " favorited" : ""}" data-favorite="${Number(product.id)}" aria-label="${favorites.has(product.id) ? "Remove" : "Add"} ${escapeHtml(product.name)} ${favorites.has(product.id) ? "from" : "to"} favorites" aria-pressed="${favorites.has(product.id)}">${favorites.has(product.id) ? "♥" : "♡"}</button>
        <button class="quick-add" data-add="${Number(product.id)}">Add to bag — ${money(Number(product.price))} <span>＋</span></button>
      </div>
      <div class="product-info">
        <div class="product-meta"><span class="product-name">${escapeHtml(product.name)}</span><span class="product-price">${money(Number(product.price))}</span></div>
        <p class="product-description">${escapeHtml(product.description)}</p>
        <label class="size-picker">Size
          <select data-size-for="${Number(product.id)}" aria-label="Choose a size for ${escapeHtml(product.name)}">
            <option value="">Choose size</option>
            ${sizes.map((size) => `<option value="${size}">${size}</option>`).join("")}
          </select>
        </label>
        ${product.rating ? `<div class="product-rating">${escapeHtml(product.rating)}<span>(${Number(product.reviews) || 0})</span></div>` : ""}
      </div>
    </article>
  `).join("");
  document.getElementById("emptyState").hidden = visible.length > 0;
  document.getElementById("productCount").textContent = String(visible.length);
  document.querySelectorAll(".category-chip").forEach((button) => {
    const active = button.dataset.category === selectedCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderCart() {
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + (Number(products.find((product) => product.id === item.id)?.price) || 0) * item.quantity, 0);
  document.getElementById("cartCount").textContent = String(itemCount);
  document.getElementById("drawerItemCount").textContent = `(${itemCount})`;
  document.getElementById("cartSubtotal").textContent = money(subtotal);
  document.getElementById("cartItems").innerHTML = cart.map((item) => {
    const product = products.find((entry) => entry.id === item.id);
    if (!product) return "";
    return `<article class="cart-item">
      <img src="${escapeHtml(product.image_url || product.image || "")}" alt="">
      <div class="cart-item-details"><span class="cart-item-name">${escapeHtml(product.name)}</span><span class="cart-item-category">${escapeHtml(product.category)} · Size ${escapeHtml(item.size)}</span>
        <div class="quantity-control"><button data-quantity="${product.id}" data-cart-size="${escapeHtml(item.size)}" data-change="-1" aria-label="Decrease ${escapeHtml(product.name)} quantity">−</button><span>${item.quantity}</span><button data-quantity="${product.id}" data-cart-size="${escapeHtml(item.size)}" data-change="1" aria-label="Increase ${escapeHtml(product.name)} quantity">+</button></div>
      </div>
      <div class="cart-item-side"><span>${money(Number(product.price) * item.quantity)}</span><button class="remove-item" data-remove="${product.id}" data-cart-size="${escapeHtml(item.size)}">Remove</button></div>
    </article>`;
  }).join("");
  const empty = itemCount === 0;
  document.getElementById("cartEmpty").classList.toggle("visible", empty);
  document.getElementById("cartFooter").classList.toggle("hidden", empty);
  const remaining = Math.max(0, 75 - subtotal);
  document.getElementById("shippingRemaining").textContent = remaining ? money(remaining) : "all set!";
  document.getElementById("shippingProgressBar").style.width = `${Math.min(100, subtotal / 75 * 100)}%`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2300);
}

function openCart() {
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("drawerBackdrop").classList.add("open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  document.getElementById("cartClose").focus();
}

function closeCart() {
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("drawerBackdrop").classList.remove("open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  document.getElementById("cartToggle").focus();
}

function addToCart(id, size) {
  const product = products.find((item) => item.id === id);
  const quantityInCart = cart.filter((item) => item.id === id).reduce((total, item) => total + item.quantity, 0);
  if (!product || quantityInCart >= Number(product.stock)) {
    showToast("Sorry, this item is out of stock.");
    return;
  }
  const existing = cart.find((item) => item.id === id && item.size === size);
  if (existing) existing.quantity += 1;
  else cart.push({ id, size, quantity: 1 });
  saveCart();
  renderCart();
  showToast(`${product.name} · size ${size} is in your bag ♡`);
}

async function loadStoreProducts() {
  try {
    const response = await fetch("/api/products", { headers: { Accept: "application/json" } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `The store returned ${response.status}.`);
    if (!Array.isArray(result)) throw new Error("The store returned an invalid product list.");
    products.splice(0, products.length, ...result.map((product) => ({ ...product, id: Number(product.id), price: Number(product.price), stock: Number(product.stock) })));
    cart = cart.filter((item) => products.some((product) => product.id === item.id));
    saveCart();
    renderProducts();
    renderCart();
  } catch (error) {
    console.error("Could not load live products.", error);
    showToast("Live stock couldn't be loaded. Start the store server and try again.");
  }
}

document.getElementById("categoryList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectedCategory = button.dataset.category;
  renderProducts();
});

document.querySelectorAll("[data-nav-category]").forEach((link) => {
  link.addEventListener("click", () => {
    selectedCategory = link.dataset.navCategory;
    renderProducts();
    document.getElementById("mainNav").classList.remove("open");
    document.getElementById("menuToggle").setAttribute("aria-expanded", "false");
  });
});

document.getElementById("products").addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const favoriteButton = event.target.closest("[data-favorite]");
  if (addButton) {
    const id = Number(addButton.dataset.add);
    const size = document.querySelector(`[data-size-for="${id}"]`).value;
    if (!size) {
      showToast("Choose a size first ♡");
      document.querySelector(`[data-size-for="${id}"]`).focus();
    } else {
      addToCart(id, size);
    }
  }
  if (favoriteButton) {
    const id = Number(favoriteButton.dataset.favorite);
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    renderProducts();
  }
});

document.getElementById("cartItems").addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-quantity]");
  const removeButton = event.target.closest("[data-remove]");
  if (quantityButton) {
    const id = Number(quantityButton.dataset.quantity);
    const size = quantityButton.dataset.cartSize;
    const item = cart.find((entry) => entry.id === id && entry.size === size);
    item.quantity += Number(quantityButton.dataset.change);
    if (item.quantity <= 0) cart = cart.filter((entry) => !(entry.id === id && entry.size === size));
    saveCart();
    renderCart();
  }
  if (removeButton) {
    const size = removeButton.dataset.cartSize;
    cart = cart.filter((entry) => !(entry.id === Number(removeButton.dataset.remove) && entry.size === size));
    saveCart();
    renderCart();
  }
});

document.getElementById("sortSelect").addEventListener("change", (event) => {
  sortMode = event.target.value;
  renderProducts();
});

document.getElementById("searchToggle").addEventListener("click", () => {
  const bar = document.getElementById("searchBar");
  bar.classList.toggle("open");
  if (bar.classList.contains("open")) document.getElementById("searchInput").focus();
  else {
    searchTerm = "";
    document.getElementById("searchInput").value = "";
    renderProducts();
  }
});

document.getElementById("searchClose").addEventListener("click", () => {
  document.getElementById("searchBar").classList.remove("open");
  searchTerm = "";
  document.getElementById("searchInput").value = "";
  renderProducts();
  document.getElementById("searchToggle").focus();
});

document.getElementById("searchInput").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim();
  renderProducts();
});

document.getElementById("cartToggle").addEventListener("click", openCart);
document.getElementById("cartClose").addEventListener("click", closeCart);
document.getElementById("drawerBackdrop").addEventListener("click", closeCart);
document.getElementById("continueShopping").addEventListener("click", closeCart);
document.getElementById("continueShoppingFooter").addEventListener("click", closeCart);
document.getElementById("checkoutButton").addEventListener("click", () => {
  if (!cart.length) return;
  document.getElementById("checkoutError").textContent = "";
  document.getElementById("checkoutDialog").showModal();
  document.getElementById("checkoutName").focus();
});
document.getElementById("checkoutClose").addEventListener("click", () => document.getElementById("checkoutDialog").close());

document.getElementById("checkoutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  const errorMessage = document.getElementById("checkoutError");
  errorMessage.textContent = "";
  submitButton.disabled = true;
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
        items: cart.map(({ id, size, quantity }) => ({ id, size, quantity }))
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "We couldn't place that order. Please try again.");
    cart = [];
    saveCart();
    renderCart();
    form.reset();
    document.getElementById("checkoutDialog").close();
    closeCart();
    await loadStoreProducts();
    showToast(`Order #${result.id} placed — thank you for shopping with us ♡`);
  } catch (error) {
    errorMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById("menuToggle").addEventListener("click", (event) => {
  const nav = document.getElementById("mainNav");
  const open = nav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});

document.getElementById("newsletterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const email = document.getElementById("emailInput");
  if (!email.checkValidity()) {
    email.reportValidity();
    return;
  }
  document.getElementById("newsletterMessage").textContent = "You're on the list. Keep an eye on your inbox ♡";
  email.value = "";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (document.getElementById("cartDrawer").classList.contains("open")) closeCart();
    if (document.getElementById("searchBar").classList.contains("open")) document.getElementById("searchClose").click();
    document.getElementById("mainNav").classList.remove("open");
    document.getElementById("menuToggle").setAttribute("aria-expanded", "false");
  }
});

renderProducts();
renderCart();
loadStoreProducts();
