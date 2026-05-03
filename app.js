const API_URL = window.GYM_API_URL || "";
const currency = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN"
});

const state = {
  token: localStorage.getItem("gym_token"),
  clients: [],
  products: [],
  salesById: {},
  newProductImage: null,
  currentView: "dashboard"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const productImages = {
  agua: "assets/products/agua.svg",
  volt: "assets/products/volt.svg",
  "pre entreno": "assets/products/pre-entreno.svg",
  "pre entreno pro": "assets/products/pre-entreno-pro.svg",
  creatina: "assets/products/creatina.svg",
  proteina: "assets/products/proteina.svg",
  sporade: "assets/products/sporade.svg",
  "barra proteica chocolate": "assets/products/barra-proteica-chocolate.svg",
  "barra de proteica chocolate": "assets/products/barra-proteica-chocolate.svg"
};

function normalizeProductName(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function productImageFor(product) {
  if (product.imagen_url) return product.imagen_url;
  const name = normalizeProductName(product.nombre);
  return productImages[name] || "assets/products/producto.svg";
}

function isLargeSale(product) {
  const name = normalizeProductName(product.nombre);
  return Number(product.precio) >= 50 || name.includes("proteina") || name.includes("creatina");
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function today() {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function setMessage(message, ok = true) {
  const box = $("#statusMessage");
  box.textContent = message || "";
  box.classList.toggle("ok", ok);

  if (message) {
    window.clearTimeout(setMessage.timer);
    setMessage.timer = window.setTimeout(() => {
      box.textContent = "";
    }, 2800);
  }
}

async function api(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error("No se pudo conectar con el servidor.");
  }

  if (response.status === 401) {
    logout();
    throw new Error("Sesion vencida.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo completar la accion.");
  }

  if (response.status === 204) return null;
  return response.json();
}

function showApp() {
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  showView(state.currentView);
}

function showLogin() {
  $("#loginScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
}

function logout() {
  state.token = null;
  localStorage.removeItem("gym_token");
  showLogin();
}

function showView(view) {
  state.currentView = view;
  const labels = {
    dashboard: "Dashboard",
    clientes: "Clientes",
    membresias: "Membresias",
    ventas: "Ventas rapidas",
    historial: "Historial"
  };

  $$(".view").forEach((section) => section.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  $("#viewTitle").textContent = labels[view];

  if (view === "dashboard") loadDashboard();
  if (view === "clientes") loadClients();
  if (view === "membresias") loadMembershipView();
  if (view === "ventas") loadSalesView();
  if (view === "historial") loadHistory();
}

function renderEmpty(target, text) {
  target.innerHTML = `<div class="list-empty">${text}</div>`;
}

function formatDate(value) {
  if (!value) return "";
  return value.slice(0, 10).split("-").reverse().join("/");
}

async function loadDashboard() {
  try {
    const data = await api("/dashboard");
    $("#incomeDay").textContent = currency.format(data.ingresos_dia || 0);
    $("#incomeMonth").textContent = currency.format(data.ingresos_mes || 0);
    $("#activeClients").textContent = data.clientes_activos || 0;
    $("#expiringCount").textContent = data.membresias_por_vencer.length;
    renderExpiring(data.membresias_por_vencer);
    renderChart(data.grafico_ingresos);
  } catch (error) {
    setMessage(error.message, false);
  }
}

function renderExpiring(items) {
  const target = $("#expiringList");

  if (!items.length) {
    renderEmpty(target, "Sin membresias por vencer.");
    return;
  }

  target.innerHTML = items.map((client) => `
    <article class="item-card">
      <div class="item-main">
        <strong>${client.nombre}</strong>
        <span class="status-chip vencido">${formatDate(client.fecha_fin)}</span>
      </div>
      <div class="item-meta">
        <span>${client.telefono || "Sin telefono"}</span>
      </div>
    </article>
  `).join("");
}

function renderChart(items) {
  const target = $("#incomeChart");
  const max = Math.max(1, ...items.map((item) => Number(item.total)));

  if (!items.length) {
    renderEmpty(target, "Aun no hay ingresos registrados.");
    return;
  }

  target.innerHTML = items.map((item) => {
    const height = Math.max(8, Math.round((Number(item.total) / max) * 160));
    return `
      <div class="bar-item">
        <span>${currency.format(item.total)}</span>
        <div class="bar" style="height:${height}px"></div>
        <span>${item.dia.slice(5).replace("-", "/")}</span>
      </div>
    `;
  }).join("");
}

async function loadClients(search = $("#clientSearch").value.trim()) {
  try {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    state.clients = await api(`/clientes${query}`);
    renderClients();
    fillClientSelects();
  } catch (error) {
    setMessage(error.message, false);
  }
}

function renderClients() {
  const target = $("#clientList");

  if (!state.clients.length) {
    renderEmpty(target, "No hay clientes registrados.");
    return;
  }

  target.innerHTML = state.clients.map((client) => `
    <article class="item-card">
      <div class="item-main">
        <strong>${client.nombre}</strong>
        <span class="status-chip ${client.estado}">${client.estado}</span>
      </div>
      <div class="item-meta">
        <span>${client.telefono || "Sin telefono"}</span>
        <span>Inicio: ${formatDate(client.fecha_inicio)}</span>
        <span>Vence: ${formatDate(client.fecha_fin)}</span>
      </div>
      <div class="item-actions">
        <button class="ghost small-button" type="button" data-edit="${client.id}">Editar</button>
        <button class="primary small-button" type="button" data-renew="${client.id}">Renovar membresia</button>
        <button class="ghost danger small-button" type="button" data-delete="${client.id}">Eliminar</button>
      </div>
    </article>
  `).join("");
}

function clearClientForm() {
  $("#clientId").value = "";
  $("#clientName").value = "";
  $("#clientPhone").value = "";
  $("#clientStart").value = today();
  $("#clientEnd").value = today();
}

function fillClientForm(client) {
  $("#clientId").value = client.id;
  $("#clientName").value = client.nombre;
  $("#clientPhone").value = client.telefono || "";
  $("#clientStart").value = client.fecha_inicio;
  $("#clientEnd").value = client.fecha_fin;
  $("#clientName").focus();
}

function fillClientSelects() {
  const options = state.clients.map((client) => (
    `<option value="${client.id}">${client.nombre} - vence ${formatDate(client.fecha_fin)}</option>`
  )).join("");

  $("#membershipClient").innerHTML = options || `<option value="">Registra un cliente primero</option>`;
  $("#saleClient").innerHTML = `<option value="">Sin cliente</option>${options}`;
}

async function loadMembershipView() {
  $("#membershipDate").value = today();
  if (!state.clients.length) await loadClients("");
  fillClientSelects();
}

async function renewClient(clientId, payload = {}) {
  const result = await api(`/clientes/${clientId}/renovar`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setMessage(`Membresia renovada hasta ${formatDate(result.fecha_fin)}.`);
  await loadClients("");
  await loadDashboard();
  return result;
}

async function loadProducts() {
  try {
    state.products = await api("/productos");
  } catch (error) {
    state.products = [
      { id: null, nombre: "Agua", precio: 2 },
      { id: null, nombre: "Volt", precio: 3 },
      { id: null, nombre: "Pre entreno", precio: 3 },
      { id: null, nombre: "Pre entreno Pro", precio: 5 },
      { id: null, nombre: "Creatina", precio: 100 },
      { id: null, nombre: "Proteina", precio: 120 },
      { id: null, nombre: "Sporade", precio: 3 },
      { id: null, nombre: "Barra proteica (Chocolate)", precio: 8 }
    ];
  }
}

async function loadSalesView() {
  if (!state.clients.length) await loadClients("");
  await loadProducts();
  renderProductButtons();
  await loadQuickSales();
}

function renderProductButtons() {
  const quickProducts = state.products.filter((product) => !isLargeSale(product));
  const largeProducts = state.products.filter(isLargeSale);

  renderProductGrid($("#productButtons"), quickProducts);
  renderProductGrid($("#largeProductButtons"), largeProducts);
}

function renderProductGrid(target, products) {
  if (!products.length) {
    renderEmpty(target, "No hay productos para mostrar.");
    return;
  }

  target.innerHTML = products.map((product) => {
    const image = productImageFor(product);
    const name = escapeHTML(product.nombre);
    const price = Number(product.precio);
    const hasPrice = price > 0;

    return `
    <button class="product-button ${hasPrice ? "" : "needs-price"}" type="button" data-product="${product.id || ""}" data-name="${name}" data-price="${price}" ${hasPrice ? "" : "disabled"}>
      <img class="product-image" src="${image}" alt="" />
      <span class="product-copy">
        <strong>${name}</strong>
        <span class="product-price">${hasPrice ? currency.format(price) : "Definir precio"}</span>
      </span>
    </button>
  `;
  }).join("");
}

async function registerProductSale(button) {
  const payload = {
    cliente_id: $("#saleClient").value || null,
    producto_id: button.dataset.product || null,
    producto: button.dataset.name,
    precio: Number(button.dataset.price)
  };

  await api("/ventas", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  setMessage(`Venta registrada: ${payload.producto}.`);
  await loadQuickSales();
  await loadDashboard();
}

async function loadQuickSales() {
  const sales = await api(`/ventas?fecha=${today()}`);
  renderSalesList($("#quickSalesList"), sales.slice(0, 8), { editable: true });
}

async function loadHistory() {
  try {
    const params = new URLSearchParams();
    let filterLabel = "Todos los movimientos";

    if ($("#historyDate").value) {
      params.set("fecha", $("#historyDate").value);
      filterLabel = `Dia ${formatDate($("#historyDate").value)}`;
    } else if ($("#historyMonth").value) {
      params.set("mes", $("#historyMonth").value);
      filterLabel = monthLabel($("#historyMonth").value);
    }

    if ($("#historyType").value) {
      params.set("tipo", $("#historyType").value);
      filterLabel += ` - ${$("#historyType").selectedOptions[0].text}`;
    }

    const query = params.toString() ? `?${params}` : "";
    const sales = await api(`/ventas${query}`);
    renderHistorySummary(sales, filterLabel);
    renderSalesList($("#historyList"), sales, { editable: true });
  } catch (error) {
    setMessage(error.message, false);
  }
}

function monthLabel(value) {
  if (!value) return "Todos los movimientos";
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric"
  });
}

function renderHistorySummary(sales, label) {
  const total = sales.reduce((sum, sale) => sum + Number(sale.precio || 0), 0);
  const target = $("#historySummary");
  const movementText = sales.length === 1 ? "movimiento" : "movimientos";

  target.innerHTML = `
    <span>${label}</span>
    <strong>${sales.length} ${movementText} - ${currency.format(total)}</strong>
  `;
}

function renderSalesList(target, sales, options = {}) {
  if (!sales.length) {
    renderEmpty(target, "No hay movimientos para mostrar.");
    return;
  }

  target.innerHTML = sales.map((sale) => `
    <article class="item-card">
      <div class="item-main">
        <strong>${sale.producto}</strong>
        <strong>${currency.format(sale.precio)}</strong>
      </div>
      <div class="item-meta">
        <span class="type-chip ${sale.tipo}">${sale.tipo}</span>
        <span>${sale.cliente || "Venta sin cliente"}</span>
        <span>${formatDate(sale.fecha)}</span>
      </div>
      ${options.editable && sale.tipo === "producto" ? `
        <div class="item-actions">
          <button class="ghost small-button" type="button" data-sale-edit="${sale.id}">Editar</button>
          <button class="ghost danger small-button" type="button" data-sale-delete="${sale.id}">Eliminar</button>
        </div>
      ` : ""}
    </article>
  `).join("");

  sales.forEach((sale) => {
    state.salesById[String(sale.id)] = sale;
  });
}

function saleDateForInput(value) {
  if (!value) return `${today()}T12:00`;
  return value.replace(" ", "T").slice(0, 16);
}

function fillSaleClientSelect(selectedId) {
  const options = state.clients.map((client) => (
    `<option value="${client.id}" ${String(client.id) === String(selectedId) ? "selected" : ""}>${client.nombre}</option>`
  )).join("");

  $("#editSaleClient").innerHTML = `<option value="">Sin cliente</option>${options}`;
}

async function openSaleEditor(saleId) {
  const sale = state.salesById[String(saleId)];
  if (!sale) return;

  if (!state.clients.length) await loadClients("");
  fillSaleClientSelect(sale.cliente_id);

  $("#editSaleId").value = sale.id;
  $("#editSaleType").value = sale.tipo;
  $("#editSaleProduct").value = sale.producto;
  $("#editSalePrice").value = Number(sale.precio);
  $("#editSaleDate").value = saleDateForInput(sale.fecha);
  $("#saleModal").classList.remove("hidden");
  $("#editSaleProduct").focus();
}

function closeSaleEditor() {
  $("#saleModal").classList.add("hidden");
  $("#saleEditForm").reset();
}

async function refreshSalesViews() {
  await loadQuickSales();
  if (state.currentView === "historial") await loadHistory();
  await loadDashboard();
}

async function saveSaleEdit() {
  const id = $("#editSaleId").value;
  const payload = {
    producto: $("#editSaleProduct").value.trim(),
    precio: Number($("#editSalePrice").value),
    cliente_id: $("#editSaleClient").value || null,
    tipo: $("#editSaleType").value || "producto",
    fecha: $("#editSaleDate").value
  };

  await api(`/ventas/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  closeSaleEditor();
  setMessage("Venta actualizada.");
  await refreshSalesViews();
}

async function deleteSale(saleId) {
  const sale = state.salesById[String(saleId)];
  const label = sale ? `${sale.producto} por ${currency.format(sale.precio)}` : "esta venta";

  if (!confirm(`Eliminar ${label}?`)) return;

  await api(`/ventas/${saleId}`, { method: "DELETE" });
  setMessage("Venta eliminada.");
  await refreshSalesViews();
}

function resetProductForm() {
  $("#productForm").reset();
  $("#newProductPreview").classList.add("hidden");
  $("#newProductPreview").removeAttribute("src");
  state.newProductImage = null;
}

function setProductFormVisible(visible) {
  $("#productForm").classList.toggle("hidden", !visible);
  if (visible) $("#newProductName").focus();
}

function readImageAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function compressProductImage(file) {
  const dataUrl = await readImageAsDataURL(file);
  const image = await loadImage(dataUrl);
  const maxSize = 360;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.82);
}

async function handleProductImage(file) {
  if (!file) return;

  try {
    const image = await compressProductImage(file);
    state.newProductImage = image;
    $("#newProductPreview").src = image;
    $("#newProductPreview").classList.remove("hidden");
  } catch (error) {
    setMessage("No se pudo cargar la imagen.", false);
  }
}

async function saveManualProduct() {
  const payload = {
    nombre: $("#newProductName").value.trim(),
    precio: Number($("#newProductPrice").value),
    imagen_url: state.newProductImage
  };

  await api("/productos", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  resetProductForm();
  setProductFormVisible(false);
  setMessage("Producto agregado.");
  await loadProducts();
  renderProductButtons();
}

function bindSaleListActions(container) {
  container.addEventListener("click", async (event) => {
    const editId = event.target.dataset.saleEdit;
    const deleteId = event.target.dataset.saleDelete;

    try {
      if (editId) await openSaleEditor(editId);
      if (deleteId) await deleteSale(deleteId);
    } catch (error) {
      setMessage(error.message, false);
    }
  });
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#loginMessage").textContent = "";

    try {
      const data = await api("/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("#username").value.trim(),
          password: $("#password").value
        })
      });
      state.token = data.token;
      localStorage.setItem("gym_token", data.token);
      showApp();
    } catch (error) {
      $("#loginMessage").textContent = error.message;
    }
  });

  $("#logoutButton").addEventListener("click", logout);

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $("#clientForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("#clientId").value;
    const payload = {
      nombre: $("#clientName").value.trim(),
      telefono: $("#clientPhone").value.trim(),
      fecha_inicio: $("#clientStart").value,
      fecha_fin: $("#clientEnd").value
    };

    try {
      await api(id ? `/clientes/${id}` : "/clientes", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      clearClientForm();
      await loadClients();
      setMessage("Cliente guardado.");
    } catch (error) {
      setMessage(error.message, false);
    }
  });

  $("#clearClientForm").addEventListener("click", clearClientForm);

  $("#clientSearch").addEventListener("input", () => {
    window.clearTimeout($("#clientSearch").timer);
    $("#clientSearch").timer = window.setTimeout(() => loadClients(), 250);
  });

  $("#clientList").addEventListener("click", async (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    const renewId = event.target.dataset.renew;

    if (editId) {
      const client = state.clients.find((item) => String(item.id) === String(editId));
      if (client) fillClientForm(client);
    }

    if (deleteId) {
      const client = state.clients.find((item) => String(item.id) === String(deleteId));
      if (!confirm(`Eliminar a ${client?.nombre || "este cliente"}?`)) return;
      await api(`/clientes/${deleteId}`, { method: "DELETE" });
      await loadClients();
      setMessage("Cliente eliminado.");
    }

    if (renewId) {
      try {
        await renewClient(renewId, {
          meses: 1,
          precio: Number($("#membershipPrice").value || 80),
          fecha: today()
        });
      } catch (error) {
        setMessage(error.message, false);
      }
    }
  });

  $("#membershipForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await renewClient($("#membershipClient").value, {
        fecha: $("#membershipDate").value,
        meses: Number($("#membershipMonths").value),
        precio: Number($("#membershipPrice").value)
      });
      $("#membershipMonths").value = 1;
    } catch (error) {
      setMessage(error.message, false);
    }
  });

  const handleProductSaleClick = async (event) => {
    const button = event.target.closest(".product-button");
    if (!button) return;

    try {
      button.disabled = true;
      await registerProductSale(button);
    } catch (error) {
      setMessage(error.message, false);
    } finally {
      button.disabled = false;
    }
  };

  $("#productButtons").addEventListener("click", handleProductSaleClick);
  $("#largeProductButtons").addEventListener("click", handleProductSaleClick);

  $("#toggleProductForm").addEventListener("click", () => {
    setProductFormVisible($("#productForm").classList.contains("hidden"));
  });

  $("#cancelProductForm").addEventListener("click", () => {
    resetProductForm();
    setProductFormVisible(false);
  });

  $("#newProductImage").addEventListener("change", (event) => {
    handleProductImage(event.target.files[0]);
  });

  $("#productForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await saveManualProduct();
    } catch (error) {
      setMessage(error.message, false);
    }
  });

  bindSaleListActions($("#quickSalesList"));
  bindSaleListActions($("#historyList"));

  $("#saleEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await saveSaleEdit();
    } catch (error) {
      setMessage(error.message, false);
    }
  });

  $("#closeSaleModal").addEventListener("click", closeSaleEditor);
  $("#cancelSaleEdit").addEventListener("click", closeSaleEditor);

  $("#historyFilter").addEventListener("submit", (event) => {
    event.preventDefault();
    loadHistory();
  });
  $("#historyDate").addEventListener("change", () => {
    if ($("#historyDate").value) $("#historyMonth").value = "";
    loadHistory();
  });
  $("#historyMonth").addEventListener("change", () => {
    if ($("#historyMonth").value) $("#historyDate").value = "";
    loadHistory();
  });
  $("#historyType").addEventListener("change", loadHistory);
}

function init() {
  bindEvents();
  clearClientForm();
  $("#membershipDate").value = today();
  $("#historyDate").value = today();
  $("#historyMonth").value = "";

  if (state.token) {
    showApp();
  } else {
    showLogin();
  }
}

init();
