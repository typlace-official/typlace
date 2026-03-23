const token = localStorage.getItem("tp_token");

(function(){
  const TOKEN_KEY = "tp_token";

  const PAGE_META = {
    dashboard: {
      title: "Dashboard",
      subtitle: "Общая статистика платформы"
    },
    search: {
      title: "Search",
      subtitle: "Глобальный поиск по платформе"
    },
    users: {
      title: "Users",
      subtitle: "Управление пользователями"
    },
    orders: {
      title: "Orders",
      subtitle: "Модерация и контроль заказов"
    },
    offers: {
      title: "Offers",
      subtitle: "Модерация объявлений"
    },
    finances: {
      title: "Finances",
      subtitle: "Финансы платформы и комиссии"
    },
    logs: {
      title: "Logs",
      subtitle: "Журнал действий системы"
    },
    settings: {
      title: "Settings",
      subtitle: "Настройки платформы"
    }
  };

  if (!token) {
    location.href = "/auth.html?mode=login";
    return;
  }

  const navButtons = Array.from(document.querySelectorAll(".admin-nav-btn"));
  const tabs = Array.from(document.querySelectorAll(".admin-tab"));
  const pageTitle = document.getElementById("adminPageTitle");
  const pageSubtitle = document.getElementById("adminPageSubtitle");
  const roleBadge = document.getElementById("adminRoleBadge");
  const openSupportBtn = document.getElementById("openSupportBtn");
  const adminLogoutBtn = document.getElementById("adminLogoutBtn");
  const adminSearchForm = document.getElementById("adminSearchForm");
  const adminSearchInput = document.getElementById("adminSearchInput");
  const adminSearchResults = document.getElementById("adminSearchResults");
const usersFilterInput = document.getElementById("usersFilterInput");
const financeFilterInput = document.getElementById("financeFilterInput");
const logsFilterInput = document.getElementById("logsFilterInput");
const adminFeePercentInput = document.getElementById("adminFeePercentInput");
const adminMinDepositInput = document.getElementById("adminMinDepositInput");
const adminMinWithdrawInput = document.getElementById("adminMinWithdrawInput");
const adminMaintenanceTextInput = document.getElementById("adminMaintenanceTextInput");
const saveAdminSettingsBtn = document.getElementById("saveAdminSettingsBtn");
let currentAdmin = null;
let adminRefreshTimer = null;

async function loadAdminSettings(){
  try{
    const res = await fetch("/api/admin/settings", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success || !data.settings) return;

    const s = data.settings;

    if (adminFeePercentInput) adminFeePercentInput.value = s.marketplaceFeePercent ?? 10;
if (adminMinDepositInput) adminMinDepositInput.value = s.minDepositUah ?? 20;
if (adminMinWithdrawInput) adminMinWithdrawInput.value = s.minWithdrawUah ?? 20;
    if (adminMaintenanceTextInput) adminMaintenanceTextInput.value = s.maintenanceText || "";
  }catch(e){
    console.log("admin settings load error:", e);
  }
}

async function saveAdminSettings(){
  try{
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
body: JSON.stringify({
  marketplaceFeePercent: Number(adminFeePercentInput?.value || 0),
  minDepositUah: Number(adminMinDepositInput?.value || 0),
  minWithdrawUah: Number(adminMinWithdrawInput?.value || 0),
  maintenanceText: String(adminMaintenanceTextInput?.value || "").trim()
})
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось сохранить настройки");
      return;
    }

    alert("Настройки сохранены");
    await window.loadLogs();
  }catch(e){
    alert("Ошибка сохранения");
  }
}

function bindSettings(){
  saveAdminSettingsBtn?.addEventListener("click", saveAdminSettings);
}

  function setActiveTab(tabName){
    navButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    tabs.forEach(tab => {
      tab.classList.toggle("active", tab.id === "tab-" + tabName);
    });

    const meta = PAGE_META[tabName] || PAGE_META.dashboard;
    pageTitle.textContent = meta.title;
    pageSubtitle.textContent = meta.subtitle;
    syncTabUrl(tabName);

  }

function getStartTab(){
  const hash = String(location.hash || "").replace("#", "").trim();

  if (PAGE_META[hash]) return hash;

  return "dashboard";
}

function syncTabUrl(tabName){
  const newUrl = tabName === "dashboard"
    ? "/admin"
    : "/admin#" + tabName;

  history.replaceState(null, "", newUrl);
}

  async function fetchMe(){
    const res = await fetch("/auth/me", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (res.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      location.href = "/banned.html";
      return null;
    }

const data = await res.json().catch(() => ({}));
if (!data.success || !data.user) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("tp_user_email");
  localStorage.removeItem("tp_user_id");
  location.href = "/auth.html?mode=login";
  return null;
}

    return data.user;
  }

function allowRole(role){
  return role === "admin" || role === "super_admin";
}

async function initAccess(){
  const me = await fetchMe();
  if (!me) return false;

  if (!allowRole(me.role)) {
    location.href = "/";
    return false;
  }

  currentAdmin = me;
  roleBadge.textContent = "Роль: " + (me.role || "user");
  return true;
}

  function bindNav(){
    navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        setActiveTab(btn.dataset.tab);
      });
    });
  }

  function bindSupportButton(){
    openSupportBtn?.addEventListener("click", () => {
      location.href = "/support-admin.html";
    });
  }

