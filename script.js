const roles = ["DM", "Assistente do DM", "Player", "Outsider"];
const adminRoles = ["DM", "Assistente do DM"];
const publicPages = new Set(["index.html", "login.html"]);

if (window.location.protocol === "file:") {
  const currentFile = window.location.pathname.split(/[\\/]/).pop() || "index.html";
  const targetFile = currentFile.endsWith(".html") ? currentFile : "index.html";
  window.location.replace(`http://localhost:3000/${targetFile}`);
  throw new Error("Redirecionando para o servidor local do site.");
}

let currentUser = null;

const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");

if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isAdminRole(role = currentUser?.role) {
  return adminRoles.includes(role);
}

function hasFullContentAccess() {
  return Boolean(currentUser) && currentUser.role !== "Player";
}

function pageFileName() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function unlockKey(name) {
  const userKey = currentUser?.id || currentUser?.email || "anonymous";
  return `rpg-fatec:unlock:${userKey}:${name}`;
}

function isUnlocked(name) {
  return localStorage.getItem(unlockKey(name)) === "ok";
}

function setUnlocked(name) {
  localStorage.setItem(unlockKey(name), "ok");
}

function removeUnlocked(name) {
  localStorage.removeItem(unlockKey(name));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "same-origin",
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Não foi possível completar a ação.");
  }

  return data;
}

async function loadCurrentUser() {
  try {
    const data = await apiRequest("/api/me");
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
}

function requireLoginForPrivatePage() {
  if (currentUser || publicPages.has(pageFileName())) {
    return false;
  }

  window.location.href = "login.html";
  return true;
}

function updateNavigation() {
  const authLink = document.querySelector("[data-auth-link]");
  const adminLinks = document.querySelectorAll("[data-dm-only]");
  const sessionPanel = document.querySelector("[data-session-panel]");

  adminLinks.forEach((link) => {
    link.hidden = !isAdminRole();
  });

  if (authLink) {
    authLink.textContent = currentUser ? `${currentUser.name} - Sair` : "Login";
    authLink.href = currentUser ? "#" : "login.html";
    authLink.onclick = async (event) => {
      if (!currentUser) {
        return;
      }

      event.preventDefault();
      await apiRequest("/api/logout", { method: "POST" });
      window.location.href = "index.html";
    };
  }

  if (sessionPanel) {
    sessionPanel.hidden = !currentUser;

    if (currentUser) {
      sessionPanel.innerHTML = `
        <strong>Perfil ativo:</strong>
        <span>${escapeHtml(currentUser.name)}</span>
        <span class="role-pill">${escapeHtml(currentUser.role)}</span>
      `;
    }
  }
}

async function askDmPassword(message) {
  const password = window.prompt(message);

  if (!password) {
    return false;
  }

  try {
    await apiRequest("/api/verify-dm-password", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    return true;
  } catch (error) {
    alert(error.message);
    return false;
  }
}

function createLockOverlay(text, onUnlock) {
  const overlay = document.createElement("div");
  overlay.className = "content-lock";
  overlay.innerHTML = `
    <div class="content-lock-box">
      <h3>Conteúdo bloqueado</h3>
      <p>${escapeHtml(text)}</p>
      <button class="button primary" type="button">Inserir senha</button>
    </div>
  `;

  overlay.querySelector("button").addEventListener("click", onUnlock);
  return overlay;
}

function createRelockButton(label, onRelock) {
  const button = document.createElement("button");
  button.className = "button secondary relock-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onRelock);
  return button;
}

function setupPlayerPantheonLock() {
  if (pageFileName() !== "panteao.html" || hasFullContentAccess()) {
    return;
  }

  const grid = document.querySelector(".deity-button-grid");
  const section = grid?.closest(".section");

  if (!section) {
    return;
  }

  if (isUnlocked("panteao")) {
    const hero = document.querySelector(".page-hero");

    if (hero && !hero.querySelector("[data-relock-panteao]")) {
      const actions = document.createElement("div");
      actions.className = "relock-actions";
      actions.dataset.relockPanteao = "true";
      actions.appendChild(createRelockButton("Bloquear Panteão novamente", () => {
        removeUnlocked("panteao");
        window.location.reload();
      }));
      hero.appendChild(actions);
    }

    return;
  }

  section.classList.add("restricted-section", "is-locked");
  section.appendChild(createLockOverlay("Peça a senha de um DM para visualizar o Panteão.", async () => {
    const unlocked = await askDmPassword("Digite a senha de um DM para liberar o Panteão.");

    if (!unlocked) {
      return;
    }

    setUnlocked("panteao");
    window.location.reload();
  }));
}

function setupPlayerTopicLocks() {
  if (!document.querySelector(".deity-topic-list") || hasFullContentAccess()) {
    return;
  }

  document.querySelectorAll(".deity-topic").forEach((topic) => {
    if (topic.id === "base") {
      return;
    }

    const unlockName = `topic:${pageFileName()}:${topic.id}`;

    if (isUnlocked(unlockName)) {
      const heading = topic.querySelector(".section-heading");

      if (heading && !heading.querySelector(".relock-button")) {
        heading.appendChild(createRelockButton("Bloquear novamente", () => {
          removeUnlocked(unlockName);
          window.location.reload();
        }));
      }

      return;
    }

    topic.classList.add("restricted-topic", "is-locked");
    topic.appendChild(createLockOverlay("Este tópico precisa da senha de um DM para ser revelado.", async () => {
      const unlocked = await askDmPassword("Digite a senha de um DM para liberar este tópico.");

      if (!unlocked) {
        return;
      }

      setUnlocked(unlockName);
      topic.classList.remove("is-locked");
      topic.querySelector(".content-lock")?.remove();
    }));
  });
}

function setupLogin() {
  const loginForm = document.querySelector("#loginForm");
  const signupForm = document.querySelector("#signupForm");
  const loginMessage = document.querySelector("[data-login-message]");
  const signupMessage = document.querySelector("[data-signup-message]");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      loginMessage.textContent = "Entrando...";
      loginMessage.className = "form-message";

      const formData = new FormData(loginForm);

      try {
        const data = await apiRequest("/api/login", {
          method: "POST",
          body: JSON.stringify({
            email: String(formData.get("email")),
            password: String(formData.get("password"))
          })
        });

        currentUser = data.user;
        loginMessage.textContent = "Login feito. Redirecionando...";
        loginMessage.className = "form-message success";
        window.location.href = isAdminRole(currentUser.role) ? "admin.html" : "index.html";
      } catch (error) {
        loginMessage.textContent = error.message;
        loginMessage.className = "form-message error";
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      signupMessage.textContent = "Criando perfil...";
      signupMessage.className = "form-message";

      const formData = new FormData(signupForm);

      try {
        const data = await apiRequest("/api/signup", {
          method: "POST",
          body: JSON.stringify({
            name: String(formData.get("name")),
            email: String(formData.get("email")),
            password: String(formData.get("password"))
          })
        });

        currentUser = data.user;
        signupMessage.textContent = "Perfil criado como Player.";
        signupMessage.className = "form-message success";
        window.location.href = "index.html";
      } catch (error) {
        signupMessage.textContent = error.message;
        signupMessage.className = "form-message error";
      }
    });
  }
}

