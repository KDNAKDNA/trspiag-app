// Almacenamiento por defecto: un archivo JSON por canción.
//
// Cualquier otro almacenamiento (una base de datos de tu app) sirve si
// implementa estas cinco funciones asíncronas. "owner" es lo que devuelve
// getOwner(req): un string, o null para la colección compartida.
//
//   list(owner)                    -> [{ id, name, createdAt, updatedAt }]  (más reciente primero)
//   get(owner, id)                 -> { id, name, createdAt, updatedAt, song } | null
//   create(owner, { name, song })  -> el registro creado
//   update(owner, id, { name, song }) -> el registro actualizado | null si no existe
//   remove(owner, id)              -> true | false si no existía
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createFileStore(dir) {
  const root = path.resolve(dir);
  // el dueño nunca se usa tal cual en una ruta: se convierte en un hash
  const ownerDir = owner => path.join(root, owner == null ? "_compartido" : "u_" + crypto.createHash("sha256").update(owner).digest("hex").slice(0, 32));
  const fileOf = (owner, id) => (ID_RE.test(id) ? path.join(ownerDir(owner), id + ".json") : null);

  async function read(file) {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (err) { if (err.code === "ENOENT") return null; throw err; }
  }
  async function write(file, rec) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(rec));
    await fs.rename(tmp, file); // escritura atómica
  }
  const meta = ({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt });

  return {
    async list(owner) {
      let names;
      try { names = await fs.readdir(ownerDir(owner)); }
      catch (err) { if (err.code === "ENOENT") return []; throw err; }
      const recs = await Promise.all(names.filter(n => n.endsWith(".json")).map(n => read(path.join(ownerDir(owner), n))));
      return recs.filter(Boolean).map(meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(owner, id) {
      const file = fileOf(owner, id);
      return file ? read(file) : null;
    },
    async create(owner, { name, song }) {
      const now = new Date().toISOString();
      const rec = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, song };
      await write(fileOf(owner, rec.id), rec);
      return rec;
    },
    async update(owner, id, { name, song }) {
      const file = fileOf(owner, id);
      const prev = file && await read(file);
      if (!prev) return null;
      const rec = { ...prev, name, song, updatedAt: new Date().toISOString() };
      await write(file, rec);
      return rec;
    },
    async remove(owner, id) {
      const file = fileOf(owner, id);
      if (!file) return false;
      try { await fs.unlink(file); return true; }
      catch (err) { if (err.code === "ENOENT") return false; throw err; }
    },
  };
}

module.exports = { createFileStore };