async function logout(){
  try{
    await fetch("/auth/logout", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });
  }catch(e){}

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("tp_user_email");
  localStorage.removeItem("tp_user_id");
  location.href = "/auth.html?mode=login";
}

function bindLogout(){
  adminLogoutBtn?.addEventListener("click", logout);
}

function bindSearchStub(){

  function getTicketStatusText(status){
    if (status === "waiting") return "Ожидает ответа";
    if (status === "in_progress") return "В процессе";
    if (status === "resolved") return "Решено";
    return status || "—";
  }

  function renderResults(data, q){
    const users = Array.isArray(data.users) ? data.users : [];
    const orders = Array.isArray(data.orders) ? data.orders : [];
    const tickets = Array.isArray(data.tickets) ? data.tickets : [];
    const offers = Array.isArray(data.offers) ? data.offers : [];

    const sections = [];

    if (users.length) {
      sections.push(`
        <div class="search-section">
          <div class="search-section-head">Пользователи (${users.length})</div>
          <div class="search-list">
            ${users.map(user => `
              <div class="search-item">
                <div class="search-item-title">
                  ${escapeHtml(user.username || "—")}
                </div>
                <div class="search-item-meta">
                  <span class="search-badge">ID: ${escapeHtml(user.userId || "—")}</span>
                  <span class="search-badge">${escapeHtml(user.email || "—")}</span>
                  <span class="search-badge">Роль: ${escapeHtml(user.role || "user")}</span>
                  <span class="search-badge">${user.banned ? "Заблокирован" : "Активен"}</span>
                  <span class="search-badge">Баланс: ${Number(user.balance || 0).toFixed(2)}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `);
    }

    if (orders.length) {
      sections.push(`
        <div class="search-section">
          <div class="search-section-head">Заказы (${orders.length})</div>
          <div class="search-list">
            ${orders.map(order => `
              <div class="search-item">
                <div class="search-item-title">
                  ${escapeHtml(order.orderNumber || "—")}
                </div>
                <div class="search-item-meta">
                  <span class="search-badge">Покупатель: ${escapeHtml(order.buyerUsername || "—")}</span>
                  <span class="search-badge">Продавец: ${escapeHtml(order.sellerUsername || "—")}</span>
                  <span class="search-badge">Статус: ${escapeHtml(getOrderStatusText(order.status))}</span>
                  <span class="search-badge">Цена: ${Number(order.price || 0).toFixed(2)}</span>
                  <span class="search-badge">Комиссия: ${Number(order.commission || 0).toFixed(2)}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `);
    }

    if (tickets.length) {
      sections.push(`
        <div class="search-section">
          <div class="search-section-head">Обращения (${tickets.length})</div>
          <div class="search-list">
            ${tickets.map(ticket => `
              <div class="search-item">
                <div class="search-item-title">
                  Обращение ${escapeHtml(ticket.shortId || "—")} — ${escapeHtml(ticket.subject || "")}
                </div>
                <div class="search-item-meta">
                  <span class="search-badge">${escapeHtml(ticket.categoryLabel || "Без категории")}</span>
                  <span class="search-badge">Статус: ${escapeHtml(getTicketStatusText(ticket.status))}</span>
                  <span class="search-badge">Создал: ${escapeHtml(ticket.creatorUsername || "Пользователь")}</span>
                  ${ticket.creatorUserId ? `<span class="search-badge">ID: ${escapeHtml(ticket.creatorUserId)}</span>` : ""}
                  ${ticket.assignedUsername ? `<span class="search-badge">Ответственный: ${escapeHtml(ticket.assignedUsername)}</span>` : ""}
                  ${ticket.orderId ? `<span class="search-badge">Заказ: ${escapeHtml(ticket.orderId)}</span>` : ""}
                  ${ticket.userId ? `<span class="search-badge">User ID: ${escapeHtml(ticket.userId)}</span>` : ""}
                </div>
                <div class="search-actions">
                  <a class="table-action-btn" href="/support-ticket.html?id=${encodeURIComponent(String(ticket.id || ""))}">
                    Открыть тикет
                  </a>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `);
    }

    if (offers.length) {
      sections.push(`
        <div class="search-section">
          <div class="search-section-head">Объявления (${offers.length})</div>
          <div class="search-list">
            ${offers.map(offer => `
              <div class="search-item">
                <div class="search-item-title">
                  ${escapeHtml(offer.title || "—")}
                </div>
                <div class="search-item-meta">
                  <span class="search-badge">Игра: ${escapeHtml(offer.game || "—")}</span>
                  <span class="search-badge">Режим: ${escapeHtml(offer.mode || "—")}</span>
                  <span class="search-badge">Статус: ${escapeHtml(getOfferStatusText(offer.status))}</span>
                  <span class="search-badge">Цена: ${Number(offer.price || 0).toFixed(2)}</span>
                  <span class="search-badge">Продавец: ${escapeHtml(offer.sellerUsername || "—")}</span>
                  ${offer.sellerUserId ? `<span class="search-badge">ID: ${escapeHtml(offer.sellerUserId)}</span>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `);
    }

    if (!sections.length) {
      adminSearchResults.innerHTML = `
        <div class="empty-state">
          По запросу <strong>${escapeHtml(q)}</strong> ничего не найдено.
        </div>
      `;
      return;
    }

    adminSearchResults.innerHTML = `
      <div class="search-sections">
        ${sections.join("")}
      </div>
    `;
  }

  adminSearchForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const q = String(adminSearchInput?.value || "").trim();

    if (!q) {
      adminSearchResults.innerHTML = `
        <div class="empty-state">
          Введите email, ник, userId, номер заказа или shortId обращения.
        </div>
      `;
      return;
    }

    adminSearchResults.innerHTML = `
      <div class="empty-state">Ищем...</div>
    `;

    try{
      const res = await fetch("/api/admin/search?q=" + encodeURIComponent(q), {
        headers: {
          Authorization: "Bearer " + token
        }
      });

      const data = await res.json().catch(() => ({}));

      if (!data.success) {
        adminSearchResults.innerHTML = `
          <div class="empty-state">
            ${escapeHtml(data.message || "Ошибка поиска")}
          </div>
        `;
        return;
      }

      renderResults(data, q);
    }catch(e){
      adminSearchResults.innerHTML = `
        <div class="empty-state">
          Ошибка запроса поиска.
        </div>
      `;
    }
  });
}

function formatDate(value){
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("ru-RU") + " " +
    date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    });
}

async function initDashboardStub(){
  try{
    const res = await fetch("/api/admin/stats", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success || !data.stats) return;

    const stats = data.stats;
    const finances = stats.finances || {};

    const statUsers = document.getElementById("statUsers");
    const statOnlineUsers = document.getElementById("statOnlineUsers");
    const statBannedUsers = document.getElementById("statBannedUsers");
    const statOffers = document.getElementById("statOffers");
    const statOrders = document.getElementById("statOrders");
    const statRevenue = document.getElementById("statRevenue");
    const statTickets = document.getElementById("statTickets");
    const statPendingWithdraws = document.getElementById("statPendingWithdraws");
    const statPendingCryptoDeposits = document.getElementById("statPendingCryptoDeposits");

    const financePlatformBalance = document.getElementById("financePlatformBalance");
    const financeUserBalances = document.getElementById("financeUserBalances");
    const financeLockedOrders = document.getElementById("financeLockedOrders");
    const financeCommissions = document.getElementById("financeCommissions");
    const financeDeposits = document.getElementById("financeDeposits");
    const financeWithdrawals = document.getElementById("financeWithdrawals");

    if (statUsers) statUsers.textContent = Number(stats.users || 0);
    if (statOnlineUsers) statOnlineUsers.textContent = Number(stats.onlineUsers || 0);
    if (statBannedUsers) statBannedUsers.textContent = Number(stats.bannedUsers || 0);
    if (statOffers) statOffers.textContent = Number(stats.offers || 0);
    if (statOrders) statOrders.textContent = Number(stats.orders || 0);
    if (statRevenue) statRevenue.textContent = Number(stats.revenue || 0).toFixed(2);
    if (statTickets) statTickets.textContent = Number(stats.openTickets || 0);
    if (statPendingWithdraws) statPendingWithdraws.textContent = Number(stats.pendingWithdraws || 0);
    if (statPendingCryptoDeposits) statPendingCryptoDeposits.textContent = Number(stats.pendingCryptoDeposits || 0);

    if (financePlatformBalance) financePlatformBalance.textContent = Number(finances.platformBalance || 0).toFixed(2);
    if (financeUserBalances) financeUserBalances.textContent = Number(finances.userBalances || 0).toFixed(2);
    if (financeLockedOrders) financeLockedOrders.textContent = Number(finances.lockedOrders || 0).toFixed(2);
    if (financeCommissions) financeCommissions.textContent = Number(finances.commissions || 0).toFixed(2);
    if (financeDeposits) financeDeposits.textContent = Number(finances.deposits || 0).toFixed(2);
    if (financeWithdrawals) financeWithdrawals.textContent = Number(finances.withdrawals || 0).toFixed(2);

  }catch(e){
    console.log("admin stats load error:", e);
  }
}

window.changeRole = async function(email, role){
  try{
    const res = await fetch("/api/admin/set-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ email, role })
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось изменить роль");
      return;
    }

    await loadUsers();
    await window.loadLogs();
  }catch(e){
    alert("Ошибка запроса");
  }
};

window.toggleBan = async function(email, banned){
  try{
    const res = await fetch("/api/admin/ban", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ email, banned })
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось изменить статус пользователя");
      return;
    }

    await loadUsers();
    await initDashboardStub();
    await window.loadLogs();
  }catch(e){
    alert("Ошибка запроса");
  }
};

async function loadUsers(){
  const body = document.getElementById("usersTableBody");
  if (!body) return;

  try{
    const res = await fetch("/api/admin/users", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success || !Array.isArray(data.users)) {
      body.innerHTML = `
        <tr>
          <td colspan="8" class="table-empty">Не удалось загрузить пользователей.</td>
        </tr>
      `;
      return;
    }

    let users = data.users;

    const q = String(usersFilterInput?.value || "").trim().toLowerCase();

    if (q) {
      users = users.filter(user =>
        String(user.username || "").toLowerCase().includes(q) ||
        String(user.email || "").toLowerCase().includes(q) ||
        String(user.userId || "").toLowerCase().includes(q)
      );
    }

    if (!users.length) {
      body.innerHTML = `
        <tr>
          <td colspan="8" class="table-empty">Пользователи не найдены.</td>
        </tr>
      `;
      return;
    }

body.innerHTML = users.map(user => `
  <tr>
    <td>${escapeHtml(user.username || "—")}</td>
    <td>${escapeHtml(user.userId || "—")}</td>
    <td>${escapeHtml(user.email || "—")}</td>
    <td>
      <select
        class="admin-input"
        style="max-width:140px"
        ${user.email === currentAdmin?.email ? "disabled" : ""}
        onchange="changeRole('${String(user.email || "").replaceAll("'", "\\'")}', this.value)"
      >
<option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
<option value="moderator" ${user.role === "moderator" ? "selected" : ""}>moderator</option>
<option value="support" ${user.role === "support" ? "selected" : ""}>support</option>
<option value="resolution" ${user.role === "resolution" ? "selected" : ""}>resolution</option>
<option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
${currentAdmin?.role === "super_admin"
  ? `<option value="super_admin" ${user.role === "super_admin" ? "selected" : ""}>super_admin</option>`
  : ""}
      </select>
    </td>
    <td>${user.banned ? "Заблокирован" : "Активен"}</td>
    <td>${Number(user.balance || 0).toFixed(2)}</td>
    <td>${formatDate(user.createdAt)}</td>
    <td>
      <div class="table-actions">
        <button
          class="table-action-btn"
          onclick="openUser('${String(user.userId || "").replaceAll("'", "\\'")}')"
        >
          Профиль
        </button>

        <button
          class="table-action-btn ${user.email === currentAdmin?.email ? "danger" : ""}"
          ${user.email === currentAdmin?.email ? "disabled" : ""}
          onclick="toggleBan('${String(user.email || "").replaceAll("'", "\\'")}', ${user.banned ? "false" : "true"})"
        >
          ${user.banned ? "Разбанить" : "Забанить"}
        </button>
      </div>
    </td>
  </tr>
`).join("");

  }catch(e){
    body.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty">Ошибка загрузки пользователей.</td>
      </tr>
    `;
  }
}
function getOrderStatusText(status){
  if (status === "pending") return "В процессе";
  if (status === "completed") return "Завершён";
  if (status === "refunded") return "Возврат";
  return status || "—";
}

window.adminConfirmOrder = async function(id){
  if (!confirm("Подтвердить заказ?")) return;

  try{
    const res = await fetch("/api/admin/orders/" + encodeURIComponent(id) + "/confirm", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось подтвердить заказ");
      return;
    }

await loadOrders();
await initDashboardStub();
await window.loadLogs();
  }catch(e){
    alert("Ошибка запроса");
  }
};

window.adminRefundOrder = async function(id){
  if (!confirm("Сделать возврат по заказу?")) return;

  try{
    const res = await fetch("/api/admin/orders/" + encodeURIComponent(id) + "/refund", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось сделать возврат");
      return;
    }

await loadOrders();
await initDashboardStub();
await window.loadLogs();
  }catch(e){
    alert("Ошибка запроса");
  }
};

async function loadOrders(){
  const body = document.getElementById("ordersTableBody");
  if (!body) return;

  try{
    const res = await fetch("/api/admin/orders", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success || !Array.isArray(data.orders)) {
      body.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">Не удалось загрузить заказы.</td>
        </tr>
      `;
      return;
    }

    if (!data.orders.length) {
      body.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">Заказов пока нет.</td>
        </tr>
      `;
      return;
    }

body.innerHTML = data.orders.map(order => `
  <tr>
    <td>${escapeHtml(order.orderNumber || "—")}</td>
    <td>${escapeHtml(order.buyerUsername || "—")}</td>
    <td>${escapeHtml(order.sellerUsername || "—")}</td>
    <td>${escapeHtml(getOrderStatusText(order.status))}</td>
    <td>${Number(order.price || 0).toFixed(2)}</td>
    <td>${Number(order.commission || 0).toFixed(2)}</td>
    <td>
      <div class="table-actions">
        <button
          class="table-action-btn"
          onclick="openOrder('${String(order.id || "").replaceAll("'", "\\'")}')"
        >
          Открыть
        </button>

        ${order.status === "pending" ? `
          <button class="table-action-btn" onclick="adminConfirmOrder('${String(order.id).replaceAll("'", "\\'")}')">
            Подтвердить
          </button>
          <button class="table-action-btn danger" onclick="adminRefundOrder('${String(order.id).replaceAll("'", "\\'")}')">
            Возврат
          </button>
        ` : `
          <span class="table-muted">Без действий</span>
        `}
      </div>
    </td>
  </tr>
`).join("");

  }catch(e){
    body.innerHTML = `
      <tr>
        <td colspan="7" class="table-empty">Ошибка загрузки заказов.</td>
      </tr>
    `;
  }
}
function getOfferStatusText(status){
  if (status === "active") return "Активно";
  if (status === "inactive") return "Неактивно";
  if (status === "closed") return "Продано";
  if (status === "deleted") return "Удалено";
  return status || "—";
}

window.adminActivateOffer = async function(id){
  try{
    const res = await fetch("/api/admin/offers/" + encodeURIComponent(id) + "/activate", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось активировать объявление");
      return;
    }

    await loadOffers();
    await initDashboardStub();
  await window.loadLogs();  
  }catch(e){
    alert("Ошибка запроса");
  }
};

window.adminDeactivateOffer = async function(id){
  try{
    const res = await fetch("/api/admin/offers/" + encodeURIComponent(id) + "/deactivate", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось деактивировать объявление");
      return;
    }

await loadOffers();
await initDashboardStub();
await window.loadLogs();
  }catch(e){
    alert("Ошибка запроса");
  }
};

window.adminDeleteOffer = async function(id){
  if (!confirm("Удалить объявление?")) return;

  try{
    const res = await fetch("/api/admin/offers/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось удалить объявление");
      return;
    }

    await loadOffers();
    await initDashboardStub();
    await window.loadLogs();
  }catch(e){
    alert("Ошибка запроса");
  }
};

async function loadOffers(){
  const body = document.getElementById("offersTableBody");
  if (!body) return;

  try{
    const res = await fetch("/api/admin/offers", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success || !Array.isArray(data.offers)) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty">Не удалось загрузить объявления.</td>
        </tr>
      `;
      return;
    }

    if (!data.offers.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty">Объявлений пока нет.</td>
        </tr>
      `;
      return;
    }

    body.innerHTML = data.offers.map(offer => `
      <tr>
        <td>${escapeHtml(offer.title || "—")}</td>
        <td>
          ${escapeHtml(offer.sellerUsername || "—")}
          ${offer.sellerUserId ? `<div class="table-muted">ID: ${escapeHtml(offer.sellerUserId)}</div>` : ""}
        </td>
        <td>${escapeHtml(offer.game || "—")}</td>
        <td>${escapeHtml(getOfferStatusText(offer.status))}</td>
<td>${Number(offer.price || 0).toFixed(2)}</td>
<td>
  <div class="table-actions">
    <button
      class="table-action-btn"
      onclick="openOffer('${String(offer.id || "").replaceAll("'", "\\'")}')"
    >
      Открыть
    </button>

    ${offer.status === "active" ? `
      <button class="table-action-btn" onclick="adminDeactivateOffer('${String(offer.id).replaceAll("'", "\\'")}')">
        Выключить
      </button>
    ` : ""}

    ${offer.status === "inactive" ? `
      <button class="table-action-btn" onclick="adminActivateOffer('${String(offer.id).replaceAll("'", "\\'")}')">
        Включить
      </button>
    ` : ""}

    ${offer.status !== "deleted" ? `
      <button class="table-action-btn danger" onclick="adminDeleteOffer('${String(offer.id).replaceAll("'", "\\'")}')">
        Удалить
      </button>
    ` : `
      <span class="table-muted">Без действий</span>
    `}
  </div>
</td>
      </tr>
    `).join("");
  }catch(e){
    body.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">Ошибка загрузки объявлений.</td>
      </tr>
    `;
  }
}

async function loadFinanceHistory(){
  const financeBody = document.getElementById("financeTableBody");
  const cryptoBody = document.getElementById("financeCryptoTableBody");

  if (!financeBody || !cryptoBody) return;

  try{
    const q = String(financeFilterInput?.value || "").trim();

    const res = await fetch("/api/admin/finance/history?q=" + encodeURIComponent(q), {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      financeBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">Не удалось загрузить историю.</td>
        </tr>
      `;
      cryptoBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">Не удалось загрузить крипто-заявки.</td>
        </tr>
      `;
      return;
    }

    const history = Array.isArray(data.history) ? data.history : [];
    const cryptoDeposits = Array.isArray(data.cryptoDeposits) ? data.cryptoDeposits : [];

    if (!history.length) {
      financeBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">Операции не найдены.</td>
        </tr>
      `;
    } else {
      financeBody.innerHTML = history.map(item => `
        <tr>
          <td>${formatDate(item.createdAt)}</td>
          <td>${escapeHtml(item.username || "Пользователь")}</td>
          <td>${escapeHtml(item.userId || "—")}</td>
          <td>${escapeHtml(getFinanceTypeText(item.type))}</td>
          <td>${Math.abs(Number(item.amount || 0)).toFixed(2)}</td>
          <td>${escapeHtml(item.currency || "UAH")}</td>
          <td>${escapeHtml(item.text || "—")}</td>
        </tr>
      `).join("");
    }

    if (!cryptoDeposits.length) {
      cryptoBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">Крипто-заявок пока нет.</td>
        </tr>
      `;
    } else {
      cryptoBody.innerHTML = cryptoDeposits.map(item => `
        <tr>
          <td>${formatDate(item.createdAt)}</td>
          <td>${escapeHtml(item.username || "Пользователь")}</td>
          <td>${escapeHtml(item.userId || "—")}</td>
          <td>${Number(item.amountExpected || 0).toFixed(2)}</td>
          <td>${escapeHtml(item.network || "TRC20")}</td>
          <td>
${escapeHtml(getCryptoStatusText(item.status))}

${
item.status === "pending"
? `<button class="table-action-btn" onclick="confirmCrypto('${item.id}')">
Подтвердить
</button>`
: ""
}

</td>
          <td>${escapeHtml(item.id || "—")}</td>
        </tr>
      `).join("");
    }

  }catch(e){
    financeBody.innerHTML = `
      <tr>
        <td colspan="7" class="table-empty">Ошибка загрузки операций.</td>
      </tr>
    `;

    cryptoBody.innerHTML = `
      <tr>
        <td colspan="7" class="table-empty">Ошибка загрузки крипто-заявок.</td>
      </tr>
    `;
  }
}
async function loadLogs(){
  const body = document.getElementById("logsTableBody");
  if (!body) return;

  try{
    const q = String(document.getElementById("logsFilterInput")?.value || "").trim();

    const res = await fetch("/api/admin/logs?q=" + encodeURIComponent(q), {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success || !Array.isArray(data.logs)) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty">Не удалось загрузить логи.</td>
        </tr>
      `;
      return;
    }

    if (!data.logs.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty">Логи не найдены.</td>
        </tr>
      `;
      return;
    }

    body.innerHTML = data.logs.map(log => `
      <tr>
        <td>${formatDate(log.createdAt)}</td>
        <td>
          <div>${escapeHtml(log.actorUsername || "Админ")}</div>
          <div class="table-muted">${escapeHtml(log.actorEmail || "—")}</div>
        </td>
        <td>${escapeHtml(log.action || "—")}</td>
        <td>${escapeHtml(log.targetType || "—")}</td>
<td>${escapeHtml(log.targetId || "—")}</td>
        <td>${escapeHtml(log.text || "—")}</td>
      </tr>
    `).join("");
  }catch(e){
    body.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">Ошибка загрузки логов.</td>
      </tr>
    `;
  }
}

async function init(){
  const ok = await initAccess();
  if (!ok) return;

  bindNav();
  bindSupportButton();
  bindLogout();
  bindSearchStub();

  usersFilterInput?.addEventListener("input", loadUsers);
  financeFilterInput?.addEventListener("input", loadFinanceHistory);
  logsFilterInput?.addEventListener("input", loadLogs);

  setActiveTab(getStartTab());

  await initDashboardStub();
  await loadUsers();
  await loadOrders();
  await loadOffers();
  await loadFinanceHistory();
  await loadWithdrawRequests();
await loadLogs();
startAdminAutoRefresh();
bindSettings();
await loadAdminSettings();
}

window.loadFinanceHistory = loadFinanceHistory;
window.initDashboardStub = initDashboardStub;
window.formatDate = formatDate;
window.loadLogs = loadLogs;
function startAdminAutoRefresh(){
  if (adminRefreshTimer) {
    clearInterval(adminRefreshTimer);
  }

  adminRefreshTimer = setInterval(async () => {
    await initDashboardStub();

    const activeTab = getStartTab();

    if (activeTab === "users") {
      await loadUsers();
    }

    if (activeTab === "orders") {
      await loadOrders();
    }

    if (activeTab === "offers") {
      await loadOffers();
    }

    if (activeTab === "finances") {
      await loadFinanceHistory();
      await loadWithdrawRequests();
    }

    if (activeTab === "logs") {
      await loadLogs();
    }
  }, 15000);
}

init();
})();

async function confirmCrypto(id){
  if (!confirm("Подтвердить крипто депозит?")) return;

  const txHash = String(prompt("Введи txHash транзакции:") || "").trim();
  if (!txHash) {
    alert("Нужно указать txHash");
    return;
  }

  const amountRaw = String(prompt("Введи фактическую сумму USDT:") || "").trim();
  const amountUsdt = Number(amountRaw);

  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
    alert("Нужно указать корректную сумму USDT");
    return;
  }

  try{
    const res = await fetch("/api/admin/crypto/" + encodeURIComponent(id) + "/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ txHash, amountUsdt })
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success){
      alert(data.message || "Ошибка");
      return;
    }

    await window.loadFinanceHistory();
    await window.initDashboardStub();
    await window.loadLogs();

  }catch(e){
    alert("Ошибка подтверждения");
  }
}

function getWithdrawStatusText(status){
  if (status === "pending") return "Ожидает";
  if (status === "approved") return "Одобрено";
  if (status === "rejected") return "Отклонено";
  if (status === "cancelled") return "Отменено";
  return status || "—";
}

async function loadWithdrawRequests(){
  const body = document.getElementById("withdrawTableBody");
  if (!body) return;

  try{
    const res = await fetch("/api/admin/withdraws", {
      headers:{
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success){
      body.innerHTML = `
        <tr>
          <td colspan="6">Ошибка загрузки</td>
        </tr>`;
      return;
    }

    const list = Array.isArray(data.withdraws) ? data.withdraws : [];

    if (!list.length){
      body.innerHTML = `
        <tr>
          <td colspan="6">Нет заявок</td>
        </tr>`;
      return;
    }

    body.innerHTML = list.map(w => `
      <tr>
        <td>${window.formatDate(w.createdAt)}</td>

        <td>${escapeHtml(w.username || "—")}</td>

        <td>${escapeHtml(w.userId || "—")}</td>

        <td>
          ${Number(w.amount || 0).toFixed(2)} ${escapeHtml(w.currency || "UAH")}
          ${w.method === "crypto"
            ? `<div class="table-muted">Net: ${Number(w.amountUsdtNet || 0).toFixed(2)} USDT</div>`
            : ""}
        </td>

        <td>
          ${escapeHtml(getWithdrawStatusText(w.status))}
          ${w.network ? `<div class="table-muted">${escapeHtml(w.network)}</div>` : ""}
          ${w.wallet ? `<div class="table-muted">${escapeHtml(w.wallet)}</div>` : ""}
        </td>

        <td>
          ${
            w.status === "pending"
              ? `
                <button class="table-action-btn" onclick="approveWithdraw('${String(w.id).replaceAll("'", "\\'")}')">
                  Одобрить
                </button>

                <button class="table-action-btn danger" onclick="rejectWithdraw('${String(w.id).replaceAll("'", "\\'")}')">
                  Отклонить
                </button>
              `
              : ""
          }
        </td>
      </tr>
    `).join("");

  }catch(e){
    body.innerHTML = `
      <tr>
        <td colspan="6">Ошибка</td>
      </tr>`;
  }
}

async function approveWithdraw(id){
  if (!confirm("Подтвердить выплату?")) return;

  try{
    const res = await fetch("/api/admin/withdraw/" + encodeURIComponent(id) + "/approve", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось подтвердить выплату");
      return;
    }

    await loadWithdrawRequests();
    await window.loadFinanceHistory();
    await window.initDashboardStub();
    await window.loadLogs();

  }catch(e){
    alert("Ошибка запроса");
  }
}

async function rejectWithdraw(id){
  if (!confirm("Отклонить выплату?")) return;

  try{
    const res = await fetch("/api/admin/withdraw/" + encodeURIComponent(id) + "/reject", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!data.success) {
      alert(data.message || "Не удалось отклонить заявку");
      return;
    }

    await loadWithdrawRequests();
await window.loadFinanceHistory();
await window.initDashboardStub();
await window.loadLogs();

  }catch(e){
    alert("Ошибка запроса");
  }
}

function escapeHtml(text){
  return String(text || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function getFinanceTypeText(type){
  if (type === "deposit") return "Пополнение";
  if (type === "withdraw") return "Вывод";
  if (type === "purchase") return "Покупка";
  if (type === "sale") return "Продажа";
  if (type === "refund") return "Возврат";
  if (type === "commission") return "Комиссия платформы";
  return type || "—";
}

function getCryptoStatusText(status){
  if (status === "pending") return "Ожидает";
  if (status === "completed") return "Подтверждено";
  if (status === "cancelled") return "Отменено";
  if (status === "expired") return "Истекло";
  return status || "—";
}
window.openUser = function(userId){
  location.href = "/profile.html?id=" + encodeURIComponent(userId);
}

window.openOffer = function(id){
  location.href = "/offer.html?id=" + encodeURIComponent(id);
}

window.openOrder = function(id){
  location.href = "/order.html?id=" + encodeURIComponent(id);
}