async function setupAdmin() {
  const warning = document.querySelector("[data-admin-warning]");
  const panel = document.querySelector("[data-admin-panel]");
  const table = document.querySelector("[data-users-table]");

  if (!warning || !panel || !table) {
    return;
  }

  if (!isAdminRole()) {
    warning.hidden = false;
    panel.hidden = true;
    return;
  }

  warning.hidden = true;
  panel.hidden = false;
  await renderUsersTable(table);
}

function roleOptionsFor(user) {
  if (currentUser?.role === "DM") {
    return roles;
  }

  if (user.id === currentUser?.id || user.role === "DM") {
    return [user.role];
  }

  return roles.filter((role) => role !== "DM");
}

async function renderUsersTable(table) {
  const data = await apiRequest("/api/users");
  table.innerHTML = "";

  data.users.forEach((user) => {
    const row = document.createElement("tr");
    const select = document.createElement("select");
    const canAssistantEdit = currentUser?.role !== "Assistente do DM" || (user.id !== currentUser.id && user.role !== "DM");
    const availableRoles = roleOptionsFor(user);

    availableRoles.forEach((role) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      option.selected = user.role === role;
      select.appendChild(option);
    });

    select.disabled = !canAssistantEdit;
    select.title = select.disabled ? "Este cargo não pode ser alterado pelo Assistente do DM." : "";

    select.addEventListener("change", async () => {
      try {
        const data = await apiRequest(`/api/users/${encodeURIComponent(user.id)}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role: select.value })
        });

        currentUser = data.currentUser;
        updateNavigation();
        await setupAdmin();
      } catch (error) {
        alert(error.message);
        select.value = user.role;
      }
    });

    row.innerHTML = `
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="role-pill">${escapeHtml(user.role)}</span></td>
      <td></td>
      <td></td>
    `;
    row.children[3].appendChild(select);

    if (currentUser?.role === "DM" && user.id !== currentUser.id) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "button danger";
      deleteButton.type = "button";
      deleteButton.textContent = "Excluir";
      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(`Excluir o perfil de ${user.name}? Essa ação não pode ser desfeita.`);

        if (!confirmed) {
          return;
        }

        try {
          await apiRequest(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
          await renderUsersTable(table);
        } catch (error) {
          alert(error.message);
        }
      });
      row.children[4].appendChild(deleteButton);
    } else {
      row.children[4].textContent = currentUser?.role === "DM" ? "Conta atual" : "Apenas DM";
    }

    table.appendChild(row);
  });
}

async function init() {
  await loadCurrentUser();

  if (requireLoginForPrivatePage()) {
    return;
  }

  updateNavigation();
  setupLogin();
  setupPlayerPantheonLock();
  setupPlayerTopicLocks();
  await setupAdmin();
}

init();
