const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const SEED_DB_PATH = path.join(ROOT, "database.json");
const DEFAULT_PERSISTENT_DIR = "/var/data";
const DB_PATH = process.env.DATABASE_PATH
  || (fs.existsSync(DEFAULT_PERSISTENT_DIR) ? path.join(DEFAULT_PERSISTENT_DIR, "database.json") : SEED_DB_PATH);
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

const playerSeeds = [
  {
    id: "player-bea-mendes",
    name: "Bea",
    email: "bea.mendesd@gmail.com",
    role: "Player",
    passwordSalt: "6857d2974577b6600b71b7a215897176",
    passwordHash: "d0216a91eee775778834d43a4857653cee1201a2817ebf6720fbaa8fac7b5238faf6d48353601246507ad7a161922c926139c2c835f4cfdbb0b7d224e5e7279e",
    createdAt: "2026-05-19T00:00:00.000Z"
  },
  {
    id: "player-thallys",
    name: "Thallys",
    email: "thallys.1080@gmail.com",
    role: "Player",
    passwordSalt: "3a769200005cfe2b2eaccaf0ceeaf101",
    passwordHash: "96dfa9e230c11ab563cf29a83856030dfcccd3b9598d0fd5f12f9d9b7f9aa8f13919dd8d7e286fdd30b6540e26743d6d6a4898f9dd31f8b9198dcbde6294620c",
    createdAt: "2026-05-19T00:00:00.000Z"
  },
  {
    id: "player-pd340",
    name: "Pd340",
    email: "pedroarrudavicente@gmail.com",
    role: "Player",
    passwordSalt: "41f9d15f0b224cd2afea8cc8edea2047",
    passwordHash: "c3534800a08f9f3a4e5be6469592779d5ee907fc77e30e7f423fa70e69a2832331aaa40770abcfab1a3d48a83187bb4e6f0437aeb1aab12fc6ef90e1c69cc0ea",
    createdAt: "2026-05-19T00:00:00.000Z"
  },
  {
    id: "player-skullzinho",
    name: "Skullzinho",
    email: "fe.xavier501@gmail.com",
    role: "Player",
    passwordSalt: "ef8442230153a9482c4b27679fb62583",
    passwordHash: "141c17ea677eaa311f67301f056c6ce872b83dde8eab113e231975310dc03e798f6686b9b60b1388a78c363718804b8904651ad9be318bfa4125c07d27640ab0",
    createdAt: "2026-05-19T00:00:00.000Z"
  },
  {
    id: "player-bruno-borges",
    name: "Bruno Borges",
    email: "landy.borg@hotmail.com",
    role: "Player",
    passwordSalt: "58edfcab4b60c9c0453b33c97f501977",
    passwordHash: "bc5e4f4c3f93f0231b90639aad68c587956edfbe7b7f5a046b29df622c061b1d1e05d8218c343ea64ee7cb62f357ff7292c45ce44656c41d06bf1953235440b7",
    createdAt: "2026-05-19T00:00:00.000Z"
  },
  {
    id: "player-eros-quadros",
    name: "Eros Quadros",
    email: "erosquadros5@gmail.com",
    role: "Player",
    passwordSalt: "dbe90c5df1244bdd5ad5a288d60ba3fe",
    passwordHash: "a3b03547ae68bfc16602b1ef3f37f131ef840e334a4ba799dd38b7741a5f0899180fae9464f5a6db82cca4bb004d75512ac71b66704a8d3b7ecf3a319ee33b42",
    createdAt: "2026-05-19T00:00:00.000Z"
  },
  {
    id: "player-krarth",
    name: "Krarth",
    email: "arthurhrq.rodrigues@gmail.com",
    role: "Player",
    passwordSalt: "746a533314a2573a3489c350aa46ddac",
    passwordHash: "ea38b70eb7f0685625206470b4a2fee4cf7d63c9bb0f54ab72354616baa3eebeec8f288ce8487c94112fb979cb63463ffeca1e3d7e551375d2118fa91f9a0d79",
    createdAt: "2026-05-19T00:00:00.000Z"
  }
];

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
  ensureDatabaseFile();

  if (!fs.existsSync(DB_PATH)) {
    return { users: [] };
  }

  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDatabase(database) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2));
}

function ensureDatabaseFile() {
  if (fs.existsSync(DB_PATH)) {
    return;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (DB_PATH !== SEED_DB_PATH && fs.existsSync(SEED_DB_PATH)) {
    fs.copyFileSync(SEED_DB_PATH, DB_PATH);
    return;
  }

  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
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

function ensurePlayerSeeds() {
  const database = readDatabase();
  let changed = false;

  playerSeeds.forEach((seed) => {
    const existingUser = database.users.find((user) => user.email === seed.email);

    if (!existingUser) {
      database.users.push({ ...seed });
      changed = true;
      return;
    }

    ["id", "name", "email", "role", "passwordSalt", "passwordHash", "createdAt"].forEach((key) => {
      if (existingUser[key] !== seed[key]) {
        existingUser[key] = seed[key];
        changed = true;
      }
    });

    delete existingUser.password;
  });

  if (changed) {
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
    ensurePlayerSeeds();

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
        role: "Player",
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
ensurePlayerSeeds();

http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }

  serveStatic(request, response);
}).listen(PORT, () => {
  console.log(`RPG Fatec rodando em http://localhost:${PORT}`);
});
