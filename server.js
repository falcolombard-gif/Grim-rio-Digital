const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "database.json");
const SESSION_COOKIE = "rpg_fatec_session";
const roles = ["DM", "Assistente do DM", "Player", "Outsider"];
const adminRoles = ["DM", "Assistente do DM"];
const sessions = new Map();
const publicPages = new Set(["/index.html", "/login.html"]);

const dmSeed = {
  id: "dm-principal",
  name: "Dungeon Master",
  email: "dm@gmail.com",
  password: "DungeonM@ster123",
  role: "DM"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = createPasswordHash(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function readDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return { users: [] };
  }

  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDatabase(database) {
  fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function ensureDmUser() {
  const database = readDatabase();
  const existingDm = database.users.find((user) => user.email === dmSeed.email);
  const legacyDm = database.users.find((user) => user.email === "mestre@rpg.local");

  if (legacyDm && !existingDm) {
    legacyDm.email = dmSeed.email;
    legacyDm.name = dmSeed.name;
    legacyDm.role = "DM";
    const password = createPasswordHash(dmSeed.password);
    legacyDm.passwordSalt = password.salt;
    legacyDm.passwordHash = password.hash;
    delete legacyDm.password;
    writeDatabase(database);
    return;
  }

  if (!existingDm) {
    const password = createPasswordHash(dmSeed.password);
    database.users.unshift({
      id: dmSeed.id,
      name: dmSeed.name,
      email: dmSeed.email,
      role: dmSeed.role,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      createdAt: new Date().toISOString()
    });
    writeDatabase(database);
    return;
  }

  if (existingDm.role !== "DM" || existingDm.password || !existingDm.passwordHash) {
    const password = createPasswordHash(dmSeed.password);
    existingDm.role = "DM";
    existingDm.passwordSalt = password.salt;
    existingDm.passwordHash = password.hash;
    delete existingDm.password;
    writeDatabase(database);
  }
}

function getCookie(request, name) {
  const cookie = request.headers.cookie || "";
  const parts = cookie.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function getCurrentUser(request) {
  const token = getCookie(request, SESSION_COOKIE);
  const userId = token ? sessions.get(token) : null;

  if (!userId) {
    return null;
  }

  return readDatabase().users.find((user) => user.id === userId) || null;
}

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(data));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requireDm(request, response) {
  const currentUser = getCurrentUser(request);

  if (!currentUser || currentUser.role !== "DM") {
    sendJson(response, 403, { error: "Apenas o DM pode acessar esta área." });
    return null;
  }

  return currentUser;
}

function requireAdminManager(request, response) {
  const currentUser = getCurrentUser(request);

  if (!currentUser || !adminRoles.includes(currentUser.role)) {
    sendJson(response, 403, { error: "Apenas o DM e o Assistente do DM podem acessar esta área." });
    return null;
  }

  return currentUser;
}

async function handleApi(request, response) {
  try {
    if (request.method === "GET" && request.url === "/api/me") {
      const currentUser = getCurrentUser(request);
      sendJson(response, 200, { user: currentUser ? publicUser(currentUser) : null });
      return;
    }

    if (request.method === "POST" && request.url === "/api/logout") {
      const token = getCookie(request, SESSION_COOKIE);

      if (token) {
        sessions.delete(token);
      }

      sendJson(response, 200, { ok: true }, {
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/login") {
      const body = await parseBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = readDatabase().users.find((item) => item.email === email);

      if (!user || !verifyPassword(password, user)) {
        sendJson(response, 401, { error: "Email ou senha incorretos." });
        return;
      }

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, user.id);
      sendJson(response, 200, { user: publicUser(user) }, {
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/signup") {
      const body = await parseBody(request);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!name || !email || password.length < 4) {
        sendJson(response, 400, { error: "Preencha nome, email e uma senha com pelo menos 4 caracteres." });
        return;
      }

      const database = readDatabase();

      if (database.users.some((user) => user.email === email)) {
        sendJson(response, 409, { error: "Já existe um perfil com esse email." });
        return;
      }

      const passwordData = createPasswordHash(password);
      const newUser = {
        id: crypto.randomUUID(),
        name,
        email,
        role: "Outsider",
        passwordSalt: passwordData.salt,
        passwordHash: passwordData.hash,
        createdAt: new Date().toISOString()
      };

      database.users.push(newUser);
      writeDatabase(database);

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, newUser.id);
      sendJson(response, 201, { user: publicUser(newUser) }, {
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/verify-dm-password") {
      const currentUser = getCurrentUser(request);

      if (!currentUser) {
        sendJson(response, 401, { error: "Faça login para desbloquear este conteúdo." });
        return;
      }

      const body = await parseBody(request);
      const password = String(body.password || "");
      const dmUsers = readDatabase().users.filter((user) => user.role === "DM");
      const isValid = dmUsers.some((user) => verifyPassword(password, user));

      if (!isValid) {
        sendJson(response, 401, { error: "Senha do DM incorreta." });
        return;
      }

      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && request.url === "/api/users") {
      if (!requireAdminManager(request, response)) {
        return;
      }

      const users = readDatabase().users.map(publicUser);
      sendJson(response, 200, { users });
      return;
    }

    const roleMatch = request.url.match(/^\/api\/users\/([^/]+)\/role$/);

    if (request.method === "PATCH" && roleMatch) {
      const currentUser = requireAdminManager(request, response);

      if (!currentUser) {
        return;
      }

      const userId = decodeURIComponent(roleMatch[1]);
      const body = await parseBody(request);
      const role = String(body.role || "");

      if (!roles.includes(role)) {
        sendJson(response, 400, { error: "Cargo inválido." });
        return;
      }

      const database = readDatabase();
      const user = database.users.find((item) => item.id === userId);

      if (!user) {
        sendJson(response, 404, { error: "Perfil não encontrado." });
        return;
      }

      if (currentUser.role === "Assistente do DM") {
        if (user.id === currentUser.id) {
          sendJson(response, 403, { error: "O Assistente do DM não pode alterar o próprio cargo." });
          return;
        }

        if (user.role === "DM") {
          sendJson(response, 403, { error: "O Assistente do DM não pode alterar contas de DM." });
          return;
        }

        if (role === "DM") {
          sendJson(response, 403, { error: "O Assistente do DM não pode promover ninguém para DM." });
          return;
        }
      }

      user.role = role;
      writeDatabase(database);
      const refreshedCurrentUser = database.users.find((item) => item.id === currentUser.id);
      sendJson(response, 200, {
        user: publicUser(user),
        currentUser: publicUser(refreshedCurrentUser)
      });
      return;
    }

    const deleteUserMatch = request.url.match(/^\/api\/users\/([^/]+)$/);

    if (request.method === "DELETE" && deleteUserMatch) {
      const currentUser = requireDm(request, response);

      if (!currentUser) {
        return;
      }

      const userId = decodeURIComponent(deleteUserMatch[1]);

      if (userId === currentUser.id) {
        sendJson(response, 403, { error: "O DM não pode excluir a própria conta enquanto está logado." });
        return;
      }

      const database = readDatabase();
      const userIndex = database.users.findIndex((item) => item.id === userId);

      if (userIndex === -1) {
        sendJson(response, 404, { error: "Perfil não encontrado." });
        return;
      }

      const user = database.users[userIndex];

      if (user.email === dmSeed.email) {
        sendJson(response, 403, { error: "O perfil principal do DM não pode ser excluído." });
        return;
      }

      database.users.splice(userIndex, 1);
      writeDatabase(database);
      sendJson(response, 200, { ok: true, deletedUser: publicUser(user) });
      return;
    }

    sendJson(response, 404, { error: "Rota não encontrada." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Erro interno do servidor." });
  }
}

function serveStatic(request, response) {
  const requestedUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestedUrl.pathname === "/" ? "/index.html" : requestedUrl.pathname;
  const filePath = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  const extension = path.extname(filePath).toLowerCase();

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Acesso negado");
    return;
  }

  if (extension === ".html" && !publicPages.has(pathname) && !getCurrentUser(request)) {
    response.writeHead(302, { Location: "/login.html" });
    response.end();
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Arquivo não encontrado");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream"
    });
    response.end(content);
  });
}

ensureDmUser();

http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }

  serveStatic(request, response);
}).listen(PORT, () => {
  console.log(`RPG Fatec rodando em http://localhost:${PORT}`);
});
